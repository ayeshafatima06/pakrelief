import assert from 'node:assert/strict';
import { once } from 'node:events';
import { AddressInfo } from 'node:net';
import { test } from 'node:test';
import express from 'express';
import { UserProfile } from '../src/types';
import { createAuthMiddleware } from '../src/server/authMiddleware';
import { createRegistrationRouter } from '../src/server/registrationRoutes';
import type { FirebaseAuthAccount } from '../src/server/adminAuthService';
import {
  buildRegistrationRecords,
  maskEmail,
  planRegistration,
  RegistrationRecords,
  RegistrationState,
  RunRegistration
} from '../src/server/registrationService';

const NGO_UID = 'uid-existing-ngo';
const NGO_EMAIL = 'ngo.owner@example.test';
const OTHER_UID = 'uid-other-user';

type Doc = Record<string, any>;

/** In-memory stand-in for Firestore that applies the same plan + create-only semantics as runRegistrationTransaction. */
function createStore() {
  const docs = new Map<string, Doc>();
  const state = { failNext: false, concurrentCreate: false, writes: 0 };

  const runRegistration: RunRegistration = async (records, mode, commit) => {
    if (state.failNext) {
      state.failNext = false;
      throw Object.assign(new Error('Could not load the default credentials.'), { code: 'app/invalid-credential' });
    }
    const userPath = `users/${records.uid}`;
    const idPath = `identifierMappings/${records.identifierKey}`;
    const emailPath = records.emailMapping ? `identifierMappings/${records.emailKey}` : null;
    const entityPath = records.entity ? `${records.entity.collection}/${records.uid}` : null;
    const read = (p: string | null) => (p && docs.has(p) ? { ...docs.get(p)!, id: p.split('/')[1] } : null);
    const inCollection = (collection: string): Array<Doc & { id: string }> => [...docs.entries()]
      .filter(([p]) => p.startsWith(`${collection}/`))
      .map(([p, data]) => ({ ...data, id: p.split('/')[1] }));

    const snapshot: RegistrationState = {
      userDoc: read(userPath) as RegistrationState['userDoc'],
      identifierMapping: read(idPath) as RegistrationState['identifierMapping'],
      emailMapping: read(emailPath) as RegistrationState['emailMapping'],
      entityDoc: read(entityPath) as RegistrationState['entityDoc'],
      usersWithEmail: inCollection('users').filter(u => u.email === records.email),
      entitiesWithIdentifier: records.entity
        ? inCollection(records.entity.collection).filter(e => e[records.entity!.identifierField] === records.identifier)
        : []
    };
    const plan = planRegistration(snapshot, records, mode);
    if (!commit) return plan;

    const writes: Array<[string, Doc]> = [];
    for (const kind of plan.toCreate) {
      if (kind === 'profile') writes.push([userPath, records.profile]);
      if (kind === 'identifierMapping') writes.push([idPath, records.identifierMapping]);
      if (kind === 'emailMapping' && emailPath) writes.push([emailPath, records.emailMapping!]);
      if (kind === 'entity' && entityPath) writes.push([entityPath, records.entity!.record]);
    }
    if (state.concurrentCreate) {
      // Another request created the identifier between read and commit: tx.create fails, nothing is applied.
      throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
    }
    for (const [p, data] of writes) {
      assert.equal(docs.has(p), false, `create-only semantics violated for ${p}`);
    }
    for (const [p, data] of writes) docs.set(p, structuredClone(data));
    state.writes += writes.length;
    return plan;
  };

  return { docs, state, runRegistration };
}

const tokens: Record<string, { uid: string; email: string }> = {
  'token-ngo': { uid: NGO_UID, email: NGO_EMAIL },
  'token-other': { uid: OTHER_UID, email: 'other@example.test' }
};

