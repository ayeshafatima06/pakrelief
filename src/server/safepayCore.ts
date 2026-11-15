import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SafepayPaymentStatus } from '../types';

/**
 * Pure, dependency-free Safepay logic (no Firestore, no HTTP, no env access) so it
 * can be unit-tested deterministically.
 *
 * Every contract here is taken from the OFFICIAL Safepay SDKs, not invented:
 *  - Signature: HMAC-SHA512 over the EXACT raw request body, lowercase hex digest,
 *    header `X-SFPY-SIGNATURE`, constant-time compare. Source: getsafepay/sfpy-php
 *    `lib/WebhookSignature.php` (computeSignature = hash_hmac('sha512', $payload, $secret))
 *    and the official README note: "Safepay requires the raw body of the request to
 *    perform signature verification ... Any manipulation to the raw body ... causes
 *    the verification to fail." There is NO timestamp in this scheme; replay is
 *    prevented by event-token dedup + idempotent order confirmation.
 *  - Event envelope `{ token, type, version, merchant_api_key, created_at, data }`
 *    and events payment.succeeded/failed/refunded, authorization.reversed,
 *    void.succeeded. Source: sfpy-php `lib/Event.php`.
 *  - Checkout URL `{base}/embedded/?environment&tracker&tbt&source&redirect_url&cancel_url`.
 *    Source: @sfpy/node-core `Checkout.js` + sfpy-php `lib/Checkout.php`.
 *  - Amounts are in the lowest denomination (paisa); PKR major * 100. Source:
 *    sfpy-php README quickstart (`amount => 600000 // in the lowest denomination`).
 */

export const SAFEPAY_SIGNATURE_HEADER = 'x-sfpy-signature';

export type SafepayEnvironment = 'sandbox' | 'production';

export const TERMINAL_PAYMENT_STATUSES: SafepayPaymentStatus[] = [
  'succeeded',
  'failed',
  'cancelled',
  'expired',
  'requires_review'
];

export class SafepayWebhookError extends Error {
  constructor(
    readonly kind: 'invalid_payload' | 'invalid_signature' | 'missing_secret',
    message: string
  ) {
    super(message);
    this.name = 'SafepayWebhookError';
  }
}

// ---------------------------------------------------------------------------
// Signature verification (HMAC-SHA512 over the raw body, hex, constant-time)
// ---------------------------------------------------------------------------

/** Compute the official Safepay signature for an exact raw body. */
export function computeSafepaySignature(rawBody: string | Buffer, secret: string): string {
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
  return createHmac('sha512', secret).update(body).digest('hex');
}

/**
 * Constant-time verification of the `X-SFPY-SIGNATURE` header against the raw body.
 * Returns false (never throws) for a missing secret, missing/!string signature, or
 * any mismatch. The raw body must be the exact bytes received — re-serializing the
 * parsed JSON invalidates the signature per official Safepay guidance.
 */
