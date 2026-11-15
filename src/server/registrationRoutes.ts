import express, { RequestHandler, Response } from 'express';
import type { AuthenticatedRequest } from './authMiddleware';
import type { FirebaseAuthAccount } from './adminAuthService';
import {
  buildRegistrationRecords,
  maskEmail,
  normalizeEmail,
  RegistrationConflictError,
  RegistrationRecords,
  RegistrationValidationError,
  RunRegistration,
  VerifiedIdentity
} from './registrationService';

type Logger = Pick<Console, 'info' | 'warn' | 'error'>;

export interface RegistrationRouterDependencies {
  /** Verifies the Firebase ID token only; must NOT require an existing profile (that is what is missing). */
  requireFirebaseIdentity: RequestHandler;
  runRegistration: RunRegistration;
  /** Read-only Firebase Auth lookup used to confirm the account before recovery writes. */
  getAuthAccount: (uid: string) => Promise<FirebaseAuthAccount | null>;
  /** Recovery is disabled unless the verified UID is explicitly allowlisted on the server. */
  isRecoveryAllowedUid: (uid: string) => boolean;
  /** Optional post-commit hook (e.g. donor custom claim). Failures are logged, never fatal. */
  onRegistered?: (records: RegistrationRecords) => Promise<void>;
  now?: () => number;
  logger?: Logger;
}

const PENDING_MESSAGE = 'Registration submitted! Your statutory documents are awaiting NDMA Admin approval.';
const ACTIVE_MESSAGE = 'Account registered and verified successfully.';
const ACCOUNT_SAFE_NOTE = 'Your Firebase sign-in account is safe and was not changed.';

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  return code === undefined ? 'unknown' : String(code);
}

/** Firestore ALREADY_EXISTS (gRPC 6): a document was created concurrently between read and commit. */
function isAlreadyExists(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  return code === 6 || code === 'already-exists' || code === 'ALREADY_EXISTS';
}

function getVerifiedIdentity(req: AuthenticatedRequest): VerifiedIdentity | null {
  const uid = req.user?.uid;
  const email = req.user?.email;
  if (!uid || !email) return null;
  return { uid, email: normalizeEmail(email) };
}

/** Body identity fields are only ever compared against the verified identity, never trusted. */
function bodyIdentityMatches(body: Record<string, unknown>, verified: VerifiedIdentity): boolean {
  if (body.uid !== undefined && body.uid !== verified.uid) return false;
  if (body.email !== undefined && (typeof body.email !== 'string' || normalizeEmail(body.email) !== verified.email)) return false;
  return true;
}

