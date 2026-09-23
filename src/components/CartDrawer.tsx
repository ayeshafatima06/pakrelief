import React from 'react';
import { 
  X, 
  Trash2, 
  Plus, 
  Minus, 
  ShoppingBag, 
  ShieldCheck, 
  CreditCard, 
  Building2, 
  Truck,
  ArrowRight
} from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';

interface CartDrawerProps {
  onProceedToCheckout: () => void;
  onOpenAuth: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({ 
  onProceedToCheckout, 
  onOpenAuth 
}) => {
  const { 
    items, 
    isCartOpen, 
    setIsCartOpen, 
    updateQuantity, 
    removeItem, 
    clearCart, 
    totalAmount 
  } = useCart();
  const { user } = useAuth();

  if (!isCartOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/50 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-base">Relief Items Cart</h3>
            <span className="text-xs bg-emerald-950 text-emerald-300 font-mono px-2 py-0.5 rounded-full border border-emerald-700/60 font-bold">
              {items.length} {items.length === 1 ? 'item' : 'items'}
            </span>
          </div>
          <button
            onClick={() => setIsCartOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-4">
              <ShoppingBag className="w-8 h-8" />
            </div>
            <h4 className="text-base font-bold text-slate-800">Your Relief Cart is Empty</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-xs">
              Select verified food rations, medical kits, tents, or water purification cans from live disaster campaigns to fund exact needs.
            </p>
            <button
              onClick={() => setIsCartOpen(false)}
              className="mt-5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition"
            >
              Browse Active Disasters
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {items.map(item => (
              <div
                key={`${item.productId}-${item.requirementId}`}
                className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 relative"
              >
                <div className="flex justify-between items-start pr-6">
                  <div>
                    <h5 className="text-xs font-bold text-slate-900 leading-snug">
                      {item.productName}
                    </h5>
                    <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                      <Truck className="w-3 h-3 text-blue-600" />
                      <span>{item.supplierName}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-1">
                      <Building2 className="w-3 h-3 text-emerald-600" />
                      <span>Destination: {item.ngoName}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => removeItem(item.productId, item.requirementId)}
                    className="absolute top-3 right-3 text-slate-400 hover:text-rose-600 transition"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="pt-2 border-t border-slate-200/70 flex items-center justify-between">
                  {/* Quantity Stepper */}
                  <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2 py-1">
                    <button
                      onClick={() => updateQuantity(item.productId, item.requirementId, item.quantity - 1)}
                      className="text-slate-500 hover:text-slate-800"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="font-mono text-xs font-bold text-slate-900 min-w-[20px] text-center">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.productId, item.requirementId, item.quantity + 1)}
                      className="text-slate-500 hover:text-slate-800"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <span className="text-[10px] text-slate-500 font-medium">{item.unit}</span>
                  </div>

                  {/* Price */}
                  <div className="text-right font-mono">
                    <div className="text-xs text-slate-400">
                      PKR {item.unitPrice.toLocaleString()} each
                    </div>
                    <div className="text-sm font-bold text-slate-900">
                      PKR {(item.unitPrice * item.quantity).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer with Summary & Checkout */}
        {items.length > 0 && (
          <div className="p-4 border-t border-slate-200 bg-slate-50 space-y-3">
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Relief Items Subtotal:</span>
                <span className="font-mono font-semibold">PKR {totalAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span className="flex items-center gap-1">
                  <span>PakRelief Service & Gateway Fee:</span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1 rounded">
                    WAIVED
                  </span>
                </span>
                <span className="font-mono font-semibold text-emerald-700">PKR 0</span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between text-sm font-black text-slate-900">
                <span>Total Amount Payable:</span>
                <span className="font-mono text-emerald-700 text-base">
                  PKR {totalAmount.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Sandbox Guarantee Badge */}
            <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-[11px] text-emerald-900">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Independent backend payment verification with JazzCash Sandbox.</span>
            </div>

            {/* Action */}
            <button
              onClick={() => {
                setIsCartOpen(false);
                onProceedToCheckout();
              }}
              className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md transition"
            >
              <CreditCard className="w-4 h-4" />
              <span>Proceed to JazzCash Sandbox Checkout</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={clearCart}
              className="w-full py-1 text-center text-xs text-slate-400 hover:text-rose-600 transition"
            >
              Clear Cart
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
