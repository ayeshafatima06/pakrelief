import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword, 
  signInWithCustomToken,
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { UserProfile, UserRole, VerificationStatus } from '../types';
import api from '../lib/api';

interface AuthContextType {
  user: UserProfile | null;
  firebaseUser: FirebaseUser | null;
  role: UserRole | null;
  verificationStatus: VerificationStatus | null;
  isLoading: boolean;
  loginWithIdentifier: (identifier: string, role: UserRole, password?: string) => Promise<{ success: boolean; error?: string }>;
  registerUser: (data: {
    email: string;
    password: string;
    name: string;
    role: UserRole;
    identifier: string;
    contact?: string;
    focalPerson?: string;
    registrationType?: string;
    businessType?: string;
    warehouseCity?: string;
    address?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load the trusted profile through the API whenever Firebase Auth changes
  const fetchProfileForUid = async (): Promise<UserProfile | null> => {
    try {
      const response = await api.get('/auth/profile');
      if (response.data.success && response.data.user) {
        const profile = response.data.user as UserProfile;
        setUser(profile);
        return profile;
      }
    } catch (err) {
      console.warn('Could not fetch authenticated user profile:', err);
    }
    setUser(null);
    return null;
  };

  const completeFirebaseSignIn = async (customToken: string): Promise<boolean> => {
    const credential = await signInWithCustomToken(auth, customToken);
    const profile = await fetchProfileForUid();
    if (!profile) {
      await signOut(auth);
      return false;
    }
    return true;
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        await fetchProfileForUid();
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const refreshProfile = async () => {
    if (firebaseUser) {
      await fetchProfileForUid();
    } else {
      setUser(null);
    }
  };

  // Login via role-appropriate identifier toggle (e.g. CNIC / SECP / CUIN / Admin Email)
  const loginWithIdentifier = async (identifier: string, role: UserRole, password?: string) => {
    setIsLoading(true);
    try {
      if (!identifier) {
        setIsLoading(false);
        return { success: false, error: 'Please enter your registered identifier.' };
      }
      if (!password) {
        setIsLoading(false);
        return { success: false, error: 'Please enter your account password.' };
      }

      // 1. Resolve typed identifier to registered email in Firestore mapping
      const lookupRes = await api.post('/auth/lookup-identifier', { identifier, role });
      if (!lookupRes.data.success || !lookupRes.data.email) {
        setIsLoading(false);
        return { success: false, error: lookupRes.data.error || 'Identifier could not be resolved.' };
      }

      const registeredEmail = lookupRes.data.email;

      // 2. Authenticate against Firebase Authentication with email & password, falling back to direct auth if operation-not-allowed
      let cred: any = null;
      try {
        cred = await signInWithEmailAndPassword(auth, registeredEmail, password);
      } catch (authErr: any) {
        // If operation-not-allowed (Email/Password disabled in Firebase console) or account created via direct auth:
        if (
          authErr.code === 'auth/operation-not-allowed' || 
          authErr.code === 'auth/admin-restricted-operation' ||
          authErr.code === 'auth/user-not-found' ||
          authErr.code === 'auth/invalid-credential'
        ) {
          try {
            const directRes = await api.post('/auth/login-direct', { identifier, role, password });
            if (directRes.data.success && directRes.data.customToken) {
              const signedIn = await completeFirebaseSignIn(directRes.data.customToken);
              setIsLoading(false);
              return signedIn
                ? { success: true }
                : { success: false, error: 'Your account was authenticated, but its profile could not be loaded. Contact support.' };
            }
          } catch (directErr: any) {
            setIsLoading(false);
            return { 
              success: false, 
              error: directErr.response?.data?.error || 'Authentication failed. Please verify your identifier and password.' 
            };
          }
        }

        // If statutory admin account needs bootstrapping
        if (role === 'admin') {
          try {
            const directAdmin = await api.post('/auth/login-direct', { identifier, role, password });
            if (directAdmin.data.success && directAdmin.data.customToken) {
              const signedIn = await completeFirebaseSignIn(directAdmin.data.customToken);
              setIsLoading(false);
              return signedIn
                ? { success: true }
                : { success: false, error: 'Your account was authenticated, but its profile could not be loaded. Contact support.' };
            }
          } catch (_) {}
        }

        setIsLoading(false);
        let errText = 'Authentication failed. Please check your identifier and password.';
        if (authErr.code === 'auth/invalid-credential' || authErr.code === 'auth/wrong-password') {
          errText = 'Incorrect password. Please verify and try again.';
        }
        return { success: false, error: errText };
      }

      // 3. Retrieve user profile from Firestore if signed in via Firebase Auth
      if (cred?.user) {
        const profile = await fetchProfileForUid();
        if (!profile) {
          await signOut(auth);
          setIsLoading(false);
          return { success: false, error: 'Your Firebase account is valid, but no PakRelief profile exists. Contact support to restore the profile.' };
        }
      }

      setIsLoading(false);
      return { success: true };
    } catch (err: any) {
      setIsLoading(false);
      const msg = err.response?.data?.error || err.message || 'Login failed. Please check credentials.';
      return { success: false, error: msg };
    }
  };

  // Register real account with Firebase Authentication & Firestore (with direct fallback)
  const registerUser = async (data: {
    email: string;
    password: string;
    name: string;
    role: UserRole;
    identifier: string;
    contact?: string;
    focalPerson?: string;
    registrationType?: string;
    businessType?: string;
    warehouseCity?: string;
    address?: string;
  }) => {
    setIsLoading(true);
    try {
      // 1. Try real Firebase Auth user creation
      let cred: any = null;
      let uid = '';

      try {
        cred = await createUserWithEmailAndPassword(auth, data.email, data.password);
        uid = cred.user.uid;

        // 2. Store profile in Firestore via backend
        const res = await api.post('/auth/register-profile', {
          uid,
          email: data.email,
          name: data.name,
          role: data.role,
          identifier: data.identifier,
          contact: data.contact,
          focalPerson: data.focalPerson,
          registrationType: data.registrationType,
          businessType: data.businessType,
          warehouseCity: data.warehouseCity,
          address: data.address
        });

        if (res.data.success) {
          await fetchProfileForUid();
          setIsLoading(false);
          return { success: true };
        }
      } catch (authErr: any) {
        // Migrate direct registrations through the server when client email/password auth is unavailable.
        if (
          authErr.code === 'auth/operation-not-allowed' || 
          authErr.code === 'auth/admin-restricted-operation'
        ) {
          console.info('[PakRelief] Client email/password auth is unavailable. Requesting server-side Firebase account migration.');
          const directRes = await api.post('/auth/register-direct', data);
          if (directRes.data.success && directRes.data.customToken) {
            const signedIn = await completeFirebaseSignIn(directRes.data.customToken);
            setIsLoading(false);
            return signedIn
              ? { success: true }
              : { success: false, error: 'Your account was created, but its profile could not be loaded. Contact support.' };
          } else {
            setIsLoading(false);
            return { success: false, error: directRes.data.error || 'Failed to complete registration.' };
          }
        }
        throw authErr;
      }

      setIsLoading(false);
      return { success: false, error: 'Failed to complete registration profile.' };
    } catch (err: any) {
      setIsLoading(false);
      let msg = err.response?.data?.error || err.message || 'Registration failed.';
      if (err.code === 'auth/email-already-in-use') {
        msg = 'An account with this email address already exists. Please log in.';
      } else if (err.code === 'auth/weak-password') {
        msg = 'Password is too weak. Please use at least 6 characters.';
      }
      return { success: false, error: msg };
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn('Sign out error:', e);
    }
    setUser(null);
    setFirebaseUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        role: user?.role || null,
        verificationStatus: user?.verificationStatus || null,
        isLoading,
        loginWithIdentifier,
        registerUser,
        logout,
        setUser,
        refreshProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