export function createRegistrationRouter(dependencies: RegistrationRouterDependencies) {
  const router = express.Router();
  const log = dependencies.logger || console;
  const now = dependencies.now || Date.now;

  const runPostCommitHook = async (records: RegistrationRecords, route: string) => {
    if (!dependencies.onRegistered) return;
    try {
      await dependencies.onRegistered(records);
    } catch (error) {
      log.warn(`[PakRelief][registration] ${route} post-commit hook failed uid=${records.uid} code=${errorCode(error)}`);
    }
  };

  const handleFailure = (res: Response, route: string, identity: VerifiedIdentity, error: unknown) => {
    const who = `uid=${identity.uid} email=${maskEmail(identity.email)}`;
    if (error instanceof RegistrationValidationError) {
      log.warn(`[PakRelief][registration] ${route} rejected (validation) ${who}: ${error.message}`);
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    if (error instanceof RegistrationConflictError) {
      log.warn(`[PakRelief][registration] ${route} rejected (conflict=${error.code}) ${who}`);
      res.status(409).json({ success: false, code: error.code, error: error.message });
      return;
    }
    if (isAlreadyExists(error)) {
      log.warn(`[PakRelief][registration] ${route} rejected (concurrent create) ${who}`);
      res.status(409).json({
        success: false,
        code: 'concurrent_registration',
        error: 'This identifier was registered by another request at the same time. Nothing was changed; please retry or contact support.'
      });
      return;
    }
    // Never log the request body: it may contain personal data. Code + message is enough to diagnose.
    log.error(`[PakRelief][registration] ${route} failed ${who} code=${errorCode(error)}`, (error as Error)?.message || '');
    res.status(503).json({
      success: false,
      error: `The PakRelief profile could not be saved right now, so nothing was written. ${ACCOUNT_SAFE_NOTE} Please do not sign up again; try again later or contact support.`
    });
  };

  // Normal sign-up: called immediately after createUserWithEmailAndPassword on the client.
  router.post('/auth/register-profile', dependencies.requireFirebaseIdentity, async (req: AuthenticatedRequest, res: Response) => {
    const route = 'register-profile';
    const identity = getVerifiedIdentity(req);
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    if (!identity || !bodyIdentityMatches(body, identity)) {
      log.warn(`[PakRelief][registration] ${route} rejected (identity mismatch) uid=${req.user?.uid || '<none>'}`);
      res.status(403).json({ success: false, error: 'Registration identity must match the verified Firebase account.' });
      return;
    }

    try {
      const records = buildRegistrationRecords(body, identity, { now: now(), requireCompleteDetails: false });
      const plan = await dependencies.runRegistration(records, 'register', true);
      log.info(`[PakRelief][registration] ${route} committed uid=${identity.uid} email=${maskEmail(identity.email)} role=${records.role} created=${plan.toCreate.join(',')}`);
      await runPostCommitHook(records, route);
      res.json({
        success: true,
        user: records.profile,
        message: records.profile.verificationStatus === 'pending' ? PENDING_MESSAGE : ACTIVE_MESSAGE
      });
    } catch (error) {
      handleFailure(res, route, identity, error);
    }
  });

  // Repair for an EXISTING Firebase account whose Firestore records are missing.
  // Dry-run by default: nothing is written unless the body contains confirm: true.
  router.post('/auth/recover-profile', dependencies.requireFirebaseIdentity, async (req: AuthenticatedRequest, res: Response) => {
    const route = 'recover-profile';
    const identity = getVerifiedIdentity(req);
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    if (!identity) {
      res.status(403).json({ success: false, error: 'The verified Firebase token has no email address.' });
      return;
    }

    if (!dependencies.isRecoveryAllowedUid(identity.uid)) {
      log.warn(`[PakRelief][registration] ${route} rejected (not allowlisted) uid=${identity.uid}`);
      res.status(403).json({ success: false, error: 'Profile recovery is not enabled for this account. Contact NDMA support.' });
      return;
    }

    const expectedEmail = typeof body.expectedEmail === 'string' ? normalizeEmail(body.expectedEmail) : '';
    if (!expectedEmail || expectedEmail !== identity.email || !bodyIdentityMatches(body, identity)) {
      log.warn(`[PakRelief][registration] ${route} rejected (email mismatch) uid=${identity.uid}`);
      res.status(403).json({ success: false, error: 'The confirmed email does not match the signed-in Firebase account.' });
      return;
    }

    let account: FirebaseAuthAccount | null;
    try {
      account = await dependencies.getAuthAccount(identity.uid);
    } catch (error) {
      log.error(`[PakRelief][registration] ${route} could not read Firebase Auth account uid=${identity.uid} code=${errorCode(error)}`);
      res.status(503).json({ success: false, error: `Firebase account verification is unavailable. ${ACCOUNT_SAFE_NOTE}` });
      return;
    }
    if (!account || account.uid !== identity.uid || !account.email || normalizeEmail(account.email) !== identity.email || account.disabled) {
      log.warn(`[PakRelief][registration] ${route} rejected (auth account mismatch) uid=${identity.uid}`);
      res.status(403).json({ success: false, error: 'The Firebase account could not be confirmed for recovery.' });
      return;
    }

    const commit = body.confirm === true;
    try {
      const records = buildRegistrationRecords(body, identity, { now: now(), requireCompleteDetails: true });
      const plan = await dependencies.runRegistration(records, 'recover', commit);
      const alreadyComplete = plan.toCreate.length === 0;
      log.info(`[PakRelief][registration] ${route} ${commit ? 'committed' : 'dry-run'} uid=${identity.uid} email=${maskEmail(identity.email)} role=${records.role} ${commit ? 'created' : 'wouldCreate'}=${plan.toCreate.join(',') || '-'} existing=${plan.existing.join(',') || '-'}`);
      if (commit && !alreadyComplete) await runPostCommitHook(records, route);
      res.json({
        success: true,
        dryRun: !commit,
        alreadyComplete,
        uid: identity.uid,
        email: identity.email,
        [commit ? 'created' : 'wouldCreate']: plan.toCreate,
        existing: plan.existing,
        preview: commit ? undefined : {
          profile: records.profile,
          identifierMapping: records.identifierMapping,
          emailMapping: records.emailMapping,
          entity: records.entity?.record || null
        },
        message: commit
          ? (alreadyComplete ? 'All PakRelief records already exist. Nothing was changed.' : `Missing PakRelief records were created. ${ACCOUNT_SAFE_NOTE}`)
          : 'Dry run only. Nothing was written. Re-send with confirm: true to create the missing records.'
      });
    } catch (error) {
      handleFailure(res, route, identity, error);
    }
  });

  return router;
}
