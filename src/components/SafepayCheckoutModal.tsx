import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Lock,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Clock,
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  ExternalLink,
  RefreshCw
} from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';
import { CartItem, Order } from '../types';

/**
 * Safepay sandbox hosted checkout.
 *
 * Truth model (must never be violated):
 *  - Creating a checkout session / being redirected to Safepay is NOT a payment success.
 *  - Returning to the SPA with ?safepay_outcome=... is NOT proof of payment.
 *  - The ONLY signal that clears the cart and fires onPaid is a server-verified
 *    paymentStatus === 'succeeded' (from POST replay, GET status, or cancel response).
 *
 * No card / wallet data, secrets, or gateway keys are ever handled here. The donor
 * pays on Safepay's hosted sandbox page; PakRelief only learns the outcome from its
 * own webhook-verified backend.
 */

type SafepayPaymentStatus =
  | 'initiating'
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'requires_review';

interface SafepayCheckoutResult {
  checkoutId: string;
  paymentStatus: SafepayPaymentStatus;
  orders: Order[];
  amount: number; // PKR major units, server-authoritative
  amountMinor: number;
  currency: string;
  checkoutUrl: string | null;
  tracker: string | null;
  lastError?: string;
  reservationExpiresAt?: number;
  requiresReview: boolean;
  replayed: boolean;
  message?: string;
}

interface SafepayCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPaid: (orders: Order[]) => void;
  /** Present when returning from the Safepay hosted page (return/status mode). */
  returnCheckoutId?: string | null;
  returnOutcome?: 'complete' | 'cancel' | null;
}

const CHECKOUT_STORAGE_KEY = 'pakrelief_safepay_checkout';
const POLL_INTERVAL_MS = 3000;
const POLL_WINDOW_MS = 120000;

interface StoredCheckout {
  donorId: string;
  fingerprint: string;
  requestId: string;
}

/** Stable fingerprint of the payable cart: only IDs + quantity, never prices. */
function cartFingerprint(items: CartItem[]): string {
  return items
    .map(it => `${it.productId}|${it.requirementId}|${it.campaignId}|${it.quantity}`)
    .sort()
    .join(';');
}

