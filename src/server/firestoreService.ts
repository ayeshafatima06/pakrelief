import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  query, 
  where,
  deleteDoc
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { 
  UserProfile, 
  NgoProfile, 
  SupplierProfile, 
  Campaign, 
  Requirement, 
  Product, 
  Order, 
  Transaction, 
  OtpRecord 
} from '../types';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const db = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

// -----------------
// Users
// -----------------
export async function getUsers(): Promise<UserProfile[]> {
  try {
    const snap = await getDocs(collection(db, 'users'));
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as UserProfile));
  } catch (err) {
    console.error('Error fetching users from Firestore:', err);
    return [];
  }
}

export async function getUserById(id: string): Promise<UserProfile | null> {
  try {
    const snap = await getDoc(doc(db, 'users', id));
    if (!snap.exists()) return null;
    return { ...snap.data(), id: snap.id } as UserProfile;
  } catch (err) {
    console.error(`Error fetching user ${id}:`, err);
    return null;
  }
}

export async function saveUser(user: UserProfile): Promise<void> {
  await setDoc(doc(db, 'users', user.id), user);
}

export async function updateUser(id: string, updates: Partial<UserProfile>): Promise<void> {
  await updateDoc(doc(db, 'users', id), updates as any);
}

// -----------------
// Identifier Mappings (for Identifier-based login)
// -----------------
export interface IdentifierRecord {
  identifier: string;
  email: string;
  role: string;
  userId?: string;
  name?: string;
  verificationStatus?: string;
}

export async function getIdentifierMapping(identifier: string): Promise<IdentifierRecord | null> {
  try {
    const normalized = identifier.trim().toLowerCase();
    const snap = await getDoc(doc(db, 'identifierMappings', normalized));
    if (!snap.exists()) return null;
    return snap.data() as IdentifierRecord;
  } catch (err) {
    console.error(`Error fetching identifier mapping for ${identifier}:`, err);
    return null;
  }
}

export async function saveIdentifierMapping(identifier: string, data: IdentifierRecord): Promise<void> {
  const normalized = identifier.trim().toLowerCase();
  await setDoc(doc(db, 'identifierMappings', normalized), {
    ...data,
    identifier: identifier.trim()
  });
}

// -----------------
// OTP Management (Strict 1-minute expiry)
// -----------------
export async function saveOtpRecord(record: OtpRecord): Promise<void> {
  const normalizedEmail = record.email.trim().toLowerCase();
  await setDoc(doc(db, 'otpVerifications', normalizedEmail), {
    ...record,
    email: normalizedEmail
  });
}

export async function getOtpRecord(email: string): Promise<OtpRecord | null> {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const snap = await getDoc(doc(db, 'otpVerifications', normalizedEmail));
    if (!snap.exists()) return null;
    return snap.data() as OtpRecord;
  } catch (err) {
    console.error(`Error fetching OTP for ${email}:`, err);
    return null;
  }
}

export async function markOtpAsUsed(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  await updateDoc(doc(db, 'otpVerifications', normalizedEmail), {
    used: true
  });
}

// -----------------
// NGOs
// -----------------
export async function getNgos(): Promise<NgoProfile[]> {
  try {
    const snap = await getDocs(collection(db, 'ngos'));
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as NgoProfile));
  } catch (err) {
    console.error('Error fetching NGOs from Firestore:', err);
    return [];
  }
}

export async function saveNgo(ngo: NgoProfile): Promise<void> {
  await setDoc(doc(db, 'ngos', ngo.id), ngo);
}

export async function updateNgo(id: string, updates: Partial<NgoProfile>): Promise<void> {
  await updateDoc(doc(db, 'ngos', id), updates as any);
}

// -----------------
// Suppliers
// -----------------
export async function getSuppliers(): Promise<SupplierProfile[]> {
  try {
    const snap = await getDocs(collection(db, 'suppliers'));
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as SupplierProfile));
  } catch (err) {
    console.error('Error fetching suppliers from Firestore:', err);
    return [];
  }
}

export async function saveSupplier(supplier: SupplierProfile): Promise<void> {
  await setDoc(doc(db, 'suppliers', supplier.id), supplier);
}

export async function updateSupplier(id: string, updates: Partial<SupplierProfile>): Promise<void> {
  await updateDoc(doc(db, 'suppliers', id), updates as any);
}

// -----------------
// Campaigns & Requirements
// -----------------
export async function getCampaigns(): Promise<Campaign[]> {
  try {
    const snap = await getDocs(collection(db, 'campaigns'));
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as Campaign));
  } catch (err) {
    console.error('Error fetching campaigns from Firestore:', err);
    return [];
  }
}

export async function saveCampaign(campaign: Campaign): Promise<void> {
  await setDoc(doc(db, 'campaigns', campaign.id), campaign);
}

export async function getRequirements(campaignId?: string): Promise<Requirement[]> {
  try {
    if (campaignId) {
      const q = query(collection(db, 'requirements'), where('campaignId', '==', campaignId));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ ...d.data(), id: d.id } as Requirement));
    }
    const snap = await getDocs(collection(db, 'requirements'));
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as Requirement));
  } catch (err) {
    console.error('Error fetching requirements from Firestore:', err);
    return [];
  }
}

export async function saveRequirement(req: Requirement): Promise<void> {
  await setDoc(doc(db, 'requirements', req.id), req);
}

export async function updateRequirement(id: string, updates: Partial<Requirement>): Promise<void> {
  await updateDoc(doc(db, 'requirements', id), updates as any);
}

// -----------------
// Products
// -----------------
export async function getProducts(supplierId?: string): Promise<Product[]> {
  try {
    if (supplierId) {
      const q = query(collection(db, 'products'), where('supplierId', '==', supplierId));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ ...d.data(), id: d.id } as Product));
    }
    const snap = await getDocs(collection(db, 'products'));
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as Product));
  } catch (err) {
    console.error('Error fetching products from Firestore:', err);
    return [];
  }
}

export async function saveProduct(product: Product): Promise<void> {
  await setDoc(doc(db, 'products', product.id), product);
}

// -----------------
// Orders
// -----------------
export async function getOrders(): Promise<Order[]> {
  try {
    const snap = await getDocs(collection(db, 'orders'));
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as Order));
  } catch (err) {
    console.error('Error fetching orders from Firestore:', err);
    return [];
  }
}

export async function saveOrder(order: Order): Promise<void> {
  await setDoc(doc(db, 'orders', order.id), order);
}

export async function updateOrder(id: string, updates: Partial<Order>): Promise<void> {
  await updateDoc(doc(db, 'orders', id), updates as any);
}

// -----------------
// Transactions
// -----------------
export async function getTransactions(): Promise<Transaction[]> {
  try {
    const snap = await getDocs(collection(db, 'transactions'));
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as Transaction));
  } catch (err) {
    console.error('Error fetching transactions from Firestore:', err);
    return [];
  }
}

export async function saveTransaction(tx: Transaction): Promise<void> {
  await setDoc(doc(db, 'transactions', tx.id), tx);
}

export async function updateTransaction(id: string, updates: Partial<Transaction>): Promise<void> {
  await updateDoc(doc(db, 'transactions', id), updates as any);
}
