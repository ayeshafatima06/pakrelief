import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { assertCampaignReviewable, hasValidAdminCampaignApproval } from './campaignReviewPolicy';
import {
  filterOptedInSupporters,
  getStalePublicationFailure,
  normalizeWhatsAppPhone
} from './socialMediaService';
import { 
  UserProfile, 
  NgoProfile, 
  SupplierProfile, 
  Campaign, 
  SocialPlatform,
  SocialPlatformPublication,
  Requirement, 
  Product, 
  Order, 
  Transaction, 
  OtpRecord 
} from '../types';
import {
  assertOrderActorOwnership,
  buildPricedCheckout,
  assertOrderTransitionAllowed,
  CheckoutLineInput,
  CommerceAuthorizationError,
  OrderStateError,
  checkoutRequestKey
} from './commerceService';

const app = getApps().length === 0 ? initializeApp({ projectId: firebaseConfig.projectId }) : getApp();
export const db = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

// -----------------
// Users
// -----------------
export async function getUsers(): Promise<UserProfile[]> {
  try {
    const snap = await db.collection('users').get();
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as UserProfile));
  } catch (err) {
    console.error('Error fetching users from Firestore:', err);
    return [];
  }
}

export async function getUserById(id: string): Promise<UserProfile | null> {
  try {
    const snap = await db.collection('users').doc(id).get();
    if (!snap.exists) return null;
    return { ...snap.data(), id: snap.id } as UserProfile;
  } catch (err) {
    console.error(`Error fetching user ${id}:`, err);
    return null;
  }
}

export async function saveUser(user: UserProfile): Promise<void> {
  await db.collection('users').doc(user.id).set(user);
}

export async function updateUser(id: string, updates: Partial<UserProfile>): Promise<void> {
  await db.collection('users').doc(id).update(updates);
}

export async function removeLegacyPassword(id: string): Promise<void> {
  await db.collection('users').doc(id).update({
    passwordHash: FieldValue.delete(),
    passwordSalt: FieldValue.delete()
  });
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
    const snap = await db.collection('identifierMappings').doc(normalized).get();
    if (!snap.exists) return null;
    return snap.data() as IdentifierRecord;
  } catch (err) {
    console.error(`Error fetching identifier mapping for ${identifier}:`, err);
    return null;
  }
}

export async function saveIdentifierMapping(identifier: string, data: IdentifierRecord): Promise<void> {
  const normalized = identifier.trim().toLowerCase();
  await db.collection('identifierMappings').doc(normalized).set({
    ...data,
    identifier: identifier.trim()
  });
}

// -----------------
// OTP Management (Strict 1-minute expiry)
// -----------------
export async function saveOtpRecord(record: OtpRecord): Promise<void> {
  const normalizedEmail = record.email.trim().toLowerCase();
  await db.collection('otpVerifications').doc(normalizedEmail).set({
    ...record,
    email: normalizedEmail
  });
}

export async function getOtpRecord(email: string): Promise<OtpRecord | null> {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const snap = await db.collection('otpVerifications').doc(normalizedEmail).get();
    if (!snap.exists) return null;
    return snap.data() as OtpRecord;
  } catch (err) {
    console.error(`Error fetching OTP for ${email}:`, err);
    return null;
  }
}

export async function markOtpAsUsed(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  await db.collection('otpVerifications').doc(normalizedEmail).update({
    used: true
  });
}

// -----------------
// NGOs
// -----------------
export async function getNgos(): Promise<NgoProfile[]> {
  try {
    const snap = await db.collection('ngos').get();
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as NgoProfile));
  } catch (err) {
    console.error('Error fetching NGOs from Firestore:', err);
    return [];
  }
}

export async function saveNgo(ngo: NgoProfile): Promise<void> {
  await db.collection('ngos').doc(ngo.id).set(ngo);
}

export async function updateNgo(id: string, updates: Partial<NgoProfile>): Promise<void> {
  await db.collection('ngos').doc(id).update(updates);
}

// -----------------
// Suppliers
// -----------------
export async function getSuppliers(): Promise<SupplierProfile[]> {
  try {
    const snap = await db.collection('suppliers').get();
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as SupplierProfile));
  } catch (err) {
    console.error('Error fetching suppliers from Firestore:', err);
    return [];
  }
}