function generateRequestId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `sp-${Date.now()}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

/**
 * Reuse the persisted donor-scoped requestId while the cart fingerprint is unchanged
 * (close/reopen, retry after failure). Generate a new one only when the fingerprint
 * (or donor) changes.
 */
function resolveRequestId(donorId: string, items: CartItem[]): string {
  const fingerprint = cartFingerprint(items);
  try {
    const raw = localStorage.getItem(CHECKOUT_STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as StoredCheckout;
      if (stored && stored.donorId === donorId && stored.fingerprint === fingerprint && stored.requestId) {
        return stored.requestId;
      }
    }
  } catch {
    /* fall through to a fresh id */
  }
  const requestId = generateRequestId();
  try {
    const record: StoredCheckout = { donorId, fingerprint, requestId };
    localStorage.setItem(CHECKOUT_STORAGE_KEY, JSON.stringify(record));
  } catch {
    /* storage unavailable; still proceed with an in-memory id */
  }
  return requestId;
}

/** Drop the idempotency record once a payment has truly succeeded. */
function clearStoredCheckout(): void {
  try {
    localStorage.removeItem(CHECKOUT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function normalizeResult(data: any): SafepayCheckoutResult {
  const status = data.paymentStatus as SafepayPaymentStatus;
  return {
    checkoutId: data.checkoutId,
    paymentStatus: status,
    orders: Array.isArray(data.orders) ? (data.orders as Order[]) : [],
    amount: typeof data.amount === 'number' ? data.amount : 0,
    amountMinor: typeof data.amountMinor === 'number' ? data.amountMinor : 0,
    currency: data.currency || 'PKR',
    checkoutUrl: data.checkoutUrl ?? null,
    tracker: data.tracker ?? null,
    lastError: data.lastError,
    reservationExpiresAt: data.reservationExpiresAt,
    requiresReview: data.requiresReview === true || status === 'requires_review',
    replayed: data.replayed === true,
    message: data.message
  };
}

const TERMINAL_STATUSES: SafepayPaymentStatus[] = ['succeeded', 'failed', 'cancelled', 'expired', 'requires_review'];

type Phase = 'form' | 'loading' | 'redirecting' | 'status' | 'error';

export const SafepayCheckoutModal: React.FC<SafepayCheckoutModalProps> = ({
  isOpen,
  onClose,
  onPaid,
  returnCheckoutId = null,
  returnOutcome = null
}) => {
  const { items, totalAmount, clearCart } = useCart();
  const { user, isLoading: authLoading } = useAuth();

  const isReturnMode = Boolean(returnCheckoutId);

  const [phase, setPhase] = useState<Phase>('form');
  const [result, setResult] = useState<SafepayCheckoutResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [hasRetried, setHasRetried] = useState(false);
  const [pollNonce, setPollNonce] = useState(0);

  // Guards that must survive React StrictMode's double effect invocation.
  const cancelPostedForRef = useRef<string | null>(null);
  const redirectTimerRef = useRef<number | undefined>(undefined);

  // Reset transient state whenever the modal (re)opens or switches mode.
  useEffect(() => {
    if (!isOpen) return;
    setPhase(isReturnMode ? 'loading' : 'form');
    setResult(null);
    setErrorMessage(null);
    setPollTimedOut(false);
    setHasRetried(false);
    setPollNonce(0);
  }, [isOpen, isReturnMode, returnCheckoutId]);

  // Clear a pending redirect timer if we unmount before handing off to Safepay.
  useEffect(() => () => {
    if (redirectTimerRef.current) window.clearTimeout(redirectTimerRef.current);
  }, []);

  /** Apply a server status response in return mode; stop polling on terminal states. */
  const applyReturnResult = (
    data: any,
    stopPolling: () => void
  ) => {
    const normalized = normalizeResult(data);
    setResult(normalized);
    setPhase('status');

    if (normalized.paymentStatus === 'succeeded') {
      stopPolling();
      clearStoredCheckout();
      clearCart();
      onPaid(normalized.orders);
      return;
    }
    if (TERMINAL_STATUSES.includes(normalized.paymentStatus)) {
      stopPolling();
    }
    // initiating / pending -> keep polling; the status view shows a waiting spinner.
  };

  // Return-mode flow: optional one-time cancel, then bounded GET status polling.
  useEffect(() => {
    if (!isOpen || !isReturnMode || !returnCheckoutId) return;
    if (hasRetried) return; // a retry switched us to the fresh-checkout flow
    if (authLoading) return; // wait for the donor session to be restored
    if (!user) {
      // Signed-out return: never spin forever, and never assume payment from the redirect.
      setPhase('error');
      setErrorMessage('Sign in with the donor account used for this payment to verify its status. A redirect alone does not confirm payment.');
      return;
    }

    let cancelled = false;
    let interval: number | undefined;
    const deadline = Date.now() + POLL_WINDOW_MS;

    const stopPolling = () => {
      if (interval) window.clearInterval(interval);
      interval = undefined;
    };

    const poll = async () => {
      if (cancelled) return;
      if (Date.now() > deadline) {
        stopPolling();
        setPollTimedOut(true);
        return;
      }
      try {
        const res = await api.get(`/payments/safepay/checkout/${encodeURIComponent(returnCheckoutId)}`);
        if (cancelled) return;
        if (res.data?.success) {
          applyReturnResult(res.data, stopPolling);
        }
      } catch {
        // Transient network/auth hiccup: keep trying until the window elapses.
      }
    };

    const init = async () => {
      setPhase('loading');
      if (returnOutcome === 'cancel' && cancelPostedForRef.current !== returnCheckoutId) {
        cancelPostedForRef.current = returnCheckoutId;
        try {
          const res = await api.post('/payments/safepay/cancel', { checkoutId: returnCheckoutId });
          if (!cancelled && res.data?.success) {
            applyReturnResult(res.data, stopPolling);
          }
        } catch {
          // Fall back to GET polling to read the server-verified state.
        }
      }
      if (cancelled) return;
      await poll();
      if (!cancelled) {
        interval = window.setInterval(poll, POLL_INTERVAL_MS);
      }
    };

    init();

    return () => {
      cancelled = true;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isReturnMode, returnCheckoutId, returnOutcome, user?.id, authLoading, hasRetried, pollNonce]);

  if (!isOpen) return null;

  /** Fresh checkout or retry: POST ids/quantity only, then redirect or show status. */
  const startCheckout = async () => {
    setErrorMessage(null);
    setPollTimedOut(false);

    if (!user || user.role !== 'donor') {
      setPhase('error');
      setErrorMessage('Sign in with a donor account to pay via Safepay sandbox.');
      return;
    }
    if (items.length === 0) {
      setPhase('error');
      setErrorMessage('Your relief cart is empty. Add items before checking out.');
      return;
    }

    const requestId = resolveRequestId(user.id, items);
    setPhase('loading');

    try {
      const res = await api.post('/payments/safepay/checkout', {
        requestId,
        cartItems: items.map(it => ({
          productId: it.productId,
          requirementId: it.requirementId,
          campaignId: it.campaignId,
          quantity: it.quantity
        }))
      });
      const data = res.data;
      if (!data?.success) {
        throw new Error(data?.message || data?.error || 'Could not start the Safepay checkout.');
      }

      const normalized = normalizeResult(data);
      setResult(normalized);

      // Idempotent replay of an already-succeeded payment: this is real success.
      if (normalized.paymentStatus === 'succeeded') {
        clearStoredCheckout();
        clearCart();
        onPaid(normalized.orders);
        return;
      }

      // A hosted URL means "go pay" — never a success signal.
      if (normalized.checkoutUrl) {
        setPhase('redirecting');
        redirectTimerRef.current = window.setTimeout(() => {
          window.location.assign(normalized.checkoutUrl as string);
        }, 600);
        return;
      }

      // No URL and not succeeded: show the honest server status.
      setPhase('status');
    } catch (err: any) {
      setPhase('error');
      setErrorMessage(
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        'Could not reach the payment server. Please try again.'
      );
    }
  };

  const handleRetry = () => {
    setHasRetried(true); // stop return-mode polling; reuse persisted requestId + cart
    startCheckout();
  };

  const displayAmount = result ? result.amount : totalAmount;
  const amountLabel = result ? 'Server-verified total' : 'Estimated cart total';
  const closeDisabled = phase === 'redirecting' || (!isReturnMode && phase === 'loading');
  const canRetry = items.length > 0;

  const renderStatusBody = () => {
    if (!result) return null;
    const status = result.paymentStatus;

    if (status === 'initiating' || status === 'pending') {
      const activelyPolling = isReturnMode && !hasRetried;
      return (
        <div className="py-8 text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <Loader2 className="w-16 h-16 text-emerald-600 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Lock className="w-6 h-6 text-emerald-700" />
            </div>
          </div>
          <div>
            <h4 className="text-base font-bold text-slate-800">Waiting for Safepay confirmation</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
              Your payment is being verified against Safepay's webhook. This usually takes a few seconds — please keep this window open.
            </p>
          </div>
          {activelyPolling && pollTimedOut ? (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-2">
              <p>This is taking longer than expected. Your cart is safe and no success has been assumed.</p>
              <button
                onClick={() => { setPollTimedOut(false); setPollNonce(n => n + 1); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Check again</span>
              </button>
            </div>
          ) : activelyPolling ? (
            <p className="text-[11px] text-slate-400 font-mono animate-pulse">Checking every few seconds…</p>
          ) : (
            <p className="text-[11px] text-slate-400">You can close this window and check your order status from the dashboard.</p>
          )}
        </div>
      );
    }

    if (status === 'succeeded') {
      return (
        <div className="py-8 text-center space-y-3">
          <CheckCircle2 className="w-14 h-14 text-emerald-600 mx-auto" />
          <h4 className="text-base font-bold text-slate-800">Payment confirmed by Safepay</h4>
          <p className="text-xs text-slate-500">Your relief order is being finalized.</p>
        </div>
      );
    }

    if (status === 'requires_review') {
      return (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-sky-50 border border-sky-200 space-y-2">
            <div className="flex items-center gap-2 text-sky-900 font-bold text-sm">
              <AlertTriangle className="w-5 h-5 text-sky-600 shrink-0" />
              <span>Payment received — under review</span>
            </div>
            <p className="text-xs text-sky-800 leading-relaxed">
              Safepay confirmed your payment, but this order needs a quick support review before fulfillment.
              This is <strong>not</strong> a standard completion. Please do not pay again — our team will reconcile
              it and update your order status.
            </p>
            {result.tracker && (
              <p className="text-[11px] font-mono text-sky-700">Reference: {result.tracker}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm transition"
          >
            Done
          </button>
        </div>
      );
    }

    // failed / cancelled / expired
    const config = {
      failed: {
        icon: <XCircle className="w-6 h-6 text-rose-600 shrink-0" />,
        wrap: 'bg-rose-50 border-rose-200',
        title: 'text-rose-900',
        body: 'text-rose-800',
        heading: 'Payment failed',
        text: 'Safepay could not complete this payment. No payment was captured — you can try again with the same cart.'
      },
      cancelled: {
        icon: <AlertCircle className="w-6 h-6 text-amber-600 shrink-0" />,
        wrap: 'bg-amber-50 border-amber-200',
        title: 'text-amber-900',
        body: 'text-amber-800',
        heading: 'Checkout cancelled',
        text: 'This Safepay checkout was cancelled. No payment was taken — you can start again whenever you are ready.'
      },
      expired: {
        icon: <Clock className="w-6 h-6 text-slate-500 shrink-0" />,
        wrap: 'bg-slate-50 border-slate-200',
        title: 'text-slate-800',
        body: 'text-slate-600',
        heading: 'Checkout session expired',
        text: 'The sandbox payment window expired before completion. No payment was taken — start checkout again for a fresh session.'
      }
    }[status as 'failed' | 'cancelled' | 'expired'];

    return (
      <div className="space-y-4">
        <div className={`p-4 rounded-xl border space-y-2 ${config.wrap}`}>
          <div className={`flex items-center gap-2 font-bold text-sm ${config.title}`}>
            {config.icon}
            <span>{config.heading}</span>
          </div>
          <p className={`text-xs leading-relaxed ${config.body}`}>{config.text}</p>
          {result.lastError && (
            <p className="text-[11px] font-mono text-rose-700 break-words">{result.lastError}</p>
          )}
        </div>
        <button
          onClick={handleRetry}
          disabled={!canRetry}
          className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md transition"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Retry payment</span>
        </button>
        {!canRetry && (
          <p className="text-[11px] text-slate-400 text-center">Your cart is empty, so there is nothing to retry.</p>
        )}
        <button
          onClick={onClose}
          className="w-full py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
        >
          Close
        </button>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-slate-200">
        {/* Safepay Sandbox brand header (slate/emerald) */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-900 p-5 text-white relative">
          <button
            onClick={onClose}
            disabled={closeDisabled}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-30 transition"
            aria-label="Close checkout"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 mb-1">
            <span className="bg-emerald-400 text-slate-950 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded font-mono">
              Sandbox
            </span>
            <span className="text-white/80 text-xs flex items-center gap-1">
              <Lock className="w-3 h-3" />
              Hosted checkout
            </span>
          </div>

          <h3 className="text-xl font-black tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <span>Safepay Sandbox Checkout</span>
          </h3>

          <p className="text-xs text-emerald-100/90 mt-1">
            You pay on Safepay's secure page. Payment is confirmed only after Safepay notifies PakRelief.
          </p>

          <div className="mt-3 pt-3 border-t border-white/15 flex items-center justify-between">
            <span className="text-xs text-emerald-100 font-medium">{amountLabel}:</span>
            <span className="text-xl font-black font-mono text-white">
              PKR {displayAmount.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          {phase === 'error' && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
              {(!user || user.role !== 'donor') ? (
                <button
                  onClick={onClose}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm transition"
                >
                  Close
                </button>
              ) : (
                <button
                  onClick={startCheckout}
                  disabled={!canRetry}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md transition"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Try again</span>
                </button>
              )}
            </div>
          )}

          {phase === 'form' && (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs">
                <span className="font-bold text-emerald-900 block">Secure hosted sandbox payment</span>
                <span className="text-emerald-700 text-[11px]">
                  The server reprices your relief items and opens a Safepay session. Your cart is only cleared once payment is verified.
                </span>
              </div>

              {!user || user.role !== 'donor' ? (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>Sign in with a donor account to continue to Safepay checkout.</span>
                </div>
              ) : items.length === 0 ? (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  <span>Your relief cart is empty. Add items from a campaign to fund exact needs.</span>
                </div>
              ) : (
                <div className="pt-1 flex items-center justify-center gap-1.5 text-xs text-slate-500 font-medium text-center">
                  <Lock className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>PakRelief never sees your card or wallet details.</span>
                </div>
              )}

              <button
                onClick={startCheckout}
                disabled={!user || user.role !== 'donor' || items.length === 0}
                className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md transition"
              >
                <CreditCard className="w-4 h-4" />
                <span>Continue to Safepay Sandbox</span>
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>
          )}

          {phase === 'loading' && (
            <div className="py-10 text-center space-y-4">
              <div className="relative w-16 h-16 mx-auto">
                <Loader2 className="w-16 h-16 text-emerald-600 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Lock className="w-6 h-6 text-emerald-700" />
                </div>
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-800">
                  {isReturnMode ? 'Verifying your payment' : 'Opening Safepay checkout'}
                </h4>
                <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                  {isReturnMode
                    ? 'Reading the server-verified payment state. Redirect alone is not proof of payment.'
                    : 'Pricing your relief items and creating a secure sandbox payment session.'}
                </p>
              </div>
            </div>
          )}

          {phase === 'redirecting' && (
            <div className="py-10 text-center space-y-4">
              <div className="relative w-16 h-16 mx-auto">
                <Loader2 className="w-16 h-16 text-emerald-600 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <ExternalLink className="w-6 h-6 text-emerald-700" />
                </div>
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-800">Redirecting to Safepay Sandbox</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                  Complete payment on Safepay's hosted page. You will return here afterwards — your cart stays intact until payment is verified.
                </p>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">Amount: PKR {displayAmount.toLocaleString()}</p>
            </div>
          )}

          {phase === 'status' && renderStatusBody()}
        </div>
      </div>
    </div>
  );
};