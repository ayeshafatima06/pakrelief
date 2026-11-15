import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firestoreService';
import {
  buildPricedCheckout,
  checkoutRequestKey,
  CheckoutLineInput,
  CheckoutValidationError
} from './commerceService';
import {
  Campaign,
  Order,
  Product,
  Requirement,
  SafepayCheckout,
  SafepayPaymentStatus,
  Transaction,
  UserProfile
} from '../types';
import { getSafepayConfig, SafepayConfig } from './safepayConfig';
import {
  createSafepayPassport,
  createSafepaySession,
  fetchSafepayTracker,
  buildHostedCheckoutUrl
} from './safepayClient';
import {
  classifySafepayEvent,
  ConfirmationAction,
  eventAmountMinor,
  eventCheckoutId,
  eventCurrency,
  eventState,
  eventTracker,
  parseSafepayWebhookEvent,
  resolvePaymentConfirmation,
  resolveTrackerOutcome,
  SafepayWebhookEvent,
  TERMINAL_PAYMENT_STATUSES,
  toMinorUnits,
  verifySafepaySignature
} from './safepayCore';

const RESERVATION_WINDOW_MS = 15 * 60 * 1000;

export class SafepayConfigError extends Error {
  constructor(readonly missing: string[]) {
    super(`Safepay is not configured. Missing server environment variables: ${missing.join(', ')}.`);
    this.name = 'SafepayConfigError';
  }
}
export class SafepayCheckoutNotFoundError extends Error {
  constructor() {
    super('Checkout not found.');
    this.name = 'SafepayCheckoutNotFoundError';
  }
}
export class SafepayCheckoutForbiddenError extends Error {
  constructor() {
    super('This checkout does not belong to the authenticated donor.');
    this.name = 'SafepayCheckoutForbiddenError';
  }
}

async function loadOrdersByIds(ids: string[]): Promise<Order[]> {
  if (!ids.length) return [];
  const snapshots = await Promise.all(ids.map(id => db.collection('orders').doc(id).get()));
  return snapshots.filter(s => s.exists).map(s => ({ ...s.data(), id: s.id } as Order));
}

/** Shape consumed by SafepayCheckoutModal.normalizeResult. */
export function toCheckoutResult(
  checkout: SafepayCheckout,
  orders: Order[],
  extra?: { replayed?: boolean; message?: string }
) {
  return {
    success: true,
    checkoutId: checkout.id,
    paymentStatus: checkout.paymentStatus,
    orders,
    amount: checkout.amount,
    amountMinor: checkout.amountMinor,
    currency: checkout.currency,
    checkoutUrl: checkout.checkoutUrl ?? null,
    tracker: checkout.tracker ?? null,
    lastError: checkout.lastError ?? undefined,
    reservationExpiresAt: checkout.reservationExpiresAt,
    requiresReview: checkout.paymentStatus === 'requires_review',
    replayed: extra?.replayed ?? false,
    message: extra?.message
  };
}

// ---------------------------------------------------------------------------
// 1. Transactional reservation (server-priced, stock-checked, donor-idempotent)
// ---------------------------------------------------------------------------