async function withServer(
  options: {
    authAccounts?: Record<string, FirebaseAuthAccount | null>;
    authLookupFails?: boolean;
    recoveryUids?: string[];
    seed?: Record<string, Doc>;
  },
  action: (ctx: {
    post: (path: string, body: unknown, token?: string) => Promise<{ status: number; data: any }>;
    store: ReturnType<typeof createStore>;
    claims: string[];
  }) => Promise<void>
): Promise<void> {
  const store = createStore();
  for (const [p, data] of Object.entries(options.seed || {})) store.docs.set(p, data);
  const claims: string[] = [];
  const silent = { info: () => undefined, warn: () => undefined, error: () => undefined };
  const auth = createAuthMiddleware({
    verifyToken: async token => tokens[token] || null,
    getUserById: async uid => (store.docs.get(`users/${uid}`) as UserProfile | undefined) || null,
    isAdminUid: () => false
  });
  const app = express();
  app.use(express.json());
  app.use('/api', createRegistrationRouter({
    requireFirebaseIdentity: auth.requireFirebaseIdentity,
    runRegistration: store.runRegistration,
    getAuthAccount: async uid => {
      if (options.authLookupFails) throw Object.assign(new Error('credential failure'), { code: 'app/invalid-credential' });
      const accounts = options.authAccounts || { [NGO_UID]: { uid: NGO_UID, email: NGO_EMAIL, disabled: false } };
      return accounts[uid] ?? null;
    },
    isRecoveryAllowedUid: uid => (options.recoveryUids || [NGO_UID]).includes(uid),
    onRegistered: async records => { claims.push(records.uid); },
    now: () => 1_700_000_000_000,
    logger: silent
  }));
  const server = app.listen(0);
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = async (path: string, body: unknown, token?: string) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body)
    });
    return { status: response.status, data: await response.json() };
  };
  try {
    await action({ post, store, claims });
  } finally {
    server.close();
  }
}

const ngoSignup = {
  email: NGO_EMAIL,
  name: 'Helping Hands Trust',
  role: 'ngo',
  identifier: '24017',
  contact: '+92 300 0000000',
  focalPerson: 'Focal Person',
  registrationType: 'Trust',
  address: 'Karachi'
};

const recovery = { ...ngoSignup, expectedEmail: NGO_EMAIL };

test('register-profile uses the verified UID for profile, both mappings, and NGO ownership', async () => {
  await withServer({}, async ({ post, store }) => {
    // Body uid is omitted entirely: ownership must still come from the verified token.
    const res = await post('/api/auth/register-profile', ngoSignup, 'token-ngo');
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(store.docs.get(`users/${NGO_UID}`)?.id, NGO_UID);
    assert.equal(store.docs.get(`users/${NGO_UID}`)?.firebaseUid, NGO_UID);
    assert.equal(store.docs.get('identifierMappings/24017')?.userId, NGO_UID);
    assert.equal(store.docs.get(`identifierMappings/${NGO_EMAIL}`)?.userId, NGO_UID);
    assert.equal(store.docs.get(`ngos/${NGO_UID}`)?.id, NGO_UID);
    assert.equal(store.docs.get(`ngos/${NGO_UID}`)?.linkedUserId, NGO_UID);
    assert.equal(store.docs.get(`ngos/${NGO_UID}`)?.status, 'pending');
    for (const data of store.docs.values()) {
      assert.equal(Object.values(data).includes(undefined), false, 'Firestore rejects undefined fields');
    }
  });
});

test('register-profile rejects a body uid or email that differs from the verified token', async () => {
  await withServer({}, async ({ post, store }) => {
    const uidMismatch = await post('/api/auth/register-profile', { ...ngoSignup, uid: OTHER_UID }, 'token-ngo');
    assert.equal(uidMismatch.status, 403);
    const emailMismatch = await post('/api/auth/register-profile', { ...ngoSignup, email: 'attacker@example.test' }, 'token-ngo');
    assert.equal(emailMismatch.status, 403);
    assert.equal(store.docs.size, 0);
  });
});

test('register-profile requires a valid Firebase token', async () => {
  await withServer({}, async ({ post, store }) => {
    assert.equal((await post('/api/auth/register-profile', ngoSignup)).status, 401);
    assert.equal((await post('/api/auth/register-profile', ngoSignup, 'forged-token')).status, 401);
    assert.equal(store.docs.size, 0);
  });
});

test('register-profile refuses identifiers or registration numbers owned by another user and writes nothing', async () => {
  const otherMapping = { identifier: '24017', email: 'other@example.test', role: 'ngo', userId: OTHER_UID };
  await withServer({ seed: { 'identifierMappings/24017': otherMapping } }, async ({ post, store }) => {
    const res = await post('/api/auth/register-profile', ngoSignup, 'token-ngo');
    assert.equal(res.status, 409);
    assert.equal(res.data.code, 'identifier_taken');
    assert.equal(store.docs.has(`users/${NGO_UID}`), false, 'no partial profile is left behind');
    assert.deepEqual(store.docs.get('identifierMappings/24017'), otherMapping, 'other user mapping untouched');
  });

  const legacyNgo = { id: 'legacy-ngo', linkedUserId: 'legacy-ngo', registrationNumber: '24017' };
  await withServer({ seed: { 'ngos/legacy-ngo': legacyNgo } }, async ({ post, store }) => {
    const res = await post('/api/auth/register-profile', ngoSignup, 'token-ngo');
    assert.equal(res.status, 409);
    assert.equal(res.data.code, 'registration_number_taken');
    assert.equal(store.docs.size, 1);
  });

  const otherEmailMapping = { identifier: NGO_EMAIL, email: NGO_EMAIL, role: 'donor', userId: OTHER_UID };
  await withServer({ seed: { [`identifierMappings/${NGO_EMAIL}`]: otherEmailMapping } }, async ({ post }) => {
    const res = await post('/api/auth/register-profile', ngoSignup, 'token-ngo');
    assert.equal(res.status, 409);
    assert.equal(res.data.code, 'email_taken');
  });
});

