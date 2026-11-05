import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import firebaseConfig from '../../firebase-applet-config.json';

let adminAuth: ReturnType<typeof getAuth> | null = null;

try {
  const existingApps = getApps();
  const app = existingApps.length === 0
    ? initializeApp({ projectId: firebaseConfig.projectId })
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

export interface VerifiedTokenUser {
  uid: string;
  email?: string;
  role?: string;
  name?: string;
}

export async function verifyTokenWithRevocationCheck<T extends VerifiedTokenUser>(
  token: string,
  verify: (token: string, checkRevoked: true) => Promise<T>
): Promise<T | null> {
  if (!token) return null;
  try {
    return await verify(token, true);
  } catch {
    return null;
  }
}

export async function verifyFirebaseIdToken(token: string): Promise<VerifiedTokenUser | null> {
  if (!token || !adminAuth) return null;

  const decoded = await verifyTokenWithRevocationCheck(token, (idToken, checkRevoked) =>
    adminAuth!.verifyIdToken(idToken, checkRevoked));
  if (!decoded) return null;
    return {
      uid: decoded.uid,
      email: decoded.email,
      role: decoded.role as string | undefined,
      name: decoded.name
    };
}