export async function reserveSafepayCheckout(input: {
  donor: UserProfile;
  requestId: string;
  lines: CheckoutLineInput[];
  environment: 'sandbox' | 'production';
  now?: number;
}): Promise<{ checkout: SafepayCheckout; orders: Order[]; transactions: Transaction[]; replayed: boolean }> {
  const now = input.now ?? Date.now();
  const idempotencyId = checkoutRequestKey(input.donor.id, input.requestId);
  const idempotencyRef = db.collection('checkoutRequests').doc(idempotencyId);

  return db.runTransaction(async transaction => {
    const idempotencySnapshot = await transaction.get(idempotencyRef);
    if (idempotencySnapshot.exists) {
      const saved = idempotencySnapshot.data()!;
      if (saved.gateway === 'safepay' && typeof saved.checkoutId === 'string') {
        const existingRef = db.collection('safepayCheckouts').doc(saved.checkoutId);
        const existingSnap = await transaction.get(existingRef);
        if (existingSnap.exists) {
          const existing = { ...existingSnap.data(), id: existingSnap.id } as SafepayCheckout;
          // A failed session that never created a tracker holds no payment risk; allow a
          // fresh reserve under the same donor-scoped requestId so the donor can retry.
          const retryableFailure = existing.paymentStatus === 'failed' && !existing.tracker;
          if (!retryableFailure) {
            const [orderSnaps, txSnaps] = await Promise.all([
              Promise.all(existing.orderIds.map(id => transaction.get(db.collection('orders').doc(id)))),
              Promise.all(existing.transactionIds.map(id => transaction.get(db.collection('transactions').doc(id))))
            ]);
            return {
              checkout: existing,
              orders: orderSnaps.filter(s => s.exists).map(s => ({ ...s.data(), id: s.id } as Order)),
              transactions: txSnaps.filter(s => s.exists).map(s => ({ ...s.data(), id: s.id } as Transaction)),
              replayed: true
            };
          }
        }
      }
    }

    const productIds = [...new Set(input.lines.map(line => line.productId))];
    const requirementIds = [...new Set(input.lines.map(line => line.requirementId))];
    const campaignIds = [...new Set(input.lines.map(line => line.campaignId))];
    const [productSnapshots, requirementSnapshots, campaignSnapshots] = await Promise.all([
      Promise.all(productIds.map(id => transaction.get(db.collection('products').doc(id)))),
      Promise.all(requirementIds.map(id => transaction.get(db.collection('requirements').doc(id)))),
      Promise.all(campaignIds.map(id => transaction.get(db.collection('campaigns').doc(id))))
    ]);
    const products = productSnapshots.filter(s => s.exists).map(s => ({ ...s.data(), id: s.id } as Product));
    const supplierIds = [...new Set(products.map(product => product.supplierId))];
    const supplierSnapshots = await Promise.all(supplierIds.map(id => transaction.get(db.collection('suppliers').doc(id))));
    const approvedSupplierIds = new Set(supplierSnapshots.flatMap((snapshot, index) => {
      const supplier = snapshot.exists ? snapshot.data() : undefined;
      return supplier?.status === 'approved' && supplier.linkedUserId === supplierIds[index] ? [supplierIds[index]] : [];
    }));
    const catalog = {
      products: new Map(products.map(product => [product.id, product])),
      requirements: new Map(requirementSnapshots.filter(s => s.exists).map(s => [s.id, { ...s.data(), id: s.id } as Requirement])),
      campaigns: new Map(campaignSnapshots.filter(s => s.exists).map(s => [s.id, { ...s.data(), id: s.id } as Campaign])),
      approvedSupplierIds
    };

    const plan = buildPricedCheckout(input.lines, catalog);
    const amountMinor = toMinorUnits(plan.totalAmount);
    const grouped = new Map<string, typeof plan.lines>();
    for (const line of plan.lines) {
      const groupKey = `${line.campaignId}:${line.supplierId}`;
      grouped.set(groupKey, [...(grouped.get(groupKey) || []), line]);
    }

    const checkoutRef = db.collection('safepayCheckouts').doc();
    const checkoutId = checkoutRef.id;
    const reservationExpiresAt = now + RESERVATION_WINDOW_MS;
    const orders: Order[] = [];
    const transactions: Transaction[] = [];

    for (const lines of grouped.values()) {
      const orderRef = db.collection('orders').doc();
      const paymentRef = db.collection('transactions').doc();
      const firstLine = lines[0];
      const orderNumber = `PKR-SFPY-${orderRef.id.slice(-10).toUpperCase()}`;
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
        gatewayReference: '',
        transactionId: paymentRef.id,
        checkoutRequestId: input.requestId,
        checkoutId,
        reservationExpiresAt,
        paymentMethod: 'Safepay',
        createdAt: now,
        updatedAt: now
      };
      const payment: Transaction = {
        id: paymentRef.id,
        orderId: order.id,
        orderNumber,
        donorId: input.donor.id,
        donorName: input.donor.name,
        gatewayReference: '',
        amount,
        currency: 'PKR',
        paymentMethod: 'Safepay',
        status: 'Pending',
        verifiedByBackend: false,
        checkoutRequestId: input.requestId,
        checkoutId,
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

    const checkout: SafepayCheckout = {
      id: checkoutId,
      donorId: input.donor.id,
      checkoutRequestId: input.requestId,
      idempotencyId,
      orderIds: orders.map(order => order.id),
      transactionIds: transactions.map(payment => payment.id),
      lines: input.lines,
      amount: plan.totalAmount,
      amountMinor,
      currency: 'PKR',
      environment: input.environment,
      paymentStatus: 'initiating',
      tracker: null,
      checkoutUrl: null,
      gatewayState: null,
      reservationExpiresAt,
      lastError: null,
      confirmedAt: null,
      createdAt: now,
      updatedAt: now
    };
    transaction.create(checkoutRef, checkout);
    transaction.set(idempotencyRef, {
      donorId: input.donor.id,
      checkoutRequestId: input.requestId,
      gateway: 'safepay',
      checkoutId,
      orderIds: checkout.orderIds,
      transactionIds: checkout.transactionIds,
      createdAt: now
    });
    return { checkout, orders, transactions, replayed: false };
  });
}

// ---------------------------------------------------------------------------
// 2. Session initiation (server-to-server REST; never a frontend signal)
// ---------------------------------------------------------------------------

export async function initiateSafepaySession(checkoutId: string, config: SafepayConfig): Promise<SafepayCheckout> {
  const checkoutRef = db.collection('safepayCheckouts').doc(checkoutId);
  const snapshot = await checkoutRef.get();
  if (!snapshot.exists) throw new SafepayCheckoutNotFoundError();
  const checkout = { ...snapshot.data(), id: snapshot.id } as SafepayCheckout;
  if (checkout.paymentStatus !== 'initiating') return checkout;

  try {
    const session = await createSafepaySession(config, {
      amountMinor: checkout.amountMinor,
      currency: checkout.currency,
      checkoutId
    });
    const tbt = await createSafepayPassport(config);
    const checkoutUrl = buildHostedCheckoutUrl(config, { tracker: session.tracker, tbt, checkoutId });
    const now = Date.now();
    await checkoutRef.update({
      tracker: session.tracker,
      checkoutUrl,
      gatewayState: session.state,
      paymentStatus: 'pending',
      lastError: FieldValue.delete(),
      updatedAt: now
    });
    const batch = db.batch();
    for (const orderId of checkout.orderIds) {
      batch.update(db.collection('orders').doc(orderId), { gatewayReference: session.tracker, updatedAt: now });
    }
    for (const transactionId of checkout.transactionIds) {
      batch.update(db.collection('transactions').doc(transactionId), {
        gatewayReference: session.tracker,
        safepayTracker: session.tracker
      });
    }
    await batch.commit();
    return {
      ...checkout,
      tracker: session.tracker,
      checkoutUrl,
      gatewayState: session.state,
      paymentStatus: 'pending',
      lastError: null,
      updatedAt: now
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Safepay session creation failed.';
    return releaseSafepayCheckout(checkoutId, 'failed', message);
  }
}

export async function createSafepayCheckout(input: {
  donor: UserProfile;
  requestId: string;
  lines: CheckoutLineInput[];
}): Promise<{ checkout: SafepayCheckout; orders: Order[]; replayed: boolean }> {
  const config = getSafepayConfig();
  if (!config.configured) throw new SafepayConfigError(config.missing);
  const reserved = await reserveSafepayCheckout({ ...input, environment: config.environment });
  let checkout = reserved.checkout;
  if (checkout.paymentStatus === 'initiating') {
    checkout = await initiateSafepaySession(checkout.id, config);
  }
  const orders = await loadOrdersByIds(checkout.orderIds);
  return { checkout, orders, replayed: reserved.replayed };
}

// ---------------------------------------------------------------------------
// 3. Idempotent, guarded confirmation (the ONLY path that marks an order paid)
// ---------------------------------------------------------------------------

export async function confirmSafepayCheckout(
  checkoutId: string,
  evidence: {
    amountMinor: number | null;
    currency: string | null;
    state?: string | null;
    tracker?: string | null;
    raw?: unknown;
  },
  now = Date.now()
): Promise<{ checkout: SafepayCheckout; action: ConfirmationAction }> {
  const checkoutRef = db.collection('safepayCheckouts').doc(checkoutId);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(checkoutRef);
    if (!snapshot.exists) throw new SafepayCheckoutNotFoundError();
    const checkout = { ...snapshot.data(), id: snapshot.id } as SafepayCheckout;

    const decision = resolvePaymentConfirmation({
      checkoutStatus: checkout.paymentStatus,
      checkoutAmountMinor: checkout.amountMinor,
      checkoutCurrency: checkout.currency,
      reservationExpiresAt: checkout.reservationExpiresAt,
      evidenceAmountMinor: evidence.amountMinor,
      evidenceCurrency: evidence.currency,
      evidenceState: evidence.state,
      now
    });

    if (decision.action === 'ignore') {
      return { checkout, action: 'ignore' as const };
    }
    if (decision.action === 'requires_review') {
      const updates = {
        paymentStatus: 'requires_review' as SafepayPaymentStatus,
        lastError: decision.reason || 'requires_review',
        gatewayState: evidence.state || checkout.gatewayState || null,
        updatedAt: now
      };
      transaction.update(checkoutRef, updates);
      return { checkout: { ...checkout, ...updates }, action: 'requires_review' as const };
    }

    const orderRefs = checkout.orderIds.map(id => db.collection('orders').doc(id));
    const txRefs = checkout.transactionIds.map(id => db.collection('transactions').doc(id));
    const [orderSnaps, txSnaps] = await Promise.all([
      Promise.all(orderRefs.map(ref => transaction.get(ref))),
      Promise.all(txRefs.map(ref => transaction.get(ref)))
    ]);
    const orders = orderSnaps.filter(s => s.exists).map(s => ({ ...s.data(), id: s.id } as Order));
    if (orders.length !== checkout.orderIds.length || orders.some(order => order.status !== 'Payment Pending')) {
      const updates = {
        paymentStatus: 'requires_review' as SafepayPaymentStatus,
        lastError: 'order_state_changed',
        updatedAt: now
      };
      transaction.update(checkoutRef, updates);
      return { checkout: { ...checkout, ...updates }, action: 'requires_review' as const };
    }

    const requirementQuantities = new Map<string, number>();
    for (const order of orders) {
      for (const item of order.items) {
        if (item.requirementId) {
          requirementQuantities.set(item.requirementId, (requirementQuantities.get(item.requirementId) || 0) + item.quantity);
        }
      }
    }
    const requirementRefs = [...requirementQuantities.keys()].map(id => db.collection('requirements').doc(id));
    const requirementSnaps = await Promise.all(requirementRefs.map(ref => transaction.get(ref)));

    const tracker = evidence.tracker || checkout.tracker || '';
    orderRefs.forEach((ref, index) => {
      if (orderSnaps[index].exists) {
        transaction.update(ref, {
          status: 'Payment Confirmed',
          gatewayReference: tracker,
          paymentConfirmedAt: now,
          updatedAt: now
        });
      }
    });
    txRefs.forEach((ref, index) => {
      if (txSnaps[index].exists) {
        transaction.update(ref, {
          status: 'Verified',
          verifiedStatus: 'verified',
          verifiedByBackend: true,
          verifiedAt: now,
          gatewayReference: tracker,
          safepayTracker: tracker,
          gatewayState: evidence.state || 'TRACKER_ENDED',
          rawGatewayResponse: evidence.raw ?? null,
          timestamp: now
        });
      }
    });
    requirementSnaps.forEach((snap, index) => {
      if (snap.exists) {
        const current = snap.data()!;
        const quantity = requirementQuantities.get(snap.id) || 0;
        transaction.update(requirementRefs[index], {
          quantityReserved: Math.max(0, Number(current.quantityReserved || 0) - quantity),
          quantityFunded: Number(current.quantityFunded || 0) + quantity
        });
      }
    });

    const updates = {
      paymentStatus: 'succeeded' as SafepayPaymentStatus,
      tracker,
      gatewayState: evidence.state || 'TRACKER_ENDED',
      confirmedAt: now,
      lastError: FieldValue.delete(),
      updatedAt: now
    };
    transaction.update(checkoutRef, updates);
    return {
      checkout: { ...checkout, ...updates, lastError: null } as SafepayCheckout,
      action: 'confirm' as const
    };
  });
}

