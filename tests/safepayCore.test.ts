import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SAFEPAY_SIGNATURE_HEADER,
  SafepayWebhookError,
  buildSafepayCheckoutUrl,
  classifySafepayEvent,
  computeSafepaySignature,
  eventAmountMinor,
  eventCheckoutId,
  eventCurrency,
  eventState,
  eventTracker,
  parseSafepayWebhookEvent,
  resolvePaymentConfirmation,
  resolveTrackerOutcome,
  toMinorUnits,
  verifySafepaySignature,
  type ConfirmationInput,
  type SafepayWebhookEvent
} from '../src/server/safepayCore';
import type { SafepayPaymentStatus } from '../src/types';

/**
 * These tests exercise the PURE Safepay core (no Firestore, no HTTP, no env), mirroring
 * the deterministic style of commerceService.test.ts. They cover the four required
 * payment scenarios — success, failure, invalid webhook signatures, duplicate callbacks —
 * both at the decision-function level and through an in-memory composition that uses the
 * REAL core functions exactly as handleSafepayWebhook composes them.
 */

const WEBHOOK_SECRET = 'test_webhook_shared_secret';
const CHECKOUT_ID = 'checkout-abc';
const TRACKER = 'track_abc123';
const AMOUNT_MINOR = 600000; // PKR 6000 in paisa
const CURRENCY = 'PKR';
const NOW = 1_700_000_000_000;
const EXPIRES_AT = NOW + 15 * 60 * 1000;

function successData(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tracker: TRACKER,
    state: 'TRACKER_ENDED',
    amount: AMOUNT_MINOR,
    currency: CURRENCY,
    metadata: { order_id: CHECKOUT_ID },
    ...extra
  };
}

function makeEvent(type: string, data: Record<string, unknown>, token = 'evt_1'): SafepayWebhookEvent {
  return { token, type, version: '1', data: data as SafepayWebhookEvent['data'] };
}