export async function saveSupplier(supplier: SupplierProfile): Promise<void> {
  await db.collection('suppliers').doc(supplier.id).set(supplier);
}

export async function updateSupplier(id: string, updates: Partial<SupplierProfile>): Promise<void> {
  await db.collection('suppliers').doc(id).update(updates);
}

// -----------------
// Campaigns & Requirements
// -----------------
export async function getCampaigns(): Promise<Campaign[]> {
  try {
    const snap = await db.collection('campaigns').get();
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as Campaign));
  } catch (err) {
    console.error('Error fetching campaigns from Firestore:', err);
    return [];
  }
}

export async function getCampaignById(id: string): Promise<Campaign | null> {
  try {
    const snap = await db.collection('campaigns').doc(id).get();
    if (!snap.exists) return null;
    return { ...snap.data(), id: snap.id } as Campaign;
  } catch (err) {
    console.error(`Error fetching campaign ${id}:`, err);
    return null;
  }
}

export async function saveCampaign(campaign: Campaign): Promise<void> {
  await db.collection('campaigns').doc(campaign.id).set(campaign);
}

export async function updateCampaign(id: string, updates: Partial<Campaign>): Promise<void> {
  await db.collection('campaigns').doc(id).update(updates);
}

export async function reviewCampaignTransaction(input: {
  campaignId: string;
  status: 'approved' | 'rejected';
  adminUid: string;
  adminProfileId: string;
  adminName: string;
  reviewNotes: string;
  reviewedAt: number;
}): Promise<Campaign | null> {
  const campaignRef = db.collection('campaigns').doc(input.campaignId);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(campaignRef);
    if (!snapshot.exists) return null;

    const campaign = { ...snapshot.data(), id: snapshot.id } as Campaign;
    assertCampaignReviewable(campaign, input.adminUid, input.adminProfileId);

    const reviewedCampaign: Campaign = {
      ...campaign,
      status: input.status,
      reviewedByAdminId: input.adminUid,
      reviewedByAdminName: input.adminName,
      reviewedAt: input.reviewedAt,
      reviewNotes: input.reviewNotes
    };
    transaction.update(campaignRef, {
      status: input.status,
      reviewedByAdminId: input.adminUid,
      reviewedByAdminName: input.adminName,
      reviewedAt: input.reviewedAt,
      reviewNotes: input.reviewNotes
    });
    return reviewedCampaign;
  });
}

export async function claimSocialPlatformPublication(
  campaignId: string,
  platform: SocialPlatform,
  retry: boolean,
  now: number,
  isAdminUid: (uid: string) => boolean
): Promise<Campaign | null> {
  const ref = db.collection('campaigns').doc(campaignId);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;
    const campaign = { ...snapshot.data(), id: snapshot.id } as Campaign;
    if (!hasValidAdminCampaignApproval(campaign, isAdminUid)) return null;

    const current = campaign.socialPublishing?.[platform] || {
      status: 'pending' as const,
      attempts: 0,
      updatedAt: now
    };
    if (retry) {
      if (current.status !== 'failed' || !current.retryable || (current.retryAfter && current.retryAfter > now)) return null;
    } else if (current.status !== 'pending' || current.attempts > 0) {
      return null;
    }

    const next: SocialPlatformPublication = {
      ...current,
      status: 'publishing',
      attempts: current.attempts + 1,
      updatedAt: now,
      retryable: false
    };
    transaction.update(ref, {
      [`socialPublishing.${platform}.status`]: next.status,
      [`socialPublishing.${platform}.attempts`]: next.attempts,
      [`socialPublishing.${platform}.updatedAt`]: next.updatedAt,
      [`socialPublishing.${platform}.retryable`]: false,
      [`socialPublishing.${platform}.error`]: FieldValue.delete(),
      [`socialPublishing.${platform}.errorCode`]: FieldValue.delete(),
      [`socialPublishing.${platform}.retryAfter`]: FieldValue.delete()
    });
    return {
      ...campaign,
      socialPublishing: {
        ...campaign.socialPublishing,
        [platform]: next
      } as Campaign['socialPublishing']
    };
  });
}