// ---------------------------------------------------------------------------
// 4. Release reservations on failure / cancellation / expiry (restore stock)
// ---------------------------------------------------------------------------

const RELEASE_TRANSACTION_STATUS: Record<'failed' | 'cancelled' | 'expired', string> = {
  failed: 'Failed',
  cancelled: 'Cancelled',
  expired: 'Expired'
};

export async function releaseSafepayCheckout(
  checkoutId: string,
  targetStatus: 'failed' | 'cancelled' | 'expired',
  reason: string,
  now = Date.now()
): Promise<SafepayCheckout> {
  const checkoutRef = db.collection('safepayCheckouts').doc(checkoutId);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(checkoutRef);
    if (!snapshot.exists) throw new SafepayCheckoutNotFoundError();
    const checkout = { ...snapshot.data(), id: snapshot.id } as SafepayCheckout;

    // Never undo a confirmed payment or a review flag; idempotent on terminal states.
    if (checkout.paymentStatus === 'succeeded' || checkout.paymentStatus === 'requires_review') return checkout;
    if (TERMINAL_PAYMENT_STATUSES.includes(checkout.paymentStatus)) return checkout;

    const orderRefs = checkout.orderIds.map(id => db.collection('orders').doc(id));
    const txRefs = checkout.transactionIds.map(id => db.collection('transactions').doc(id));
    const [orderSnaps, txSnaps] = await Promise.all([
      Promise.all(orderRefs.map(ref => transaction.get(ref))),
      Promise.all(txRefs.map(ref => transaction.get(ref)))
    ]);
    const orders = orderSnaps.filter(s => s.exists).map(s => ({ ...s.data(), id: s.id } as Order));

    const productQuantities = new Map<string, number>();
    const requirementQuantities = new Map<string, number>();
    for (const order of orders) {
      if (order.status !== 'Payment Pending') continue; // only restore live reservations
      for (const item of order.items) {
        productQuantities.set(item.productId, (productQuantities.get(item.productId) || 0) + item.quantity);
        if (item.requirementId) {
          requirementQuantities.set(item.requirementId, (requirementQuantities.get(item.requirementId) || 0) + item.quantity);
        }
      }
    }
    const productRefs = [...productQuantities.keys()].map(id => db.collection('products').doc(id));
    const requirementRefs = [...requirementQuantities.keys()].map(id => db.collection('requirements').doc(id));
    const [productSnaps, requirementSnaps] = await Promise.all([
      Promise.all(productRefs.map(ref => transaction.get(ref))),
      Promise.all(requirementRefs.map(ref => transaction.get(ref)))
    ]);

    productSnaps.forEach((snap, index) => {
      if (snap.exists) {
        const current = snap.data()!;
        transaction.update(productRefs[index], {
          stockAvailable: Number(current.stockAvailable ?? current.stock ?? 0) + (productQuantities.get(snap.id) || 0)
        });
      }
    });
    requirementSnaps.forEach((snap, index) => {
      if (snap.exists) {
        const current = snap.data()!;
        transaction.update(requirementRefs[index], {
          quantityReserved: Math.max(0, Number(current.quantityReserved || 0) - (requirementQuantities.get(snap.id) || 0))
        });
      }
    });
    orderSnaps.forEach((snap, index) => {
      if (snap.exists && (snap.data() as Order).status === 'Payment Pending') {
        transaction.update(orderRefs[index], { status: 'Payment Expired', updatedAt: now });
      }
    });
    txSnaps.forEach((snap, index) => {
      if (snap.exists) {
        transaction.update(txRefs[index], {
          status: RELEASE_TRANSACTION_STATUS[targetStatus],
          failureReason: reason,
          timestamp: now
        });
      }
    });

    const updates = {
      paymentStatus: targetStatus,
      lastError: reason,
      updatedAt: now
    };
    transaction.update(checkoutRef, updates);
    return { ...checkout, ...updates } as SafepayCheckout;
  });
}

