import { applicationDefault, initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import firebaseConfig from '../../firebase-applet-config.json';

let adminAuth: ReturnType<typeof getAuth> | null = null;

try {
  const existingApps = getApps();
  // Use the same credential source as firestoreService so behaviour does not depend on module import order.
  const app = existingApps.length === 0
    ? initializeApp({ credential: applicationDefault(), projectId: firebaseConfig.projectId })
    : getApp();
  adminAuth = getAuth(app);
} catch (err) {
  console.warn('[AdminAuthService] Warning: Could not initialize Firebase Admin SDK directly:', err);
}

export async function setCustomClaim(uid: string, claims: { role: string; [key: string]: any }): Promise<boolean> {
  try {
    if (adminAuth) {
      await adminAuth.setCustomUserClaims(uid, claims);
      console.log(`[AdminAuthService] Successfully set custom claims for uid ${uid}:`, claims);
      return true;
    }
  } catch (err: any) {
    console.warn(`[AdminAuthService] Failed to set claims via adminAuth for uid ${uid}:`, err.message);
  }
  return false;
}

export async function migrateLegacyUserToFirebaseAuth(
  uid: string,
  email: string,
  password: string,
  displayName: string
): Promise<string> {
  if (!adminAuth) {
    throw new Error('Firebase Admin Authentication is unavailable. Configure server application credentials to migrate this account.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  try {
    await adminAuth.getUser(uid);
    throw new Error('A Firebase identity already exists for this legacy profile. Use Firebase sign-in or contact support; legacy credentials will not reset it.');
  } catch (error: any) {
    if (error.message?.startsWith('A Firebase identity already exists')) throw error;
    if (error.code !== 'auth/user-not-found') throw error;
  }

  try {
    await adminAuth.getUserByEmail(normalizedEmail);
    throw new Error('This email is already linked to a Firebase account. Sign in or contact support to reconcile the profile.');
  } catch (error: any) {
    if (error.message?.startsWith('This email is already linked')) throw error;
    if (error.code !== 'auth/user-not-found') throw error;
  }

  await adminAuth.createUser({ uid, email: normalizedEmail, password, displayName, emailVerified: true });
  return adminAuth.createCustomToken(uid);
}

export async function assertFirebaseEmailAvailable(email: string): Promise<void> {
  if (!adminAuth) {
    throw new Error('Firebase Admin Authentication is unavailable. Configure server application credentials before registering accounts.');
  }

  try {
    await adminAuth.getUserByEmail(email.trim().toLowerCase());
    throw new Error('This email is already linked to a Firebase account. Sign in or contact support to reconcile the profile.');
  } catch (error: any) {
    if (error.message?.startsWith('This email is already linked')) throw error;
    if (error.code !== 'auth/user-not-found') throw error;
  }
}

export interface FirebaseAuthAccount {
  uid: string;
  email?: string;
  disabled: boolean;
}

/**
 * Read-only lookup of an existing Firebase Authentication account. Never creates, updates,
 * or deletes the account. Returns null only when Firebase reports that the UID does not exist.
 */
export async function getFirebaseAuthAccount(uid: string): Promise<FirebaseAuthAccount | null> {
  if (!adminAuth) {
    throw new Error('Firebase Admin Authentication is unavailable. Configure server application credentials.');
  }
  try {
    const record = await adminAuth.getUser(uid);
    return { uid: record.uid, email: record.email, disabled: record.disabled };
  } catch (error: any) {
    if (error?.code === 'auth/user-not-found') return null;
    throw error;
  }
}

export interface VerifiedTokenUser {
  uid: string;
  email?: string;
  role?: string;
  name?: string;
}

export async function verifyTokenWithRevocationCheck<T extends VerifiedTokenUser>(
  token: string,
  verify: (token: string, checkRevoked: true) => Promise<T>,
  onError?: (error: unknown) => void
): Promise<T | null> {
  if (!token) return null;
  try {
    return await verify(token, true);
  } catch (error) {
    onError?.(error);
    return null;
  }
}

// Token-content errors are the caller's problem; anything else usually means the server's
// Firebase Admin credentials are missing or invalid (the request is then rejected even for a valid token).
const CLIENT_TOKEN_ERROR_CODES = new Set([
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/argument-error',
  'auth/invalid-id-token',
  'auth/user-disabled',
  'auth/user-not-found'
]);

function logTokenVerificationFailure(error: unknown): void {
  const code = (error as { code?: string })?.code || 'unknown';
  if (CLIENT_TOKEN_ERROR_CODES.has(code)) {
    console.warn(`[AdminAuthService] Firebase ID token rejected (code=${code}).`);
    return;
  }
  // Never log the token itself; the code and message are enough to diagnose configuration problems.
  console.error(
    `[AdminAuthService] Firebase ID token could not be verified (code=${code}). ` +
    'Check the server Firebase Admin credentials (Application Default Credentials / GOOGLE_APPLICATION_CREDENTIALS).',
    (error as { message?: string })?.message || ''
  );
}

export async function verifyFirebaseIdToken(token: string): Promise<VerifiedTokenUser | null> {
  if (!token) return null;
  if (!adminAuth) {
    console.error('[AdminAuthService] Firebase Admin Authentication is not initialized; rejecting authenticated request.');
    return null;
  }

  const decoded = await verifyTokenWithRevocationCheck(token, (idToken, checkRevoked) =>
    adminAuth!.verifyIdToken(idToken, checkRevoked), logTokenVerificationFailure);
  if (!decoded) return null;
    return {
      uid: decoded.uid,
      email: decoded.email,
      role: decoded.role as string | undefined,
      name: decoded.name
    };
}