function baseInput(overrides: Partial<ConfirmationInput> = {}): ConfirmationInput {
  return {
    checkoutStatus: 'pending',
    checkoutAmountMinor: AMOUNT_MINOR,
    checkoutCurrency: CURRENCY,
    reservationExpiresAt: EXPIRES_AT,
    evidenceAmountMinor: AMOUNT_MINOR,
    evidenceCurrency: CURRENCY,
    evidenceState: 'TRACKER_ENDED',
    now: NOW,
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Signature verification (HMAC-SHA512 over the EXACT raw body, hex, constant-time)
// ---------------------------------------------------------------------------

test('signature header constant is the official lowercase X-SFPY-SIGNATURE', () => {
  assert.equal(SAFEPAY_SIGNATURE_HEADER, 'x-sfpy-signature');
});

test('computeSafepaySignature yields a 128-char lowercase hex SHA-512 digest', () => {
  const signature = computeSafepaySignature('{"a":1}', WEBHOOK_SECRET);
  assert.match(signature, /^[0-9a-f]{128}$/);
});

test('a correctly signed raw body verifies (payment success signature path)', () => {
  const raw = JSON.stringify(makeEvent('payment.succeeded', successData()));
  const signature = computeSafepaySignature(raw, WEBHOOK_SECRET);
  assert.equal(verifySafepaySignature(raw, signature, WEBHOOK_SECRET), true);
});

test('verification accepts Buffer bodies, uppercase hex, and surrounding whitespace', () => {
  const raw = JSON.stringify(makeEvent('payment.succeeded', successData()));
  const signature = computeSafepaySignature(raw, WEBHOOK_SECRET);
  assert.equal(verifySafepaySignature(Buffer.from(raw, 'utf8'), signature, WEBHOOK_SECRET), true);
  assert.equal(verifySafepaySignature(raw, `  ${signature.toUpperCase()}  `, WEBHOOK_SECRET), true);
});

test('INVALID SIGNATURE: a wrong, missing, or foreign-secret signature is rejected', () => {
  const raw = JSON.stringify(makeEvent('payment.succeeded', successData()));
  assert.equal(verifySafepaySignature(raw, 'deadbeef', WEBHOOK_SECRET), false);
  assert.equal(verifySafepaySignature(raw, undefined, WEBHOOK_SECRET), false);
  assert.equal(verifySafepaySignature(raw, null, WEBHOOK_SECRET), false);
  const foreign = computeSafepaySignature(raw, 'a-different-secret');
  assert.equal(verifySafepaySignature(raw, foreign, WEBHOOK_SECRET), false);
});

test('INVALID SIGNATURE: a length-mismatched signature returns false without throwing', () => {
  const raw = JSON.stringify(makeEvent('payment.succeeded', successData()));
  assert.equal(verifySafepaySignature(raw, 'short', WEBHOOK_SECRET), false);
  assert.equal(verifySafepaySignature(raw, 'f'.repeat(200), WEBHOOK_SECRET), false);
});

test('a missing webhook secret never verifies (fails closed)', () => {
  const raw = JSON.stringify(makeEvent('payment.succeeded', successData()));
  const signature = computeSafepaySignature(raw, WEBHOOK_SECRET);
  assert.equal(verifySafepaySignature(raw, signature, ''), false);
});

test('tampering with the raw body invalidates the signature', () => {
  const raw = JSON.stringify(makeEvent('payment.succeeded', successData()));
  const signature = computeSafepaySignature(raw, WEBHOOK_SECRET);
  const tampered = raw.replace(String(AMOUNT_MINOR), '1');
  assert.notEqual(tampered, raw);
  assert.equal(verifySafepaySignature(tampered, signature, WEBHOOK_SECRET), false);
});

test('re-serializing parsed JSON invalidates the signature (raw bytes are authoritative)', () => {
  const raw = JSON.stringify(makeEvent('payment.succeeded', successData()));
  const signature = computeSafepaySignature(raw, WEBHOOK_SECRET);
  const reserialized = JSON.stringify(JSON.parse(raw), null, 2);
  assert.notEqual(reserialized, raw);
  assert.equal(verifySafepaySignature(reserialized, signature, WEBHOOK_SECRET), false);
});

// ---------------------------------------------------------------------------
// Event envelope parsing + classification
// ---------------------------------------------------------------------------

test('parseSafepayWebhookEvent reads the official envelope and correlation fields', () => {
  const event = parseSafepayWebhookEvent(JSON.stringify(makeEvent('payment.succeeded', successData())));
  assert.equal(event.type, 'payment.succeeded');
  assert.equal(eventCheckoutId(event), CHECKOUT_ID);
  assert.equal(eventTracker(event), TRACKER);
  assert.equal(eventAmountMinor(event), AMOUNT_MINOR);
  assert.equal(eventCurrency(event), CURRENCY);
  assert.equal(eventState(event), 'TRACKER_ENDED');
});

test('parseSafepayWebhookEvent rejects malformed JSON and missing required fields', () => {
  assert.throws(() => parseSafepayWebhookEvent('not json'), SafepayWebhookError);
  assert.throws(() => parseSafepayWebhookEvent('[]'), /JSON object/);
  assert.throws(() => parseSafepayWebhookEvent(JSON.stringify({ type: 'payment.succeeded', data: {} })), /token is required/);
  assert.throws(() => parseSafepayWebhookEvent(JSON.stringify({ token: 't', data: {} })), /type is required/);
  assert.throws(() => parseSafepayWebhookEvent(JSON.stringify({ token: 't', type: 'payment.succeeded' })), /data object is required/);
});

test('event field extractors return null for missing or invalid values', () => {
  const empty = makeEvent('payment.succeeded', {});
  assert.equal(eventCheckoutId(empty), null);
  assert.equal(eventTracker(empty), null);
  assert.equal(eventAmountMinor(empty), null);
  assert.equal(eventCurrency(empty), null);
  assert.equal(eventState(empty), null);
  assert.equal(eventAmountMinor(makeEvent('payment.succeeded', { amount: 1.5 })), null);
  assert.equal(eventAmountMinor(makeEvent('payment.succeeded', { amount: '600000' })), null);
});

test('classifySafepayEvent maps the official event types (success / failure / adverse)', () => {
  assert.equal(classifySafepayEvent('payment.succeeded'), 'succeeded');
  assert.equal(classifySafepayEvent('payment.failed'), 'failed');
  assert.equal(classifySafepayEvent('payment.refunded'), 'refunded');
  assert.equal(classifySafepayEvent('authorization.reversed'), 'reversed');
  assert.equal(classifySafepayEvent('void.succeeded'), 'voided');
  assert.equal(classifySafepayEvent('subscription.created'), 'unknown');
});

// ---------------------------------------------------------------------------
// Tracker lifecycle + amount + URL helpers
// ---------------------------------------------------------------------------

test('resolveTrackerOutcome maps official TRACKER_* states', () => {
  assert.equal(resolveTrackerOutcome('TRACKER_ENDED'), 'succeeded');
  assert.equal(resolveTrackerOutcome('TRACKER_STARTED'), 'pending');
  assert.equal(resolveTrackerOutcome('TRACKER_AUTHORIZED'), 'pending');
  assert.equal(resolveTrackerOutcome('TRACKER_ENROLLED'), 'pending');
  assert.equal(resolveTrackerOutcome('TRACKER_CANCELLED'), 'cancelled');
  assert.equal(resolveTrackerOutcome('TRACKER_EXPIRED'), 'expired');
  assert.equal(resolveTrackerOutcome('TRACKER_REFUNDED'), 'refunded');
  assert.equal(resolveTrackerOutcome('TRACKER_PARTIAL_REFUND'), 'refunded');
  assert.equal(resolveTrackerOutcome('TRACKER_REVERSED'), 'failed');
  assert.equal(resolveTrackerOutcome('TRACKER_VOIDED'), 'failed');
  assert.equal(resolveTrackerOutcome('TRACKER_DISPUTED'), 'unknown');
  assert.equal(resolveTrackerOutcome(null), 'unknown');
});

test('toMinorUnits converts whole PKR to paisa and rejects invalid amounts', () => {
  assert.equal(toMinorUnits(6000), 600000);
  assert.equal(toMinorUnits(1), 100);
  assert.throws(() => toMinorUnits(0), /positive whole PKR/);
  assert.throws(() => toMinorUnits(-5), /positive whole PKR/);
  assert.throws(() => toMinorUnits(10.5), /positive whole PKR/);
  assert.throws(() => toMinorUnits(Number.MAX_SAFE_INTEGER), /precision/);
});

test('buildSafepayCheckoutUrl uses the official embedded base and query params', () => {
  const sandbox = buildSafepayCheckoutUrl({
    environment: 'sandbox',
    tracker: TRACKER,
    tbt: 'tbt_xyz',
    redirectUrl: 'https://app.test/?safepay_checkout=c1&safepay_outcome=complete',
    cancelUrl: 'https://app.test/?safepay_checkout=c1&safepay_outcome=cancel'
  });
  assert.ok(sandbox.startsWith('https://sandbox.api.getsafepay.com/embedded/?'));
  const params = new URL(sandbox).searchParams;
  assert.equal(params.get('environment'), 'sandbox');
  assert.equal(params.get('tracker'), TRACKER);
  assert.equal(params.get('tbt'), 'tbt_xyz');
  assert.equal(params.get('source'), 'hosted');
  assert.equal(params.get('redirect_url'), 'https://app.test/?safepay_checkout=c1&safepay_outcome=complete');
  assert.equal(params.get('cancel_url'), 'https://app.test/?safepay_checkout=c1&safepay_outcome=cancel');

  const production = buildSafepayCheckoutUrl({
    environment: 'production', tracker: TRACKER, tbt: 't', redirectUrl: 'https://a', cancelUrl: 'https://b'
  });
  assert.ok(production.startsWith('https://getsafepay.com/embedded/?'));
});

// ---------------------------------------------------------------------------
// Confirmation guard — the single source of truth for "may we mark this paid?"
// ---------------------------------------------------------------------------

test('PAYMENT SUCCESS: matching verified evidence on a live reservation confirms', () => {
  assert.deepEqual(resolvePaymentConfirmation(baseInput()), { action: 'confirm' });
  assert.deepEqual(resolvePaymentConfirmation(baseInput({ checkoutStatus: 'initiating' })), { action: 'confirm' });
});

test('DUPLICATE CALLBACK: an already-succeeded checkout is ignored (idempotent)', () => {
  assert.deepEqual(
    resolvePaymentConfirmation(baseInput({ checkoutStatus: 'succeeded' })),
    { action: 'ignore', reason: 'already_succeeded' }
  );
});

test('DUPLICATE CALLBACK: an checkout already under review is ignored', () => {
  assert.deepEqual(
    resolvePaymentConfirmation(baseInput({ checkoutStatus: 'requires_review' })),
    { action: 'ignore', reason: 'already_under_review' }
  );
});

test('a non-success evidence state never confirms', () => {
  assert.deepEqual(
    resolvePaymentConfirmation(baseInput({ evidenceState: 'TRACKER_STARTED' })),
    { action: 'ignore', reason: 'not_a_success_state' }
  );
  assert.deepEqual(
    resolvePaymentConfirmation(baseInput({ evidenceState: 'TRACKER_CANCELLED' })),
    { action: 'ignore', reason: 'not_a_success_state' }
  );
});

test('amount mismatch or missing amount routes to review, never auto-confirms', () => {
  assert.deepEqual(
    resolvePaymentConfirmation(baseInput({ evidenceAmountMinor: AMOUNT_MINOR + 1 })),
    { action: 'requires_review', reason: 'amount_mismatch' }
  );
  assert.deepEqual(
    resolvePaymentConfirmation(baseInput({ evidenceAmountMinor: null })),
    { action: 'requires_review', reason: 'amount_mismatch' }
  );
});

test('currency mismatch routes to review (case-insensitive match otherwise)', () => {
  assert.deepEqual(
    resolvePaymentConfirmation(baseInput({ evidenceCurrency: 'USD' })),
    { action: 'requires_review', reason: 'currency_mismatch' }
  );
  assert.deepEqual(resolvePaymentConfirmation(baseInput({ evidenceCurrency: 'pkr' })), { action: 'confirm' });
});

test('LATE PAYMENT: success after the reservation was released routes to review, never resurrects stock', () => {
  for (const status of ['expired', 'cancelled', 'failed'] as SafepayPaymentStatus[]) {
    assert.deepEqual(
      resolvePaymentConfirmation(baseInput({ checkoutStatus: status })),
      { action: 'requires_review', reason: 'reservation_already_released' }
    );
  }
});

test('success after the reservation window elapsed routes to review', () => {
  assert.deepEqual(
    resolvePaymentConfirmation(baseInput({ now: EXPIRES_AT + 1 })),
    { action: 'requires_review', reason: 'reservation_expired' }
  );
});

// ---------------------------------------------------------------------------
// In-memory composition: mirrors handleSafepayWebhook using the REAL core functions
// (event-token dedup + idempotent confirmation + release), standing in for Firestore.
// ---------------------------------------------------------------------------

interface SimCheckout {
  id: string;
  paymentStatus: SafepayPaymentStatus;
  amountMinor: number;
  currency: string;
  reservationExpiresAt: number;
  quantity: number;
}

function createGateway() {
  const checkouts = new Map<string, SimCheckout>();
  const events = new Map<string, { processed: boolean; outcome?: string }>();
  let fundedUnits = 0;
  let releasedUnits = 0;
  let stockAvailable = 100;

  const reserve = (id: string, quantity: number) => {
    checkouts.set(id, {
      id, paymentStatus: 'pending', amountMinor: AMOUNT_MINOR, currency: CURRENCY,
      reservationExpiresAt: EXPIRES_AT, quantity
    });
    stockAvailable -= quantity;
  };

  const processRaw = (rawBody: string | Buffer, signature: string | undefined, now = NOW) => {
    if (!verifySafepaySignature(rawBody, signature, WEBHOOK_SECRET)) return { status: 400 };
    let event: SafepayWebhookEvent;
    try {
      event = parseSafepayWebhookEvent(rawBody);
    } catch {
      return { status: 400 };
    }
    const kind = classifySafepayEvent(event.type);
    if (events.get(event.token)?.processed) return { status: 200, duplicate: true };
    const checkoutId = eventCheckoutId(event);
    const checkout = checkoutId ? checkouts.get(checkoutId) : undefined;
    events.set(event.token, { processed: false });
    if (!checkout) {
      events.set(event.token, { processed: true, outcome: 'unmatched' });
      return { status: 200, unmatched: true };
    }
    let outcome = 'ignored';
    if (kind === 'succeeded') {
      const decision = resolvePaymentConfirmation({
        checkoutStatus: checkout.paymentStatus,
        checkoutAmountMinor: checkout.amountMinor,
        checkoutCurrency: checkout.currency,
        reservationExpiresAt: checkout.reservationExpiresAt,
        evidenceAmountMinor: eventAmountMinor(event),
        evidenceCurrency: eventCurrency(event),
        evidenceState: eventState(event),
        now
      });
      if (decision.action === 'confirm') {
        checkout.paymentStatus = 'succeeded';
        fundedUnits += checkout.quantity;
        outcome = 'confirm';
      } else if (decision.action === 'requires_review') {
        checkout.paymentStatus = 'requires_review';
        outcome = 'requires_review';
      } else {
        outcome = 'ignore';
      }
    } else if (kind === 'failed') {
      if (checkout.paymentStatus === 'pending' || checkout.paymentStatus === 'initiating') {
        checkout.paymentStatus = 'failed';
        stockAvailable += checkout.quantity;
        releasedUnits += checkout.quantity;
        outcome = 'failed';
      }
    }
    events.set(event.token, { processed: true, outcome });
    return { status: 200, kind, outcome, checkoutId: checkout.id };
  };

  const signed = (event: SafepayWebhookEvent) => {
    const raw = JSON.stringify(event);
    return { raw, signature: computeSafepaySignature(raw, WEBHOOK_SECRET) };
  };

  return { checkouts, events, reserve, processRaw, signed, stats: () => ({ fundedUnits, releasedUnits, stockAvailable }) };
}

test('WEBHOOK SUCCESS: a valid signed payment.succeeded confirms and funds exactly once', () => {
  const gateway = createGateway();
  gateway.reserve(CHECKOUT_ID, 2);
  const { raw, signature } = gateway.signed(makeEvent('payment.succeeded', successData(), 'evt_success'));
  const result = gateway.processRaw(raw, signature);
  assert.equal(result.status, 200);
  assert.equal(result.outcome, 'confirm');
  assert.equal(gateway.checkouts.get(CHECKOUT_ID)?.paymentStatus, 'succeeded');
  assert.deepEqual(gateway.stats(), { fundedUnits: 2, releasedUnits: 0, stockAvailable: 98 });
});

test('DUPLICATE CALLBACK: replaying the same event token is deduped and never double-funds', () => {
  const gateway = createGateway();
  gateway.reserve(CHECKOUT_ID, 2);
  const { raw, signature } = gateway.signed(makeEvent('payment.succeeded', successData(), 'evt_dup'));
  gateway.processRaw(raw, signature);
  const replay = gateway.processRaw(raw, signature);
  assert.equal(replay.status, 200);
  assert.equal(replay.duplicate, true);
  assert.equal(gateway.stats().fundedUnits, 2);
});

test('DUPLICATE CALLBACK: a re-delivered success with a new token is ignored once already succeeded', () => {
  const gateway = createGateway();
  gateway.reserve(CHECKOUT_ID, 2);
  const first = gateway.signed(makeEvent('payment.succeeded', successData(), 'evt_a'));
  gateway.processRaw(first.raw, first.signature);
  const redelivery = gateway.signed(makeEvent('payment.succeeded', successData(), 'evt_b'));
  const result = gateway.processRaw(redelivery.raw, redelivery.signature);
  assert.equal(result.outcome, 'ignore');
  assert.equal(gateway.stats().fundedUnits, 2);
});

test('INVALID SIGNATURE: an unsigned/forged webhook is rejected and changes no state', () => {
  const gateway = createGateway();
  gateway.reserve(CHECKOUT_ID, 2);
  const raw = JSON.stringify(makeEvent('payment.succeeded', successData(), 'evt_forge'));
  const result = gateway.processRaw(raw, computeSafepaySignature(raw, 'wrong-secret'));
  assert.equal(result.status, 400);
  assert.equal(gateway.checkouts.get(CHECKOUT_ID)?.paymentStatus, 'pending');
  assert.equal(gateway.stats().fundedUnits, 0);
  assert.equal(gateway.events.has('evt_forge'), false);
});

test('WEBHOOK FAILURE: a valid signed payment.failed releases the reservation and restores stock', () => {
  const gateway = createGateway();
  gateway.reserve(CHECKOUT_ID, 3);
  const { raw, signature } = gateway.signed(makeEvent('payment.failed', {
    tracker: TRACKER, amount: AMOUNT_MINOR, currency: CURRENCY,
    metadata: { order_id: CHECKOUT_ID }, message: 'Card declined'
  }, 'evt_fail'));
  const result = gateway.processRaw(raw, signature);
  assert.equal(result.status, 200);
  assert.equal(result.outcome, 'failed');
  assert.equal(gateway.checkouts.get(CHECKOUT_ID)?.paymentStatus, 'failed');
  assert.deepEqual(gateway.stats(), { fundedUnits: 0, releasedUnits: 3, stockAvailable: 100 });
});

test('LATE SUCCESS AFTER FAILURE: routes to review and never re-funds released stock', () => {
  const gateway = createGateway();
  gateway.reserve(CHECKOUT_ID, 3);
  const failed = gateway.signed(makeEvent('payment.failed', {
    tracker: TRACKER, amount: AMOUNT_MINOR, currency: CURRENCY, metadata: { order_id: CHECKOUT_ID }
  }, 'evt_fail2'));
  gateway.processRaw(failed.raw, failed.signature);
  const late = gateway.signed(makeEvent('payment.succeeded', successData(), 'evt_late'));
  const result = gateway.processRaw(late.raw, late.signature);
  assert.equal(result.outcome, 'requires_review');
  assert.equal(gateway.checkouts.get(CHECKOUT_ID)?.paymentStatus, 'requires_review');
  assert.deepEqual(gateway.stats(), { fundedUnits: 0, releasedUnits: 3, stockAvailable: 100 });
});

test('AMOUNT MISMATCH webhook: routes to review instead of confirming a wrong amount', () => {
  const gateway = createGateway();
  gateway.reserve(CHECKOUT_ID, 2);
  const { raw, signature } = gateway.signed(makeEvent('payment.succeeded', successData({ amount: AMOUNT_MINOR + 500 }), 'evt_mismatch'));
  const result = gateway.processRaw(raw, signature);
  assert.equal(result.outcome, 'requires_review');
  assert.equal(gateway.stats().fundedUnits, 0);
});

test('an unmatched but validly signed event is acknowledged and marked processed', () => {
  const gateway = createGateway();
  const { raw, signature } = gateway.signed(makeEvent('payment.succeeded', successData({ metadata: { order_id: 'unknown' } }), 'evt_unmatched'));
  const result = gateway.processRaw(raw, signature);
  assert.equal(result.status, 200);
  assert.equal(result.unmatched, true);
  assert.equal(gateway.events.get('evt_unmatched')?.processed, true);
});