export async function updateSocialPlatformPublication(
  campaignId: string,
  platform: SocialPlatform,
  updates: Partial<SocialPlatformPublication>
): Promise<void> {
  const ref = db.collection('campaigns').doc(campaignId);
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error('Campaign not found while updating social publication status.');
    const campaign = { ...snapshot.data(), id: snapshot.id } as Campaign;
    const current = campaign.socialPublishing?.[platform] || {
      status: 'pending' as const,
      attempts: 0,
      updatedAt: Date.now()
    };
    const merged = { ...current, ...updates } as Record<string, unknown>;
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) delete merged[key];
    }
    const next = Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== undefined));
    transaction.update(ref, { [`socialPublishing.${platform}`]: next });
  });
}

export async function reconcileStaleSocialPublication(
  campaignId: string,
  platform: SocialPlatform,
  now: number
): Promise<boolean> {
  const ref = db.collection('campaigns').doc(campaignId);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return false;
    const campaign = { ...snapshot.data(), id: snapshot.id } as Campaign;
    const failure = getStalePublicationFailure(campaign.socialPublishing?.[platform], now);
    if (!failure) return false;
    transaction.update(ref, Object.fromEntries(
      Object.entries(failure).map(([key, value]) => [`socialPublishing.${platform}.${key}`, value])
    ));
    return true;
  });
}

export async function getOptedInWhatsAppSupporters(): Promise<Array<{ id: string; phone: string }>> {
  return filterOptedInSupporters(await getUsers());
}

export async function updateWhatsAppConsent(userId: string, optIn: boolean, phone?: string): Promise<void> {
  const ref = db.collection('users').doc(userId);
  if (optIn) {
    const normalizedPhone = phone ? normalizeWhatsAppPhone(phone) : null;
    if (!normalizedPhone) throw new Error('A valid phone number in international format is required for WhatsApp opt-in.');
    await ref.update({
      whatsappPhone: normalizedPhone,
      whatsappOptIn: true,
      whatsappOptedInAt: Date.now(),
      whatsappOptedOutAt: FieldValue.delete()
    });
    return;
  }
  await ref.update({
    whatsappOptIn: false,
    whatsappOptedOutAt: Date.now(),
    whatsappPhone: FieldValue.delete()
  });
}

export async function claimWhatsAppRecipient(
  campaignId: string,
  userId: string,
  retry: boolean,
  now: number
): Promise<'published' | 'blocked' | 'claimed'> {
  const ref = db.collection('campaignSocialPublications').doc(campaignId).collection('whatsappRecipients').doc(userId);
  const userRef = db.collection('users').doc(userId);
  return db.runTransaction(async transaction => {
    const [userSnapshot, snapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(ref)
    ]);
    const supporter = userSnapshot.exists ? userSnapshot.data() : undefined;
    if (!supporter || supporter.role !== 'donor' || supporter.whatsappOptIn !== true || supporter.whatsappOptedOutAt || !supporter.whatsappPhone) {
      return 'blocked';
    }
    const phone = normalizeWhatsAppPhone(supporter.whatsappPhone);
    if (!phone) return 'blocked';

    const current = snapshot.exists ? snapshot.data() : undefined;
    if (current?.status === 'published') return 'published';
    if (current?.status === 'sending' || current?.status === 'claimed') return 'blocked';
    if (current?.status === 'failed' && (
      !retry || current.retryable === false || (current.retryAfter && current.retryAfter > now)
    )) return 'blocked';
    transaction.set(ref, {
      status: 'claimed',
      attempts: Number(current?.attempts || 0) + 1,
      updatedAt: now,
      retryable: false,
      error: FieldValue.delete(),
      errorCode: FieldValue.delete()
    }, { merge: true });
    return 'claimed';
  });
}

export async function authorizeWhatsAppDispatch(
  campaignId: string,
  userId: string,
  now: number
): Promise<'blocked' | { status: 'authorized'; phone: string }> {
  const ref = db.collection('campaignSocialPublications').doc(campaignId).collection('whatsappRecipients').doc(userId);
  const userRef = db.collection('users').doc(userId);
  return db.runTransaction(async transaction => {
    const [userSnapshot, recipientSnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(ref)
    ]);
    const supporter = userSnapshot.exists ? userSnapshot.data() : undefined;
    const recipient = recipientSnapshot.exists ? recipientSnapshot.data() : undefined;
    const phone = supporter?.whatsappPhone ? normalizeWhatsAppPhone(supporter.whatsappPhone) : null;
    if (
      !supporter || supporter.role !== 'donor' || supporter.whatsappOptIn !== true ||
      supporter.whatsappOptedOutAt || !phone || recipient?.status !== 'claimed'
    ) {
      if (recipient?.status === 'claimed') {
        transaction.update(ref, {
          status: 'cancelled',
          updatedAt: now,
          error: 'Consent was withdrawn before message dispatch.',
          errorCode: 'CONSENT_WITHDRAWN',
          retryable: true
        });
      }
      return 'blocked';
    }

    transaction.update(ref, {
      status: 'sending',
      updatedAt: now,
      dispatchAuthorizedAt: now
    });
    return { status: 'authorized', phone };
  });
}

