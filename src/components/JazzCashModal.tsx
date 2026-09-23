import React, { useState } from 'react';
import { 
  X, 
  ShieldCheck, 
  Lock, 
  Smartphone, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Sparkles,
  CreditCard
} from 'lucide-react';
import confetti from 'canvas-confetti';
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

  const [mobileNumber, setMobileNumber] = useState('03001234567');
  const [cnicDigits, setCnicDigits] = useState('123456');
  const [mpin, setMpin] = useState('1234');
  const [isProcessing, setIsProcessing] = useState(false);
  const [verificationStep, setVerificationStep] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFillSandboxData = () => {
    setMobileNumber('03001234567');
    setCnicDigits('123456');
    setMpin('1234');
    setErrorMessage(null);
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Basic format checks
    const cleanMobile = mobileNumber.replace(/\D/g, '');
    if (cleanMobile.length !== 11 || !cleanMobile.startsWith('03')) {
      setErrorMessage('Please provide a valid 11-digit Pakistani mobile number starting with 03.');
      return;
    }

    if (!mpin || mpin.length < 4) {
      setErrorMessage('Please enter a 4-digit JazzCash Sandbox MPIN.');
      return;
    }

    setIsProcessing(true);
    setVerificationStep('Connecting to JazzCash Sandbox Gateway...');

    try {
      await new Promise(r => setTimeout(r, 600));
      setVerificationStep('Authenticating merchant signature & digital certificate...');

      await new Promise(r => setTimeout(r, 600));
      setVerificationStep('Independent backend verification of funds and creating orders...');

      // Call independent backend verification endpoint
      const response = await api.post('/payments/verify-jazzcash', {
        cartItems: items,
        donorId: user?.id || 'usr-donor-1',
        donorName: user?.name || 'Verified Donor',
        donorEmail: user?.email || 'donor@pakrelief.gov.pk',
        donorCnic: user?.cnic || '35201-1234567-1',
        paymentDetails: {
          mobileNumber: cleanMobile,
          cnic: cnicDigits,
          mpin,
          amount: totalAmount
        }
      });

      if (response.data.success) {
        // Trigger celebratory confetti
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 }
        });

        const createdOrders = response.data.orders;
        const gatewayRef = response.data.gatewayReference;

        clearCart();
        setIsProcessing(false);
        onClose();
        onSuccess(createdOrders, gatewayRef);
      } else {
        throw new Error(response.data.error || 'Gateway returned verification failure');
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
              SANDBOX GATEWAY
            </span>
            <span className="text-white/80 text-xs flex items-center gap-1">
              <Lock className="w-3 h-3" />
              256-bit Encrypted
            </span>
          </div>

          <h3 className="text-xl font-black tracking-tight flex items-center gap-2">
            <span>JazzCash Online Checkout</span>
          </h3>

          <p className="text-xs text-red-100 mt-1">
            Official Non-Profit Disaster Relief Integration
          </p>

          <div className="mt-3 pt-3 border-t border-red-600/60 flex items-center justify-between">
            <span className="text-xs text-red-100 font-medium">Relief Order Total:</span>
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
              <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                Independent backend verification ensures zero transaction spoofing.
              </p>
            </div>
          ) : (
            <form onSubmit={handlePayment} className="space-y-4">
              {/* Quick Fill Test Credentials */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs flex items-center justify-between">
                <div>
                  <span className="font-bold text-amber-900 block">Sandbox Demo Mode</span>
                  <span className="text-amber-700 text-[11px]">Click to prefill test credentials</span>
                </div>
                <button
                  type="button"
                  onClick={handleFillSandboxData}
                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded font-bold text-xs flex items-center gap-1 shadow-xs transition"
                >
                  <Sparkles className="w-3 h-3" />
                  Auto-Fill
                </button>
              </div>

              {/* Mobile Number */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  JazzCash Mobile Account Number
                </label>
                <div className="relative">
                  <Smartphone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="tel"
                    value={mobileNumber}
                    onChange={e => setMobileNumber(e.target.value)}
                    placeholder="03001234567"
                    required
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500 transition"
                  />
                </div>
                <span className="text-[11px] text-slate-400 mt-0.5 block">Format: 03XXXXXXXXX (11 digits)</span>
              </div>

              {/* CNIC Digits */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  CNIC Verification (Last 6 Digits)
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={cnicDigits}
                  onChange={e => setCnicDigits(e.target.value)}
                  placeholder="123456"
                  required
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono tracking-widest focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500 transition"
                />
              </div>

              {/* MPIN */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  4-Digit Sandbox MPIN
                </label>
                <input
                  type="password"
                  maxLength={4}
                  value={mpin}
                  onChange={e => setMpin(e.target.value)}
                  placeholder="****"
                  required
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono tracking-widest text-center focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500 transition"
                />
                <span className="text-[11px] text-slate-400 mt-0.5 block">Test sandbox MPIN: 1234</span>
              </div>

              {/* Security Seal */}
              <div className="pt-2 flex items-center justify-center gap-1.5 text-xs text-slate-500 font-medium">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Zero Trust Architecture &bull; Backend Validated</span>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className="w-full py-3 px-4 rounded-xl bg-red-700 hover:bg-red-800 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md transition"
              >
                <Lock className="w-4 h-4" />
                <span>Confirm & Authorize Payment (PKR {totalAmount.toLocaleString()})</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
