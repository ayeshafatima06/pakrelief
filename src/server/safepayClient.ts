import axios from 'axios';
import type { SafepayConfig } from './safepayConfig';
import { safepayReturnUrls } from './safepayConfig';
import { buildSafepayCheckoutUrl } from './safepayCore';

/**
 * Server-to-server Safepay REST client. Endpoints/fields are taken verbatim from the
 * official SDKs (no invented routes):
 *  - POST {apiBase}/order/payments/v3/        (sfpy-php OrderService::setup, @sfpy/node-core Payments.Session)
 *  - POST {apiBase}/client/passport/v1/token  (sfpy-php PassportService::create, @sfpy/node-core Client.Passport)
 *  - GET  {apiBase}/reporter/api/v1/payments/{tracker} (@sfpy/node-core Reporter.Payments.fetch)
 *  - Checkout URL via Checkout.js / lib/Checkout.php
 * Auth header `X-SFPY-MERCHANT-SECRET` carries the secret key (RequestSender._makeAuthHeader).
 */
export class SafepayApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'SafepayApiError';
  }
}

function authHeaders(config: SafepayConfig): Record<string, string> {
  return {
    'X-SFPY-MERCHANT-SECRET': config.secretKey,
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };
}

function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as any;
    const gatewayMessage =
      data?.status?.errors?.join?.(', ') ||
      data?.message ||
      data?.error ||
      (typeof data === 'string' ? data : '');
    if (gatewayMessage) return String(gatewayMessage);
    if (error.response?.status) return `Safepay returned HTTP ${error.response.status}.`;
    return 'Could not reach the Safepay gateway.';
  }
  return error instanceof Error ? error.message : 'Safepay request failed.';
}

export interface SafepaySession {
  tracker: string;
  state: string;
  raw: unknown;
}

/** Create a payment tracker for an exact, server-priced amount in paisa. */
export async function createSafepaySession(
  config: SafepayConfig,
  input: { amountMinor: number; currency: string; checkoutId: string }
): Promise<SafepaySession> {
  const body = {
    merchant_api_key: config.publicKey,
    intent: 'CYBERSOURCE',
    mode: 'payment',
    currency: input.currency,
    amount: input.amountMinor,
    metadata: { order_id: input.checkoutId }
  };
  try {
    const res = await axios.post(`${config.apiBase}/order/payments/v3/`, body, {
      headers: authHeaders(config),
      timeout: 30000
    });
    const tracker = res.data?.data?.tracker?.token;
    if (typeof tracker !== 'string' || !tracker) {
      throw new SafepayApiError('Safepay did not return a tracker token.');
    }
    return {
      tracker,
      state: typeof res.data?.data?.tracker?.state === 'string' ? res.data.data.tracker.state : 'TRACKER_STARTED',
      raw: res.data
    };
  } catch (error) {
    if (error instanceof SafepayApiError) throw error;
    throw new SafepayApiError(extractErrorMessage(error), axios.isAxiosError(error) ? error.response?.status : undefined);
  }
}

/** Create a Time-Based Token (passport) for the hosted checkout URL. */
export async function createSafepayPassport(config: SafepayConfig): Promise<string> {
  try {
    const res = await axios.post(
      `${config.apiBase}/client/passport/v1/token`,
      {},
      { headers: authHeaders(config), timeout: 30000 }
    );
    const data = res.data?.data;
    const tbt = typeof data === 'string' ? data : typeof data?.token === 'string' ? data.token : null;
    if (!tbt) throw new SafepayApiError('Safepay did not return a passport token.');
    return tbt;
  } catch (error) {
    if (error instanceof SafepayApiError) throw error;
    throw new SafepayApiError(extractErrorMessage(error), axios.isAxiosError(error) ? error.response?.status : undefined);
  }
}

export interface SafepayTrackerReport {
  state: string | null;
  amountMinor: number | null;
  currency: string | null;
  raw: unknown;
}

/** Server-to-server reconciliation of a tracker's true state (never a frontend redirect). */
export async function fetchSafepayTracker(config: SafepayConfig, tracker: string): Promise<SafepayTrackerReport> {
  try {
    const res = await axios.get(
      `${config.apiBase}/reporter/api/v1/payments/${encodeURIComponent(tracker)}`,
      { headers: authHeaders(config), timeout: 30000 }
    );
    const payload = res.data?.data;
    const trackerObj = payload?.tracker ?? payload ?? {};
    const state = typeof trackerObj.state === 'string' ? trackerObj.state : null;
    const quote = trackerObj.purchase_totals?.quote_amount ?? trackerObj.purchase_totals ?? {};
    const rawAmount = quote.amount ?? trackerObj.amount;
    const amountMinor = typeof rawAmount === 'number' && Number.isSafeInteger(rawAmount) ? rawAmount : null;
    const rawCurrency = quote.currency ?? trackerObj.currency;
    const currency = typeof rawCurrency === 'string' ? rawCurrency : null;
    return { state, amountMinor, currency, raw: res.data };
  } catch (error) {
    throw new SafepayApiError(extractErrorMessage(error), axios.isAxiosError(error) ? error.response?.status : undefined);
  }
}

/** Build the hosted checkout URL the donor is redirected to (not a payment signal). */
export function buildHostedCheckoutUrl(
  config: SafepayConfig,
  input: { tracker: string; tbt: string; checkoutId: string }
): string {
  const { redirectUrl, cancelUrl } = safepayReturnUrls(config, input.checkoutId);
  return buildSafepayCheckoutUrl({
    environment: config.environment,
    tracker: input.tracker,
    tbt: input.tbt,
    redirectUrl,
    cancelUrl,
    source: 'hosted'
  });
}