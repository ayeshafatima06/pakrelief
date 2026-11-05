import React, { useEffect, useState } from 'react';
import { 
  X, 
  Lock,
  AlertCircle, 
  Loader2, 
  Clock,
  CreditCard
} from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';
import { Order } from '../types';

interface JazzCashModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (orders: Order[], gatewayReference: string) => void;
}

export const JazzCashModal: React.FC<JazzCashModalProps> = ({ 
  isOpen, 
  onClose, 
  onSuccess 
}) => {
  const { items, totalAmount, clearCart } = useCart();
  const { user } = useAuth();

  const [isProcessing, setIsProcessing] = useState(false);
  const [verificationStep, setVerificationStep] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [requestId, setRequestId] = useState('');

  useEffect(() => {
    if (isOpen) {
      setRequestId(globalThis.crypto?.randomUUID?.() || `demo-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!user || user.role !== 'donor') {
      setErrorMessage('Sign in with a donor account to create a sandbox order reservation.');
      return;
    }

    setIsProcessing(true);
    setVerificationStep('Checking current catalog prices and inventory...');

    try {
      const response = await api.post('/payments/verify-jazzcash', {
        requestId,
        cartItems: items.map(item => ({
          productId: item.productId,
          requirementId: item.requirementId,
          campaignId: item.campaignId,
          quantity: item.quantity
        }))
      });

      if (response.data.success) {
        const createdOrders = response.data.orders;
        const gatewayRef = response.data.gatewayReference;

        clearCart();
        setIsProcessing(false);
        onClose();
        onSuccess(createdOrders, gatewayRef);
      } else {
        throw new Error(response.data.error || 'Could not create the sandbox reservation.');
      }
    } catch (err: any) {
      setIsProcessing(false);
      setVerificationStep('');
      setErrorMessage(
        err.response?.data?.error || 
        err.message || 
        'JazzCash Sandbox payment verification failed. Please try again.'
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-slate-200">
        {/* JazzCash Brand Header */}
        <div className="bg-gradient-to-r from-red-700 via-red-800 to-amber-700 p-5 text-white relative">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-30 transition"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 mb-1">
            <span className="bg-amber-400 text-slate-950 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded font-mono">
              DEMO ONLY
            </span>
            <span className="text-white/80 text-xs flex items-center gap-1">
              <Clock className="w-3 h-3" />
              No payment processed
            </span>
          </div>

          <h3 className="text-xl font-black tracking-tight flex items-center gap-2">
            <span>JazzCash Sandbox Demo</span>
          </h3>

          <p className="text-xs text-red-100 mt-1">
            This demo does not connect to JazzCash or verify payments.
          </p>

          <div className="mt-3 pt-3 border-t border-red-600/60 flex items-center justify-between">
            <span className="text-xs text-red-100 font-medium">Estimated cart total:</span>
            <span className="text-xl font-black font-mono text-white">
              PKR {totalAmount.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-6">
          {errorMessage && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {isProcessing ? (
            <div className="py-10 text-center space-y-4">
              <div className="relative w-16 h-16 mx-auto">
                <Loader2 className="w-16 h-16 text-red-600 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Lock className="w-6 h-6 text-red-700" />
                </div>
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-800">
                  Verifying Sandbox Transaction
                </h4>
                <p className="text-xs text-slate-500 font-mono mt-1 animate-pulse">
                  {verificationStep}
                </p>
              </div>
              <p className="text-[11px] text-slate-400 max-w-xs mx-auto">No payment credentials are collected or sent.</p>
            </div>
          ) : (
            <form onSubmit={handlePayment} className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs flex items-center justify-between">
                <div>
                  <span className="font-bold text-amber-900 block">No gateway transaction will occur</span>
                  <span className="text-amber-700 text-[11px]">Creates a pending inventory reservation for 15 minutes only.</span>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-center gap-1.5 text-xs text-slate-500 font-medium">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <span>Server reprices items; reservation is not a payment.</span>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className="w-full py-3 px-4 rounded-xl bg-red-700 hover:bg-red-800 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md transition"
              >
                <CreditCard className="w-4 h-4" />
                <span>Create Pending Demo Order</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