test('register-profile repeat submission does not overwrite the existing profile', async () => {
  await withServer({}, async ({ post, store }) => {
    assert.equal((await post('/api/auth/register-profile', ngoSignup, 'token-ngo')).status, 200);
    const before = structuredClone(Object.fromEntries(store.docs));
    const repeat = await post('/api/auth/register-profile', { ...ngoSignup, name: 'Renamed' }, 'token-ngo');
    assert.equal(repeat.status, 409);
    assert.equal(repeat.data.code, 'profile_exists');
    assert.deepEqual(Object.fromEntries(store.docs), before);
  });
});

test('register-profile reports storage failures and concurrent claims without claiming success', async () => {
  await withServer({}, async ({ post, store }) => {
    store.state.failNext = true;
    const failed = await post('/api/auth/register-profile', ngoSignup, 'token-ngo');
    assert.equal(failed.status, 503);
    assert.equal(failed.data.success, false);
    assert.match(failed.data.error, /Firebase sign-in account is safe/);
    assert.equal(store.docs.size, 0);

    store.state.concurrentCreate = true;
    const raced = await post('/api/auth/register-profile', ngoSignup, 'token-ngo');
    assert.equal(raced.status, 409);
    assert.equal(raced.data.code, 'concurrent_registration');
    assert.equal(store.docs.size, 0);
  });
});

test('register-profile rejects identifiers that are unsafe Firestore document IDs', async () => {
  await withServer({}, async ({ post, store }) => {
    const res = await post('/api/auth/register-profile', { ...ngoSignup, identifier: 'users/admin' }, 'token-ngo');
    assert.equal(res.status, 400);
    assert.equal(store.docs.size, 0);
  });
});

test('recover-profile is disabled unless the verified UID is allowlisted', async () => {
  await withServer({ recoveryUids: [] }, async ({ post, store }) => {
    const res = await post('/api/auth/recover-profile', { ...recovery, confirm: true }, 'token-ngo');
    assert.equal(res.status, 403);
    assert.equal(store.docs.size, 0);
  });
});

test('recover-profile requires a valid token, a matching confirmed email, and a matching Firebase Auth account', async () => {
  await withServer({}, async ({ post, store }) => {
    assert.equal((await post('/api/auth/recover-profile', { ...recovery, confirm: true })).status, 401);
    assert.equal((await post('/api/auth/recover-profile', { ...recovery, expectedEmail: undefined, confirm: true }, 'token-ngo')).status, 403);
    assert.equal((await post('/api/auth/recover-profile', { ...recovery, expectedEmail: 'other@example.test', confirm: true }, 'token-ngo')).status, 403);
    assert.equal((await post('/api/auth/recover-profile', { ...recovery, uid: OTHER_UID, confirm: true }, 'token-ngo')).status, 403);
    // Another allowlisted-but-different user cannot recover this account's records with their own token.
    assert.equal((await post('/api/auth/recover-profile', { ...recovery, confirm: true }, 'token-other')).status, 403);
    assert.equal(store.docs.size, 0);
  });

  const mismatchedAccounts = [
    { [NGO_UID]: null },
    { [NGO_UID]: { uid: NGO_UID, email: 'changed@example.test', disabled: false } },
    { [NGO_UID]: { uid: NGO_UID, email: NGO_EMAIL, disabled: true } }
  ];
  for (const authAccounts of mismatchedAccounts) {
    await withServer({ authAccounts }, async ({ post, store }) => {
      assert.equal((await post('/api/auth/recover-profile', { ...recovery, confirm: true }, 'token-ngo')).status, 403);
      assert.equal(store.docs.size, 0);
    });
  }

  await withServer({ authLookupFails: true }, async ({ post, store }) => {
    assert.equal((await post('/api/auth/recover-profile', { ...recovery, confirm: true }, 'token-ngo')).status, 503);
    assert.equal(store.docs.size, 0);
  });
});