export async function expireSafepayCheckouts(now = Date.now()): Promise<number> {
  const snapshot = await db.collection('safepayCheckouts')
    .where('paymentStatus', 'in', ['initiating', 'pending'])
    .get();
  let expired = 0;
  for (const document of snapshot.docs) {
    const checkout = { ...document.data(), id: document.id } as SafepayCheckout;
    if (!checkout.reservationExpiresAt || checkout.reservationExpiresAt > now) continue;
    const released = await releaseSafepayCheckout(
      checkout.id,
      'expired',
      'Reservation window elapsed before payment confirmation.',
      now
    );
    if (released.paymentStatus === 'expired') expired++;
  }
  return expired;
}

// ---------------------------------------------------------------------------
// 5. Donor-scoped reads + server-to-server reconciliation
// ---------------------------------------------------------------------------

export async function reconcileSafepayCheckout(checkoutId: string, now = Date.now()): Promise<SafepayCheckout> {
  const config = getSafepayConfig();
  const ref = db.collection('safepayCheckouts').doc(checkoutId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new SafepayCheckoutNotFoundError();
  const checkout = { ...snapshot.data(), id: snapshot.id } as SafepayCheckout;
  if (checkout.paymentStatus !== 'pending' || !checkout.tracker || !config.configured) return checkout;

  let report;
  try {
    report = await fetchSafepayTracker(config, checkout.tracker);
  } catch {
    return checkout; // transient gateway error; keep waiting for the webhook
  }
  const outcome = resolveTrackerOutcome(report.state);
  if (outcome === 'succeeded') {
    // The tracker was created with this exact server-priced amount; TRACKER_ENDED on a
    // server-to-server authenticated fetch is verified payment even if the report omits amount.
    const result = await confirmSafepayCheckout(checkoutId, {
      amountMinor: report.amountMinor ?? checkout.amountMinor,
      currency: report.currency ?? checkout.currency,
      state: report.state,
      tracker: checkout.tracker,
      raw: report.raw
    }, now);
    return result.checkout;
  }
  if (outcome === 'cancelled') {
    return releaseSafepayCheckout(checkoutId, 'cancelled', 'Safepay reported the checkout was cancelled.', now);
  }
  if (outcome === 'expired') {
    return releaseSafepayCheckout(checkoutId, 'expired', 'Safepay reported the checkout expired.', now);
  }
  if (outcome === 'failed') {
    return releaseSafepayCheckout(checkoutId, 'failed', 'Safepay reported the payment failed.', now);
  }
  return checkout;
}

export async function getSafepayCheckoutForDonor(
  checkoutId: string,
  donorId: string,
  opts?: { reconcile?: boolean }
): Promise<{ checkout: SafepayCheckout; orders: Order[] }> {
  const snapshot = await db.collection('safepayCheckouts').doc(checkoutId).get();
  if (!snapshot.exists) throw new SafepayCheckoutNotFoundError();
  let checkout = { ...snapshot.data(), id: snapshot.id } as SafepayCheckout;
  if (checkout.donorId !== donorId) throw new SafepayCheckoutForbiddenError();

  const now = Date.now();
  const live = checkout.paymentStatus === 'pending' || checkout.paymentStatus === 'initiating';
  if (live && checkout.reservationExpiresAt && checkout.reservationExpiresAt <= now) {
    checkout = await releaseSafepayCheckout(checkoutId, 'expired', 'Reservation window elapsed before payment confirmation.', now);
  } else if (opts?.reconcile && checkout.paymentStatus === 'pending' && checkout.tracker) {
    checkout = await reconcileSafepayCheckout(checkoutId, now);
  }
  const orders = await loadOrdersByIds(checkout.orderIds);
  return { checkout, orders };
}

export async function cancelSafepayCheckout(checkoutId: string, donorId: string): Promise<{ checkout: SafepayCheckout; orders: Order[] }> {
  const snapshot = await db.collection('safepayCheckouts').doc(checkoutId).get();
  if (!snapshot.exists) throw new SafepayCheckoutNotFoundError();
  const checkout = { ...snapshot.data(), id: snapshot.id } as SafepayCheckout;
  if (checkout.donorId !== donorId) throw new SafepayCheckoutForbiddenError();

  // A cancelled redirect is NOT proof of non-payment. Re-verify with Safepay first so a
  // real payment is never cancelled; only release when the gateway confirms it is unpaid.
  let current = checkout;
  if (checkout.paymentStatus === 'pending' && checkout.tracker) {
    current = await reconcileSafepayCheckout(checkoutId);
  }
  if (current.paymentStatus === 'pending' || current.paymentStatus === 'initiating') {
    current = await releaseSafepayCheckout(checkoutId, 'cancelled', 'Checkout cancelled by donor before payment.');
  }
  const orders = await loadOrdersByIds(current.orderIds);
  return { checkout: current, orders };
}

// ---------------------------------------------------------------------------
// 6. Signature-verified webhook processing with event-token dedup
// ---------------------------------------------------------------------------

async function recordAdverseEvent(
  checkout: SafepayCheckout,
  event: SafepayWebhookEvent,
  kind: 'refunded' | 'reversed' | 'voided',
  now: number
): Promise<void> {
  // Post-payment adverse events are recorded for admin reconciliation; funded stock is
  // never silently re-released because goods may already be dispatched/delivered.
  const batch = db.batch();
  for (const transactionId of checkout.transactionIds) {
    batch.update(db.collection('transactions').doc(transactionId), {
      verifiedStatus: kind === 'refunded' ? 'refunded' : 'flagged',
      status: kind === 'refunded' ? 'Refunded' : 'Flagged',
      flagged: true,
      gatewayState: eventState(event) || checkout.gatewayState || null,
      failureReason: event.data?.message || `Safepay ${kind} event`,
      timestamp: now
    });
  }
  batch.update(db.collection('safepayCheckouts').doc(checkout.id), {
    gatewayState: eventState(event) || checkout.gatewayState || null,
    lastError: `Safepay ${kind} event received; reconcile fulfillment/refund.`,
    updatedAt: now
  });
  await batch.commit();
}

export async function handleSafepayWebhook(
  rawBody: Buffer | string,
  signature: string | undefined,
  now = Date.now()
): Promise<{ status: number; body: Record<string, unknown> }> {
  const config = getSafepayConfig();
  if (!config.webhookSecret) {
    return { status: 503, body: { success: false, error: 'Safepay webhook secret is not configured.' } };
  }
  if (!verifySafepaySignature(rawBody, signature, config.webhookSecret)) {
    return { status: 400, body: { success: false, error: 'Invalid webhook signature.' } };
  }

  let event: SafepayWebhookEvent;
  try {
    event = parseSafepayWebhookEvent(rawBody);
  } catch (error) {
    return { status: 400, body: { success: false, error: error instanceof Error ? error.message : 'Invalid webhook payload.' } };
  }

  const kind = classifySafepayEvent(event.type);
  const tokenRef = db.collection('safepayWebhookEvents').doc(event.token);
  const tokenSnap = await tokenRef.get();
  if (tokenSnap.exists && tokenSnap.data()?.processed === true) {
    return { status: 200, body: { success: true, duplicate: true } };
  }

  let checkout: SafepayCheckout | null = null;
  const correlatedId = eventCheckoutId(event);
  if (correlatedId) {
    const snap = await db.collection('safepayCheckouts').doc(correlatedId).get();
    if (snap.exists) checkout = { ...snap.data(), id: snap.id } as SafepayCheckout;
  }
  if (!checkout) {
    const tracker = eventTracker(event);
    if (tracker) {
      const query = await db.collection('safepayCheckouts').where('tracker', '==', tracker).limit(1).get();
      if (!query.empty) checkout = { ...query.docs[0].data(), id: query.docs[0].id } as SafepayCheckout;
    }
  }

  await tokenRef.set({
    token: event.token,
    type: event.type,
    kind,
    checkoutId: checkout?.id ?? null,
    tracker: eventTracker(event),
    receivedAt: now,
    processed: false
  }, { merge: true });

  if (!checkout) {
    await tokenRef.set({ processed: true, outcome: 'unmatched', processedAt: now }, { merge: true });
    return { status: 200, body: { success: true, unmatched: true } };
  }

  let outcome: string = 'ignored';
  if (kind === 'succeeded') {
    const result = await confirmSafepayCheckout(checkout.id, {
      amountMinor: eventAmountMinor(event),
      currency: eventCurrency(event),
      state: eventState(event),
      tracker: eventTracker(event) || checkout.tracker,
      raw: event
    }, now);
    outcome = result.action;
  } else if (kind === 'failed') {
    const released = await releaseSafepayCheckout(
      checkout.id,
      'failed',
      typeof event.data?.message === 'string' ? event.data.message : 'Safepay reported the payment failed.',
      now
    );
    outcome = released.paymentStatus;
  } else if (kind === 'refunded' || kind === 'reversed' || kind === 'voided') {
    await recordAdverseEvent(checkout, event, kind, now);
    outcome = kind;
  }

  await tokenRef.set({ processed: true, outcome, processedAt: now }, { merge: true });
  return { status: 200, body: { success: true, kind, outcome, checkoutId: checkout.id } };
}