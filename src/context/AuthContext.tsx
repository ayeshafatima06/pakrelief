import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
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

  // Sync profile from Firestore whenever Firebase Auth state changes
  const fetchProfileForUid = async (uid: string): Promise<UserProfile | null> => {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      if (snap.exists()) {
        const profile = { ...snap.data(), id: snap.id } as UserProfile;
        setUser(profile);
        return profile;
      }
    } catch (err) {
      console.warn('Could not fetch Firestore user profile:', err);
    }
    return null;
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        await fetchProfileForUid(fbUser.uid);
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const refreshProfile = async () => {
    if (firebaseUser) {
      await fetchProfileForUid(firebaseUser.uid);
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

      // 2. Authenticate against Firebase Authentication with email & password
      let cred;
      try {
        cred = await signInWithEmailAndPassword(auth, registeredEmail, password);
      } catch (authErr: any) {
        // If NDMA statutory admin doesn't have a Firebase Auth password yet, bootstrap it
        if (role === 'admin' && authErr.code === 'auth/user-not-found') {
          cred = await createUserWithEmailAndPassword(auth, registeredEmail, password);
        } else {
          setIsLoading(false);
          let errText = 'Authentication failed. Please check your identifier and password.';
          if (authErr.code === 'auth/invalid-credential' || authErr.code === 'auth/wrong-password') {
            errText = 'Incorrect password. Please verify and try again.';
          } else if (authErr.code === 'auth/user-not-found') {
            errText = 'No authentication account found for this registered email.';
          }
          return { success: false, error: errText };
        }
      }

      // 3. Retrieve user profile from Firestore
      const profile = await fetchProfileForUid(cred.user.uid);
      if (!profile) {
        // Create initial profile if missing
        const newProfile: UserProfile = {
          id: cred.user.uid,
          firebaseUid: cred.user.uid,
          email: registeredEmail,
          name: lookupRes.data.name || registeredEmail,
          role,
          contact: '',
          emailVerified: true,
          verificationStatus: role === 'admin' || role === 'donor' ? 'active' : 'pending',
          createdAt: Date.now(),
          identifier
        };
        setUser(newProfile);
      }

      setIsLoading(false);
      return { success: true };
    } catch (err: any) {
      setIsLoading(false);
      const msg = err.response?.data?.error || err.message || 'Login failed. Please check credentials.';
      return { success: false, error: msg };
    }
  };

  // Register real account with Firebase Authentication & Firestore
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
      // 1. Create real Firebase Auth user (generates genuine password hash and session)
      const cred = await createUserWithEmailAndPassword(auth, data.email, data.password);
      const uid = cred.user.uid;

      // 2. Store user profile and identifier mapping in Firestore via backend
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
        setUser(res.data.user);
        setIsLoading(false);
        return { success: true };
      }

      setIsLoading(false);
      return { success: false, error: res.data.error || 'Failed to complete registration profile.' };
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