export async function updateWhatsAppRecipientPublication(
  campaignId: string,
  userId: string,
  update: {
    status: 'claimed' | 'sending' | 'published' | 'failed' | 'cancelled';
    updatedAt: number;
    messageId?: string;
    error?: string;
    errorCode?: string;
    retryable?: boolean;
    retryAfter?: number;
  }
): Promise<void> {
  const ref = db.collection('campaignSocialPublications').doc(campaignId).collection('whatsappRecipients').doc(userId);
  const cleanUpdate = Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined));
  await ref.set(cleanUpdate, { merge: true });
}

export async function getRequirements(campaignId?: string): Promise<Requirement[]> {
  try {
    if (campaignId) {
      const snap = await db.collection('requirements').where('campaignId', '==', campaignId).get();
      return snap.docs.map(d => ({ ...d.data(), id: d.id } as Requirement));
    }
    const snap = await db.collection('requirements').get();
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as Requirement));
  } catch (err) {
    console.error('Error fetching requirements from Firestore:', err);
    return [];
  }
}

export async function saveRequirement(req: Requirement): Promise<void> {
  await db.collection('requirements').doc(req.id).set(req);
}

export async function updateRequirement(id: string, updates: Partial<Requirement>): Promise<void> {
  await db.collection('requirements').doc(id).update(updates);
}

// -----------------
// Products
// -----------------
export async function getProducts(supplierId?: string): Promise<Product[]> {
  try {
    if (supplierId) {
      const snap = await db.collection('products').where('supplierId', '==', supplierId).get();
      return snap.docs.map(d => ({ ...d.data(), id: d.id } as Product));
    }
    const snap = await db.collection('products').get();
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as Product));
  } catch (err) {
    console.error('Error fetching products from Firestore:', err);
    return [];
  }
}

export async function saveProduct(product: Product): Promise<void> {
  await db.collection('products').doc(product.id).set(product);
}

export async function getProductById(id: string): Promise<Product | null> {
  const snapshot = await db.collection('products').doc(id).get();
  return snapshot.exists ? { ...snapshot.data(), id: snapshot.id } as Product : null;
}

export async function updateProduct(id: string, updates: Partial<Product>): Promise<void> {
  await db.collection('products').doc(id).update(updates);
}

