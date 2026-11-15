import type { SafepayEnvironment } from './safepayCore';

/**
 * Server-only Safepay configuration. NEVER import this into client code — it reads
 * secret environment variables. The Vite client bundle does not include server
 * modules (app.ts is only referenced from vite.config.ts / server.ts in Node).
 *
 * Required merchant secrets (Safepay Dashboard -> Developers):
 *  - SAFEPAY_SECRET_KEY      -> `X-SFPY-MERCHANT-SECRET` header (server API auth)
 *  - SAFEPAY_PUBLIC_KEY      -> `merchant_api_key` in the session body (merchant identifier)
 *  - SAFEPAY_WEBHOOK_SECRET  -> shared endpoint secret used for HMAC-SHA512 verification
 *                               (Dashboard -> Developers -> Endpoints -> View shared secret)
 */
export interface SafepayConfig {
  environment: SafepayEnvironment;
  secretKey: string;
  publicKey: string;
  webhookSecret: string;
  apiBase: string;
  returnUrlBase: string;
  configured: boolean;
  missing: string[];
}

const PLACEHOLDER = /^(my_|your[-_]|changeme|placeholder|<|secret_key_here|public_key_here)/i;

function clean(value: string | undefined): string {
  const trimmed = (value || '').trim();
  // Treat obvious unfilled placeholders as absent so we never call the gateway with them.
  if (!trimmed || PLACEHOLDER.test(trimmed)) return '';
  return trimmed;
}

function resolveReturnUrlBase(env: NodeJS.ProcessEnv): string {
  const candidates = [
    clean(env.SAFEPAY_RETURN_URL_BASE),
    clean(env.APP_URL),
    clean(env.CLIENT_URL),
    'http://localhost:3000'
  ];
  for (const candidate of candidates) {
    if (/^https?:\/\//i.test(candidate)) {
      return candidate.replace(/\/+$/, '');
    }
  }
  return 'http://localhost:3000';
}

export function getSafepayConfig(env: NodeJS.ProcessEnv = process.env): SafepayConfig {
  const environment: SafepayEnvironment = env.SAFEPAY_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
  const secretKey = clean(env.SAFEPAY_SECRET_KEY);
  const publicKey = clean(env.SAFEPAY_PUBLIC_KEY);
  const webhookSecret = clean(env.SAFEPAY_WEBHOOK_SECRET);
  const apiBase =
    environment === 'production'
      ? 'https://api.getsafepay.com'
      : 'https://sandbox.api.getsafepay.com';
  const returnUrlBase = resolveReturnUrlBase(env);

  const missing: string[] = [];
  if (!secretKey) missing.push('SAFEPAY_SECRET_KEY');
  if (!publicKey) missing.push('SAFEPAY_PUBLIC_KEY');
  if (!webhookSecret) missing.push('SAFEPAY_WEBHOOK_SECRET');

  return {
    environment,
    secretKey,
    publicKey,
    webhookSecret,
    apiBase,
    returnUrlBase,
    configured: missing.length === 0,
    missing
  };
}

/** SPA return URLs. The query params are a UI hint only — never proof of payment. */
export function safepayReturnUrls(config: SafepayConfig, checkoutId: string): { redirectUrl: string; cancelUrl: string } {
  const base = `${config.returnUrlBase}/?safepay_checkout=${encodeURIComponent(checkoutId)}`;
  return {
    redirectUrl: `${base}&safepay_outcome=complete`,
    cancelUrl: `${base}&safepay_outcome=cancel`
  };
}