test('recover-profile requires complete NGO details instead of inventing them', async () => {
  await withServer({}, async ({ post, store }) => {
    for (const field of ['name', 'registrationType', 'focalPerson', 'contact', 'address']) {
      const res = await post('/api/auth/recover-profile', { ...recovery, [field]: '', confirm: true }, 'token-ngo');
      assert.equal(res.status, 400, `${field} must be required`);
    }
    assert.equal(store.docs.size, 0);
  });
});

test('recover-profile dry run writes nothing, then confirm creates only missing records once', async () => {
  await withServer({}, async ({ post, store, claims }) => {
    const dryRun = await post('/api/auth/recover-profile', recovery, 'token-ngo');
    assert.equal(dryRun.status, 200);
    assert.equal(dryRun.data.dryRun, true);
    assert.deepEqual(dryRun.data.wouldCreate, ['profile', 'identifierMapping', 'emailMapping', 'entity']);
    assert.equal(dryRun.data.preview.entity.linkedUserId, NGO_UID);
    assert.equal(store.docs.size, 0);

    const committed = await post('/api/auth/recover-profile', { ...recovery, confirm: true }, 'token-ngo');
    assert.equal(committed.status, 200);
    assert.deepEqual(committed.data.created, ['profile', 'identifierMapping', 'emailMapping', 'entity']);
    assert.equal(store.docs.get('identifierMappings/24017')?.userId, NGO_UID);
    assert.equal(store.docs.get(`ngos/${NGO_UID}`)?.status, 'pending', 'admin approval is still required');
    assert.deepEqual(claims, [NGO_UID], 'post-commit hook runs once, only after a real commit');

    const writesAfterFirst = store.state.writes;
    const repeat = await post('/api/auth/recover-profile', { ...recovery, confirm: true }, 'token-ngo');
    assert.equal(repeat.status, 200);
    assert.equal(repeat.data.alreadyComplete, true);
    assert.equal(store.state.writes, writesAfterFirst);
    assert.deepEqual(claims, [NGO_UID]);
  });
});

test('recover-profile fills only the missing pieces of a partial registration', async () => {
  const profile = buildRegistrationRecords(recovery, { uid: NGO_UID, email: NGO_EMAIL }, { now: 1, requireCompleteDetails: true }).profile;
  await withServer({ seed: { [`users/${NGO_UID}`]: profile } }, async ({ post, store }) => {
    const res = await post('/api/auth/recover-profile', { ...recovery, confirm: true }, 'token-ngo');
    assert.equal(res.status, 200);
    assert.deepEqual(res.data.existing, ['profile']);
    assert.deepEqual(res.data.created, ['identifierMapping', 'emailMapping', 'entity']);
    assert.equal(store.docs.get(`users/${NGO_UID}`)?.createdAt, 1, 'existing profile is not overwritten');
  });

  await withServer({ seed: { [`users/${NGO_UID}`]: { ...profile, identifier: '99999' } } }, async ({ post, store }) => {
    const res = await post('/api/auth/recover-profile', { ...recovery, confirm: true }, 'token-ngo');
    assert.equal(res.status, 409);
    assert.equal(res.data.code, 'profile_mismatch');
    assert.equal(store.docs.size, 1);
  });
});

test('recover-profile never takes over a registration number mapped to another account', async () => {
  const otherMapping = { identifier: '24017', email: 'other@example.test', role: 'ngo', userId: OTHER_UID };
  await withServer({ seed: { 'identifierMappings/24017': otherMapping } }, async ({ post, store }) => {
    const res = await post('/api/auth/recover-profile', { ...recovery, confirm: true }, 'token-ngo');
    assert.equal(res.status, 409);
    assert.equal(res.data.code, 'identifier_taken');
    assert.equal(store.docs.size, 1);
  });
});

test('identifier equal to email produces one mapping and masked logging hides the email', () => {
  const records: RegistrationRecords = buildRegistrationRecords(
    { role: 'donor', identifier: 'Donor@Example.test' },
    { uid: 'donor-uid', email: 'donor@example.test' },
    { now: 1, requireCompleteDetails: false }
  );
  assert.equal(records.emailMapping, null);
  assert.equal(records.entity, null);
  assert.equal(maskEmail('tualeya@gmail.com'), 't*****a@gmail.com');
});