export async function createDemoPendingCheckout(input: {
  donor: UserProfile;
  requestId: string;
  lines: CheckoutLineInput[];
  now?: number;
}): Promise<{ orders: Order[]; transactions: Transaction[]; replayed: boolean }> {
  const now = input.now ?? Date.now();
  await expirePendingDemoOrders(now);
  const idempotencyId = checkoutRequestKey(input.donor.id, input.requestId);
  const idempotencyRef = db.collection('checkoutRequests').doc(idempotencyId);

  return db.runTransaction(async transaction => {
    const idempotencySnapshot = await transaction.get(idempotencyRef);
    if (idempotencySnapshot.exists) {
      const saved = idempotencySnapshot.data()!;
      const orderRefs = ((saved.orderIds || []) as string[]).map(id => db.collection('orders').doc(id));
      const transactionRefs = ((saved.transactionIds || []) as string[]).map(id => db.collection('transactions').doc(id));
      const [orderSnapshots, transactionSnapshots] = await Promise.all([
        Promise.all(orderRefs.map(ref => transaction.get(ref))),
        Promise.all(transactionRefs.map(ref => transaction.get(ref)))
      ]);
      return {
        orders: orderSnapshots.filter(snapshot => snapshot.exists).map(snapshot => ({ ...snapshot.data(), id: snapshot.id } as Order)),
        transactions: transactionSnapshots.filter(snapshot => snapshot.exists).map(snapshot => ({ ...snapshot.data(), id: snapshot.id } as Transaction)),
        replayed: true
      };
    }

    const productIds = [...new Set(input.lines.map(line => line.productId))];
    const requirementIds = [...new Set(input.lines.map(line => line.requirementId))];
    const campaignIds = [...new Set(input.lines.map(line => line.campaignId))];
    const productRefs = productIds.map(id => db.collection('products').doc(id));
    const requirementRefs = requirementIds.map(id => db.collection('requirements').doc(id));
    const campaignRefs = campaignIds.map(id => db.collection('campaigns').doc(id));
    const [productSnapshots, requirementSnapshots, campaignSnapshots] = await Promise.all([
      Promise.all(productRefs.map(ref => transaction.get(ref))),
      Promise.all(requirementRefs.map(ref => transaction.get(ref))),
      Promise.all(campaignRefs.map(ref => transaction.get(ref)))
    ]);

    const products = productSnapshots.filter(snapshot => snapshot.exists)
      .map(snapshot => ({ ...snapshot.data(), id: snapshot.id } as Product));
    const supplierIds = [...new Set(products.map(product => product.supplierId))];
    const supplierRefs = supplierIds.map(id => db.collection('suppliers').doc(id));
    const supplierSnapshots = await Promise.all(supplierRefs.map(ref => transaction.get(ref)));
    const approvedSupplierIds = new Set(supplierSnapshots.flatMap((snapshot, index) => {
      const supplier = snapshot.exists ? snapshot.data() : undefined;
      return supplier?.status === 'approved' && supplier.linkedUserId === supplierIds[index] ? [supplierIds[index]] : [];
    }));
    const catalog = {
      products: new Map(products.map(product => [product.id, product])),
      requirements: new Map(requirementSnapshots.filter(snapshot => snapshot.exists)
        .map(snapshot => [snapshot.id, { ...snapshot.data(), id: snapshot.id } as Requirement])),
      campaigns: new Map(campaignSnapshots.filter(snapshot => snapshot.exists)
        .map(snapshot => [snapshot.id, { ...snapshot.data(), id: snapshot.id } as Campaign])),
      approvedSupplierIds
    };
    const plan = buildPricedCheckout(input.lines, catalog);
    const grouped = new Map<string, typeof plan.lines>();
    for (const line of plan.lines) {
      const groupKey = `${line.campaignId}:${line.supplierId}`;
      grouped.set(groupKey, [...(grouped.get(groupKey) || []), line]);
    }

    const reservationExpiresAt = now + 15 * 60 * 1000;
    const orders: Order[] = [];
    const transactions: Transaction[] = [];
    for (const lines of grouped.values()) {
      const orderRef = db.collection('orders').doc();
      const paymentRef = db.collection('transactions').doc();
      const firstLine = lines[0];
      const orderNumber = `PKR-DEMO-${orderRef.id.slice(-10).toUpperCase()}`;
      const gatewayReference = `DEMO-${paymentRef.id.slice(-12).toUpperCase()}`;
      const amount = lines.reduce((sum, line) => sum + line.subtotal, 0);
      const order: Order = {
        id: orderRef.id,
        orderNumber,
        items: lines.map(line => ({
          productId: line.product.id,
          productName: line.product.name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          unit: line.product.unit,
          requirementId: line.requirement.id,
          campaignId: line.campaign.id
        })),
        donorId: input.donor.id,
        donorName: input.donor.name,
        donorEmail: input.donor.email,
        supplierId: firstLine.supplierId,
        supplierName: firstLine.product.supplierName,
        ngoId: firstLine.campaign.ngoId,
        ngoName: firstLine.campaign.ngoName,
        campaignId: firstLine.campaign.id,
        campaignName: firstLine.campaign.disasterName,
        amount,
        currency: 'PKR',
        status: 'Payment Pending',
        gatewayReference,
        transactionId: paymentRef.id,
        checkoutRequestId: input.requestId,
        reservationExpiresAt,
        paymentMethod: 'JazzCash Sandbox Demo',
        createdAt: now,
        updatedAt: now
      };
      const payment: Transaction = {
        id: paymentRef.id,
        orderId: order.id,
        orderNumber,
        donorId: input.donor.id,
        donorName: input.donor.name,
        gatewayReference,
        amount,
        currency: 'PKR',
        paymentMethod: 'JazzCash Sandbox Demo',
        status: 'Pending',
        verifiedByBackend: false,
        checkoutRequestId: input.requestId,
        createdAt: now,
        timestamp: now
      };
      orders.push(order);
      transactions.push(payment);
    }

    for (const [productId, quantity] of plan.stockByProduct) {
      const product = catalog.products.get(productId)!;
      const available = Number(product.stockAvailable ?? product.stock ?? 0);
      transaction.update(db.collection('products').doc(productId), { stockAvailable: available - quantity });
    }
    for (const [requirementId, quantity] of plan.reservedByRequirement) {
      const requirement = catalog.requirements.get(requirementId)!;
      transaction.update(db.collection('requirements').doc(requirementId), {
        quantityReserved: (requirement.quantityReserved || 0) + quantity
      });
    }
    for (const order of orders) transaction.create(db.collection('orders').doc(order.id), order);
    for (const payment of transactions) transaction.create(db.collection('transactions').doc(payment.id), payment);
    transaction.create(idempotencyRef, {
      donorId: input.donor.id,
      checkoutRequestId: input.requestId,
      orderIds: orders.map(order => order.id),
      transactionIds: transactions.map(payment => payment.id),
      createdAt: now
    });
    return { orders, transactions, replayed: false };
  });
}

