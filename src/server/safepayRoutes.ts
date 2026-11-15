import express, { RequestHandler, Response } from 'express';
import type { AuthenticatedRequest } from './authMiddleware';
import { CheckoutValidationError, normalizeCheckoutLines } from './commerceService';
import type { CheckoutLineInput } from './commerceService';
import type { Order, SafepayCheckout, UserProfile } from '../types';
import { SAFEPAY_SIGNATURE_HEADER } from './safepayCore';
import {
  SafepayCheckoutForbiddenError,
  SafepayCheckoutNotFoundError,
  SafepayConfigError,
  toCheckoutResult
} from './safepayCheckoutService';

/**
 * Express router for the Safepay hosted-checkout integration. Mounted at
 * `/api/payments/safepay`. Service functions are injected (house style, mirrors
 * createCampaignWorkflowRouter) so the wiring stays explicit in app.ts.
 *
 * Security model:
 *  - /checkout, /checkout/:id, /cancel require a Firebase-authenticated DONOR and are
 *    scoped to that donor's own checkouts (ownership enforced in the service layer).
 *  - /webhook is unauthenticated (Safepay calls it server-to-server) and is trusted
 *    ONLY after HMAC-SHA512 verification of the exact raw request body. It never runs
 *    the donor auth middleware.
 *  - No route treats a frontend redirect or a created session as proof of payment.
 */
interface SafepayRouterDependencies {
  requireAuth: RequestHandler;
  requireDonor: RequestHandler;
  createCheckout: (input: {
    donor: UserProfile;
    requestId: string;
    lines: CheckoutLineInput[];
  }) => Promise<{ checkout: SafepayCheckout; orders: Order[]; replayed: boolean }>;
  getCheckout: (
    checkoutId: string,
    donorId: string,
    opts?: { reconcile?: boolean }
  ) => Promise<{ checkout: SafepayCheckout; orders: Order[] }>;
  cancelCheckout: (
    checkoutId: string,
    donorId: string
  ) => Promise<{ checkout: SafepayCheckout; orders: Order[] }>;
  handleWebhook: (
    rawBody: Buffer | string,
    signature: string | undefined,
    now?: number
  ) => Promise<{ status: number; body: Record<string, unknown> }>;
}

/** Map domain errors to honest HTTP responses; never leak internals or fake success. */
function sendSafepayError(res: Response, error: unknown): void {
  if (error instanceof SafepayConfigError) {
    res.status(503).json({ success: false, error: error.message, missing: error.missing });
    return;
  }
  if (error instanceof CheckoutValidationError) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }
  if (error instanceof SafepayCheckoutNotFoundError) {
    res.status(404).json({ success: false, error: error.message });
    return;
  }
  if (error instanceof SafepayCheckoutForbiddenError) {
    res.status(403).json({ success: false, error: error.message });
    return;
  }
  console.error('[PakRelief] Safepay request failed:', error);
  res.status(500).json({ success: false, error: 'The payment request could not be completed. Please try again.' });
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function createSafepayRouter(dependencies: SafepayRouterDependencies) {
  const router = express.Router();

  // Create (or idempotently replay) a hosted checkout. The server prices the cart,
  // reserves stock, creates the Safepay tracker, and returns the hosted URL. A returned
  // URL or a 'pending' status is NOT a payment success.
  router.post('/checkout', dependencies.requireAuth, dependencies.requireDonor, async (req, res: Response) => {
    const authenticatedRequest = req as AuthenticatedRequest;
    if (!authenticatedRequest.profile) {
      res.status(401).json({ success: false, error: 'Authenticated donor profile is required.' });
      return;
    }
    const { requestId, cartItems } = req.body ?? {};
    if (typeof requestId !== 'string' || requestId.length < 16 || requestId.length > 128) {
      res.status(400).json({ success: false, error: 'A unique checkout requestId is required.' });
      return;
    }
    try {
      const lines = normalizeCheckoutLines(cartItems);
      const { checkout, orders, replayed } = await dependencies.createCheckout({
        donor: authenticatedRequest.profile,
        requestId,
        lines
      });
      res.status(replayed ? 200 : 201).json(toCheckoutResult(checkout, orders, { replayed }));
    } catch (error) {
      sendSafepayError(res, error);
    }
  });

  // Donor-scoped status read. Optionally reconciles against Safepay server-to-server so
  // the SPA can learn the verified outcome after returning from the hosted page.
  router.get('/checkout/:checkoutId', dependencies.requireAuth, dependencies.requireDonor, async (req, res: Response) => {
    const authenticatedRequest = req as AuthenticatedRequest;
    if (!authenticatedRequest.profile) {
      res.status(401).json({ success: false, error: 'Authenticated donor profile is required.' });
      return;
    }
    const { checkoutId } = req.params;
    if (typeof checkoutId !== 'string' || !checkoutId) {
      res.status(400).json({ success: false, error: 'A checkoutId is required.' });
      return;
    }
    try {
      const { checkout, orders } = await dependencies.getCheckout(checkoutId, authenticatedRequest.profile.id, { reconcile: true });
      res.json(toCheckoutResult(checkout, orders));
    } catch (error) {
      sendSafepayError(res, error);
    }
  });

  // Donor-initiated cancellation. The service re-verifies with Safepay first so a real
  // payment is never cancelled; only an unpaid checkout releases its reservation.
  router.post('/cancel', dependencies.requireAuth, dependencies.requireDonor, async (req, res: Response) => {
    const authenticatedRequest = req as AuthenticatedRequest;
    if (!authenticatedRequest.profile) {
      res.status(401).json({ success: false, error: 'Authenticated donor profile is required.' });
      return;
    }
    const { checkoutId } = req.body ?? {};
    if (typeof checkoutId !== 'string' || !checkoutId) {
      res.status(400).json({ success: false, error: 'A checkoutId is required.' });
      return;
    }
    try {
      const { checkout, orders } = await dependencies.cancelCheckout(checkoutId, authenticatedRequest.profile.id);
      res.json(toCheckoutResult(checkout, orders));
    } catch (error) {
      sendSafepayError(res, error);
    }
  });

  // Signature-verified webhook. Reads the EXACT raw body captured by express.json's
  // verify callback (re-serializing JSON would invalidate the HMAC). Returns the status
  // computed by the handler; a non-200 tells Safepay to retry. No donor auth here.
  router.post('/webhook', async (req, res: Response) => {
    const rawBody = (req as AuthenticatedRequest & { rawBody?: Buffer }).rawBody;
    const signature = firstHeader(req.headers[SAFEPAY_SIGNATURE_HEADER]);
    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      res.status(400).json({ success: false, error: 'The raw webhook body is required for signature verification.' });
      return;
    }
    try {
      const result = await dependencies.handleWebhook(rawBody, signature);
      res.status(result.status).json(result.body);
    } catch (error) {
      // Do NOT acknowledge an event we failed to process; Safepay will retry and the
      // handler's token dedup + idempotent confirmation make the retry safe.
      console.error('[PakRelief] Safepay webhook processing failed:', error);
      res.status(500).json({ success: false, error: 'Webhook processing failed.' });
    }
  });

  return router;
}