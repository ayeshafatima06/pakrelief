import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import axios from 'axios';

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

export interface VerifiedTokenUser {
  uid: string;
  email?: string;
  role?: string;
  name?: string;
}

export async function verifyFirebaseIdToken(token: string): Promise<VerifiedTokenUser | null> {
  if (!token) return null;

  // 1. Try Firebase Admin verifyIdToken
  if (adminAuth) {
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      return {
        uid: decoded.uid,
        email: decoded.email,
        role: decoded.role as string | undefined,
        name: decoded.name
      };
    } catch (err: any) {
      // If adminAuth token verification throws due to credential requirements, fall through to REST API
    }
  }

  // 2. Fallback to Google Identity Toolkit REST API
  try {
    const res = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`,
      { idToken: token }
    );
    const user = res.data.users?.[0];
    if (user) {
      let customAttributes: any = {};
      if (user.customAttributes) {
        try {
          customAttributes = JSON.parse(user.customAttributes);
        } catch (_) {}
      }
      return {
        uid: user.localId,
        email: user.email,
        role: customAttributes.role,
        name: user.displayName
      };
    }
  } catch (err: any) {
    console.warn('[AdminAuthService] REST token lookup error:', err?.response?.data?.error?.message || err.message);
  }

  return null;
}