export async function expirePendingDemoOrders(now = Date.now()): Promise<number> {
  const snapshot = await db.collection('orders').where('status', '==', 'Payment Pending').get();
  let expiredCount = 0;
  for (const candidate of snapshot.docs) {
    const expiresAt = Number(candidate.data().reservationExpiresAt || 0);
    if (!expiresAt || expiresAt > now) continue;
    const orderRef = db.collection('orders').doc(candidate.id);
    const expired = await db.runTransaction(async transaction => {
      const orderSnapshot = await transaction.get(orderRef);
      if (!orderSnapshot.exists) return false;
      const order = { ...orderSnapshot.data(), id: orderSnapshot.id } as Order;
      if (order.status !== 'Payment Pending' || !order.reservationExpiresAt || order.reservationExpiresAt > now) return false;

      const productQuantities = new Map<string, number>();
      const requirementQuantities = new Map<string, number>();
      for (const item of order.items) {
        productQuantities.set(item.productId, (productQuantities.get(item.productId) || 0) + item.quantity);
        if (item.requirementId) requirementQuantities.set(item.requirementId, (requirementQuantities.get(item.requirementId) || 0) + item.quantity);
      }
      const productRefs = [...productQuantities.keys()].map(id => db.collection('products').doc(id));
      const requirementRefs = [...requirementQuantities.keys()].map(id => db.collection('requirements').doc(id));
      const paymentRef = order.transactionId ? db.collection('transactions').doc(order.transactionId) : null;
      const [productSnapshots, requirementSnapshots, paymentSnapshot] = await Promise.all([
        Promise.all(productRefs.map(ref => transaction.get(ref))),
        Promise.all(requirementRefs.map(ref => transaction.get(ref))),
        paymentRef ? transaction.get(paymentRef) : Promise.resolve(null)
      ]);
      productSnapshots.forEach((productSnapshot, index) => {
        if (productSnapshot.exists) {
          const current = productSnapshot.data()!;
          transaction.update(productRefs[index], {
            stockAvailable: Number(current.stockAvailable ?? current.stock ?? 0) + (productQuantities.get(productSnapshot.id) || 0)
          });
        }
      });
      requirementSnapshots.forEach((requirementSnapshot, index) => {
        if (requirementSnapshot.exists) {
          const current = requirementSnapshot.data()!;
          transaction.update(requirementRefs[index], {
            quantityReserved: Math.max(0, Number(current.quantityReserved || 0) - (requirementQuantities.get(requirementSnapshot.id) || 0))
          });
        }
      });
      transaction.update(orderRef, { status: 'Payment Expired', updatedAt: now });
      if (paymentRef && paymentSnapshot?.exists) transaction.update(paymentRef, { status: 'Expired', timestamp: now });
      return true;
    });
    if (expired) expiredCount++;
  }
  return expiredCount;
}

// -----------------
// Orders
// -----------------
export async function getOrders(): Promise<Order[]> {
  try {
    const snap = await db.collection('orders').get();
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as Order));
  } catch (err) {
    console.error('Error fetching orders from Firestore:', err);
    return [];
  }
}

