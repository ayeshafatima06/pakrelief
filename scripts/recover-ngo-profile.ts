/**
 * PakRelief: supervised recovery of missing Firestore records for an EXISTING Firebase NGO account.
 *
 * What it does (and does not do):
 *  - Signs in to the existing Firebase Auth account with its current email + password to obtain a
 *    short-lived ID token, held in memory only. It never prints, stores, or logs the token or password.
 *  - Never creates, deletes, or modifies the Firebase Auth account, its UID, email, or password.
 *  - Calls POST /api/auth/recover-profile as a DRY RUN first and shows exactly what would be created.
 *  - Writes only after you type CONFIRM. The server then creates only the missing documents in one
 *    Firestore transaction and refuses if any record belongs to another user.
 *
 * Prerequisites: the PakRelief server is running with working Firebase Admin credentials and
 * PAKRELIEF_RECOVERY_UIDS contains the account's UID.
 *
 * Usage (PowerShell or cmd recommended so the password prompt stays hidden):
 *   npx tsx scripts/recover-ngo-profile.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

interface SignInResponse {
  idToken?: string;
  localId?: string;
  email?: string;
  error?: { message?: string };
}

const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(readFileSync(configPath, 'utf8')) as { apiKey: string; projectId: string };

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
let muted = false;
const rlOutput = rl as unknown as { _writeToOutput: (text: string) => void };
const writeToOutput = rlOutput._writeToOutput.bind(rl);
rlOutput._writeToOutput = (text: string) => {
  if (!muted) writeToOutput(text);
};

function ask(question: string, fallback = ''): Promise<string> {
  const suffix = fallback ? ` [${fallback}]` : '';
  return new Promise(resolve => rl.question(`${question}${suffix}: `, answer => resolve(answer.trim() || fallback)));
}

function askHidden(question: string): Promise<string> {
  return new Promise(resolve => {
    process.stdout.write(`${question} (hidden): `);
    muted = true;
    rl.question('', answer => {
      muted = false;
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function askRequired(question: string, fallback = ''): Promise<string> {
  for (;;) {
    const answer = await ask(question, fallback);
    if (answer) return answer;
    console.log('  This value is required. PakRelief will not invent organization details.');
  }
}

async function postJson(url: string, token: string, body: unknown): Promise<{ status: number; data: any }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({ success: false, error: `HTTP ${response.status} (non-JSON response)` }));
  return { status: response.status, data };
}

async function main(): Promise<void> {
  console.log('PakRelief existing-account profile recovery');
  console.log('This will NOT create, delete, or change your Firebase account or password.\n');

  const serverUrl = (await ask('PakRelief server URL', 'http://localhost:3000')).replace(/\/+$/, '');
  const email = (await askRequired('Existing account email')).toLowerCase();
  const expectedUid = await ask('Expected Firebase UID (optional, recommended)');
  const password = await askHidden('Current account password');

  // 1. Sign in to the EXISTING account (read-only for the account; only refreshes last-sign-in time).
  const signIn = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Referer: serverUrl },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    }
  );
  const signInData = (await signIn.json().catch(() => ({}))) as SignInResponse;
  if (!signIn.ok || !signInData.idToken || !signInData.localId) {
    throw new Error(`Firebase sign-in failed (${signInData.error?.message || `HTTP ${signIn.status}`}). Nothing was changed.`);
  }
  const idToken = signInData.idToken;
  console.log(`\nSigned in to existing Firebase account. UID: ${signInData.localId}`);
  if (expectedUid && expectedUid !== signInData.localId) {
    throw new Error('The signed-in UID does not match the expected UID. Aborting; nothing was changed.');
  }
  if ((signInData.email || '').toLowerCase() !== email) {
    throw new Error('The signed-in email does not match. Aborting; nothing was changed.');
  }

  // 2. Collect the NGO details that cannot be recovered automatically.
  console.log('\nEnter the NGO details exactly as they should appear (all required):');
  const recoveryBody = {
    expectedEmail: email,
    uid: signInData.localId,
    role: 'ngo',
    identifier: await askRequired('NGO registration number', '24017'),
    name: await askRequired('Organization name'),
    registrationType: await askRequired('Registration type (SECP / Society / Trust / VSWA)'),
    focalPerson: await askRequired('Focal person'),
    contact: await askRequired('Contact phone'),
    address: await askRequired('Address')
  };

  // 3. Dry run: shows exactly what would be created; writes nothing.
  const endpoint = `${serverUrl}/api/auth/recover-profile`;
  const dryRun = await postJson(endpoint, idToken, { ...recoveryBody, confirm: false });
  if (!dryRun.data.success) {
    throw new Error(`Dry run rejected (HTTP ${dryRun.status}): ${dryRun.data.error}. Nothing was changed.`);
  }
  console.log('\nDry run result (nothing written yet):');
  console.log(`  Already existing: ${dryRun.data.existing.join(', ') || 'none'}`);
  console.log(`  Would create:     ${dryRun.data.wouldCreate.join(', ') || 'none'}`);
  console.log('  Preview:', JSON.stringify(dryRun.data.preview, null, 2));
  if (dryRun.data.alreadyComplete) {
    console.log('\nAll records already exist. Nothing to do.');
    return;
  }

  // 4. Explicit confirmation before any write.
  const confirmation = await ask('\nType CONFIRM to create ONLY the missing records above (anything else cancels)');
  if (confirmation !== 'CONFIRM') {
    console.log('Cancelled. Nothing was changed.');
    return;
  }
  const commit = await postJson(endpoint, idToken, { ...recoveryBody, confirm: true });
  if (!commit.data.success) {
    throw new Error(`Recovery rejected (HTTP ${commit.status}): ${commit.data.error}`);
  }
  console.log(`\n${commit.data.message}`);
  console.log(`  Created: ${commit.data.created.join(', ') || 'none'}`);
  console.log('\nNext: remove the UID from PAKRELIEF_RECOVERY_UIDS, restart the server, then sign in with the registration number.');
}

main()
  .catch(error => {
    console.error(`\nRecovery stopped: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => rl.close());