export function verifySafepaySignature(
  rawBody: string | Buffer,
  signature: string | null | undefined,
  secret: string
): boolean {
  if (!secret || typeof secret !== 'string') return false;
  if (!signature || typeof signature !== 'string') return false;
  const expected = computeSafepaySignature(rawBody, secret);
  const provided = signature.trim().toLowerCase();
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const providedBuffer = Buffer.from(provided, 'utf8');
  // timingSafeEqual throws on length mismatch; guard first (hex length is fixed).
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

// ---------------------------------------------------------------------------
// Event envelope
// ---------------------------------------------------------------------------

export interface SafepayWebhookEvent {
  token: string;
  type: string;
  version?: string;
  merchant_api_key?: string;
  created_at?: number | { seconds: number; nanos?: number };
  data: {
    tracker?: string;
    state?: string;
    /** Lowest denomination (paisa). */
    amount?: number;
    currency?: string;
    metadata?: { order_id?: string } & Record<string, unknown>;
    category?: string;
    code?: string;
    message?: string;
    [key: string]: unknown;
  };
}

/** Parse + minimally validate the official event envelope. Throws on malformed JSON/shape. */
export function parseSafepayWebhookEvent(rawBody: string | Buffer): SafepayWebhookEvent {
  const text = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SafepayWebhookError('invalid_payload', 'Webhook body is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SafepayWebhookError('invalid_payload', 'Webhook body must be a JSON object.');
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.token !== 'string' || !obj.token) {
    throw new SafepayWebhookError('invalid_payload', 'Webhook event token is required.');
  }
  if (typeof obj.type !== 'string' || !obj.type) {
    throw new SafepayWebhookError('invalid_payload', 'Webhook event type is required.');
  }
  if (!obj.data || typeof obj.data !== 'object' || Array.isArray(obj.data)) {
    throw new SafepayWebhookError('invalid_payload', 'Webhook event data object is required.');
  }
  return obj as unknown as SafepayWebhookEvent;
}

export type SafepayEventKind = 'succeeded' | 'failed' | 'refunded' | 'reversed' | 'voided' | 'unknown';

export function classifySafepayEvent(type: string): SafepayEventKind {
  switch (type) {
    case 'payment.succeeded':
      return 'succeeded';
    case 'payment.failed':
      return 'failed';
    case 'payment.refunded':
      return 'refunded';
    case 'authorization.reversed':
      return 'reversed';
    case 'void.succeeded':
      return 'voided';
    default:
      return 'unknown';
  }
}

/** Correlation id we embedded as metadata.order_id when creating the session. */
export function eventCheckoutId(event: SafepayWebhookEvent): string | null {
  const orderId = event.data?.metadata?.order_id;
  return typeof orderId === 'string' && orderId ? orderId : null;
}

export function eventTracker(event: SafepayWebhookEvent): string | null {
  const tracker = event.data?.tracker;
  return typeof tracker === 'string' && tracker ? tracker : null;
}

export function eventAmountMinor(event: SafepayWebhookEvent): number | null {
  const amount = event.data?.amount;
  return typeof amount === 'number' && Number.isSafeInteger(amount) ? amount : null;
}

export function eventCurrency(event: SafepayWebhookEvent): string | null {
  const currency = event.data?.currency;
  return typeof currency === 'string' && currency ? currency : null;
}

export function eventState(event: SafepayWebhookEvent): string | null {
  const state = event.data?.state;
  return typeof state === 'string' && state ? state : null;
}

// ---------------------------------------------------------------------------
// Tracker lifecycle state mapping (official TRACKER_* states)
// ---------------------------------------------------------------------------

export type SafepayTrackerOutcome =
  | 'succeeded'
  | 'pending'
  | 'cancelled'
  | 'expired'
  | 'failed'
  | 'refunded'
  | 'unknown';

export function resolveTrackerOutcome(state: string | null | undefined): SafepayTrackerOutcome {
  switch (state) {
    case 'TRACKER_ENDED':
      return 'succeeded';
    case 'TRACKER_STARTED':
    case 'TRACKER_AUTHORIZED':
    case 'TRACKER_ENROLLED':
      return 'pending';
    case 'TRACKER_CANCELLED':
      return 'cancelled';
    case 'TRACKER_EXPIRED':
      return 'expired';
    case 'TRACKER_REFUNDED':
    case 'TRACKER_PARTIAL_REFUND':
      return 'refunded';
    case 'TRACKER_REVERSED':
    case 'TRACKER_VOIDED':
      return 'failed';
    case 'TRACKER_DISPUTED':
      return 'unknown';
    default:
      return 'unknown';
  }
}

// ---------------------------------------------------------------------------
// Amount + checkout URL helpers
// ---------------------------------------------------------------------------

/** Convert whole PKR (server-priced integer) to paisa, the gateway's lowest denomination. */
export function toMinorUnits(amountMajor: number): number {
  if (!Number.isSafeInteger(amountMajor) || amountMajor <= 0) {
    throw new Error('A positive whole PKR amount is required.');
  }
  const minor = amountMajor * 100;
  if (!Number.isSafeInteger(minor)) {
    throw new Error('The checkout amount exceeds supported precision.');
  }
  return minor;
}

export function buildSafepayCheckoutUrl(params: {
  environment: SafepayEnvironment;
  tracker: string;
  tbt: string;
  redirectUrl: string;
  cancelUrl: string;
  source?: 'hosted' | 'mobile' | 'popup' | 'custom';
}): string {
  const base =
    params.environment === 'production'
      ? 'https://getsafepay.com/embedded/'
      : 'https://sandbox.api.getsafepay.com/embedded/';
  const query = new URLSearchParams({
    environment: params.environment,
    tracker: params.tracker,
    tbt: params.tbt,
    source: params.source || 'hosted',
    redirect_url: params.redirectUrl,
    cancel_url: params.cancelUrl
  });
  return `${base}?${query.toString()}`;
}

// ---------------------------------------------------------------------------
// Confirmation guard — the single source of truth for "may we mark this paid?"
// ---------------------------------------------------------------------------

export type ConfirmationAction = 'confirm' | 'requires_review' | 'ignore';

export interface ConfirmationDecision {
  action: ConfirmationAction;
  reason?: string;
}

export interface ConfirmationInput {
  checkoutStatus: SafepayPaymentStatus;
  checkoutAmountMinor: number;
  checkoutCurrency: string;
  reservationExpiresAt: number;
  /** Evidence from a signed webhook or a server-to-server tracker fetch. */
  evidenceAmountMinor: number | null;
  evidenceCurrency: string | null;
  evidenceState?: string | null;
  now: number;
}

/**
 * Decide whether a success signal may confirm a checkout. Pure + idempotent:
 *  - already succeeded / under review -> ignore (duplicate callback safe)
 *  - evidence state present but not TRACKER_ENDED -> ignore (not a success)
 *  - amount/currency mismatch -> requires_review (never auto-confirm a wrong amount)
 *  - reservation already released (expired/cancelled/failed) or past expiry ->
 *    requires_review (a late payment must NOT resurrect released stock / double-fund)
 *  - otherwise -> confirm
 */
export function resolvePaymentConfirmation(input: ConfirmationInput): ConfirmationDecision {
  if (input.checkoutStatus === 'succeeded') {
    return { action: 'ignore', reason: 'already_succeeded' };
  }
  if (input.checkoutStatus === 'requires_review') {
    return { action: 'ignore', reason: 'already_under_review' };
  }
  if (input.evidenceState && resolveTrackerOutcome(input.evidenceState) !== 'succeeded') {
    return { action: 'ignore', reason: 'not_a_success_state' };
  }
  if (input.evidenceAmountMinor === null || input.evidenceAmountMinor !== input.checkoutAmountMinor) {
    return { action: 'requires_review', reason: 'amount_mismatch' };
  }
  if (input.evidenceCurrency && input.evidenceCurrency.toUpperCase() !== input.checkoutCurrency.toUpperCase()) {
    return { action: 'requires_review', reason: 'currency_mismatch' };
  }
  if (
    input.checkoutStatus === 'expired' ||
    input.checkoutStatus === 'cancelled' ||
    input.checkoutStatus === 'failed'
  ) {
    return { action: 'requires_review', reason: 'reservation_already_released' };
  }
  if (input.reservationExpiresAt && input.now > input.reservationExpiresAt) {
    return { action: 'requires_review', reason: 'reservation_expired' };
  }
  if (input.checkoutStatus !== 'pending' && input.checkoutStatus !== 'initiating') {
    return { action: 'ignore', reason: 'unexpected_status' };
  }
  return { action: 'confirm' };
}