export async function getOrderById(id: string): Promise<Order | null> {
  const snapshot = await db.collection('orders').doc(id).get();
  return snapshot.exists ? { ...snapshot.data(), id: snapshot.id } as Order : null;
}

export async function getOrdersByDonor(donorId: string): Promise<Order[]> {
  const snapshot = await db.collection('orders').where('donorId', '==', donorId).get();
  return snapshot.docs.map(document => ({ ...document.data(), id: document.id } as Order));
}

export async function getTransactionsByDonor(donorId: string): Promise<Transaction[]> {
  const snapshot = await db.collection('transactions').where('donorId', '==', donorId).get();
  return snapshot.docs.map(document => ({ ...document.data(), id: document.id } as Transaction));
}

export class OrderTransitionError extends Error {
  constructor(readonly kind: 'forbidden' | 'conflict', message: string) {
    super(message);
  }
}

export async function transitionOrderStatus(input: {
  orderId: string;
  actorId: string;
  actorRole: 'supplier' | 'ngo';
  allowedFrom: Order['status'][];
  status: Order['status'];
  updates?: Partial<Order>;
  confirmedAt?: number;
}): Promise<Order | null> {
  const orderRef = db.collection('orders').doc(input.orderId);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists) return null;
    const order = { ...snapshot.data(), id: snapshot.id } as Order;
    try {
      assertOrderTransitionAllowed(order.status, input.allowedFrom);
    } catch (error) {
      if (error instanceof OrderStateError) {
        throw new OrderTransitionError('conflict', `Order cannot transition from '${order.status}' to '${input.status}'.`);
      }
      throw error;
    }

    let deliveryRequirements: Array<{ ref: FirebaseFirestore.DocumentReference; data: Requirement }> = [];
    if (input.actorRole === 'supplier') {
      try {
        assertOrderActorOwnership(order, input.actorId, 'supplier');
      } catch (error) {
        if (error instanceof CommerceAuthorizationError) throw new OrderTransitionError('forbidden', error.message);
        throw error;
      }
    } else {
      const campaignRef = db.collection('campaigns').doc(order.campaignId);
      const campaignSnapshot = await transaction.get(campaignRef);
      try {
        assertOrderActorOwnership(order, input.actorId, 'ngo', campaignSnapshot.data()?.ngoId);
      } catch (error) {
        if (error instanceof CommerceAuthorizationError) throw new OrderTransitionError('forbidden', error.message);
        throw error;
      }
      const requirementSnapshot = await transaction.get(
        db.collection('requirements').where('campaignId', '==', order.campaignId)
      );
      deliveryRequirements = requirementSnapshot.docs.map(document => ({
        ref: document.ref,
        data: { ...document.data(), id: document.id } as Requirement
      }));
    }

    const updates: Partial<Order> = {
      ...input.updates,
      status: input.status,
      updatedAt: input.confirmedAt ?? Date.now()
    };
    transaction.update(orderRef, updates);

    if (input.actorRole === 'ngo') {
      for (const requirement of deliveryRequirements) {
        const deliveredQuantity = order.items
          .filter(item => item.requirementId === requirement.data.id || (
            !item.requirementId && item.productName.toLowerCase().includes(requirement.data.itemName.toLowerCase())
          ))
          .reduce((sum, item) => sum + item.quantity, 0);
        if (deliveredQuantity > 0) {
          transaction.update(requirement.ref, {
            quantityDelivered: (requirement.data.quantityDelivered || 0) + deliveredQuantity
          });
        }
      }
    }

    return { ...order, ...updates } as Order;
  });
}

export async function saveOrder(order: Order): Promise<void> {
  await db.collection('orders').doc(order.id).set(order);
}

export async function updateOrder(id: string, updates: Partial<Order>): Promise<void> {
  await db.collection('orders').doc(id).update(updates);
}

// -----------------
// Transactions
// -----------------
export async function getTransactions(): Promise<Transaction[]> {
  try {
    const snap = await db.collection('transactions').get();
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as Transaction));
  } catch (err) {
    console.error('Error fetching transactions from Firestore:', err);
    return [];
  }
}

export async function saveTransaction(tx: Transaction): Promise<void> {
  await db.collection('transactions').doc(tx.id).set(tx);
}

export async function updateTransaction(id: string, updates: Partial<Transaction>): Promise<void> {
  await db.collection('transactions').doc(id).update(updates);
}
