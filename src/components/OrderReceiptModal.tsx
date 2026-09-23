import React from 'react';
import { 
  X, 
  ShieldCheck, 
  CheckCircle2, 
  Clock, 
  Truck, 
  Building2, 
  Printer, 
  ExternalLink,
  Package,
  QrCode,
  MapPin,
  Calendar
} from 'lucide-react';
import { Order } from '../types';

interface OrderReceiptModalProps {
  order: Order | null;
  onClose: () => void;
}

export const OrderReceiptModal: React.FC<OrderReceiptModalProps> = ({ order, onClose }) => {
  if (!order) return null;

  const steps = [
    {
      id: 'paid',
      title: 'Payment Confirmed',
      desc: `Ref: ${order.gatewayReference}`,
      date: new Date(order.createdAt).toLocaleDateString('en-PK', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      isCompleted: true,
      isActive: order.status === 'Payment Confirmed'
    },
    {
      id: 'dispatched',
      title: 'Dispatched by Supplier',
      desc: order.dispatchDetails 
        ? `${order.dispatchDetails.courierName} (${order.dispatchDetails.trackingNumber})` 
        : 'Awaiting supplier dispatch',
      date: order.dispatchDetails ? new Date(order.dispatchDetails.dispatchedAt).toLocaleDateString('en-PK', { month: 'short', day: 'numeric' }) : '',
      isCompleted: order.status === 'Dispatched' || order.status === 'Delivered' || order.status === 'NGO Confirmed',
      isActive: order.status === 'Dispatched'
    },
    {
      id: 'delivered',
      title: 'Delivered to Relief Camp',
      desc: order.deliveredAt ? 'Arrived at ground camp' : 'In transit to ground base',
      date: order.deliveredAt ? new Date(order.deliveredAt).toLocaleDateString('en-PK', { month: 'short', day: 'numeric' }) : '',
      isCompleted: order.status === 'Delivered' || order.status === 'NGO Confirmed',
      isActive: order.status === 'Delivered'
    },
    {
      id: 'ngo_confirmed',
      title: 'NGO Receipt Certified',
      desc: order.ngoConfirmation 
        ? `Certified by: ${order.ngoConfirmation.confirmedBy}` 
        : 'Independent ground verification pending',
      date: order.ngoConfirmation ? new Date(order.ngoConfirmation.confirmedAt).toLocaleDateString('en-PK', { month: 'short', day: 'numeric' }) : '',
      isCompleted: order.status === 'NGO Confirmed',
      isActive: order.status === 'NGO Confirmed'
    }
  ];

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative bg-white rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-slate-200 max-h-[90vh] flex flex-col">
        {/* Modal Top Bar */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <span className="font-bold text-sm sm:text-base">PakRelief Traceable Receipt</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Receipt Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-800">
          {/* Header info */}
          <div className="border-b border-slate-200 pb-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Verifiable Order
                </span>
                <h3 className="text-xl font-mono font-black text-slate-900 mt-1">
                  {order.orderNumber}
                </h3>
                <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Placed: {new Date(order.createdAt).toLocaleString('en-PK')}</span>
                </div>
              </div>

              <div className="sm:text-right">
                <span className="text-xs text-slate-500 block">Total Contribution:</span>
                <span className="text-2xl font-black font-mono text-emerald-700">
                  PKR {order.amount.toLocaleString()}
                </span>
                <span className="text-[11px] font-mono text-slate-500 block">
                  JazzCash Ref: {order.gatewayReference}
                </span>
              </div>
            </div>
          </div>

          {/* 4-Stage Traceability Timeline */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
              Full Traceability Pipeline Status
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 relative">
              {steps.map((step, idx) => (
                <div
                  key={step.id}
                  className={`p-3 rounded-xl border text-xs flex flex-col justify-between ${
                    step.isCompleted
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                      : 'bg-slate-50 border-slate-200 text-slate-500'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-mono text-[10px] font-bold text-slate-400">
                        0{idx + 1}
                      </span>
                      {step.isCompleted ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <Clock className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                      )}
                    </div>
                    <span className="font-bold block leading-tight">{step.title}</span>
                    <span className="text-[11px] text-slate-600 mt-1 block line-clamp-2">
                      {step.desc}
                    </span>
                  </div>
                  {step.date && (
                    <span className="font-mono text-[10px] text-slate-500 mt-2 block font-medium">
                      {step.date}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* NGO Receipt Certification Box (if confirmed) */}
          {order.ngoConfirmation && (
            <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 space-y-2">
              <div className="flex items-center gap-2 text-teal-900 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5 text-teal-600" />
                <span>Third-Party Independent NGO Certification</span>
              </div>
              <p className="text-xs text-teal-800 leading-relaxed italic">
                "{order.ngoConfirmation.notes}"
              </p>
              <div className="flex flex-wrap items-center justify-between text-[11px] text-teal-700 pt-2 border-t border-teal-200/60">
                <span>Certified By: <strong>{order.ngoConfirmation.confirmedBy}</strong></span>
                <span>Date: {new Date(order.ngoConfirmation.confirmedAt).toLocaleString('en-PK')}</span>
              </div>
            </div>
          )}

          {/* Parties Involved */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <span className="text-slate-400 uppercase font-bold text-[10px] block">Beneficiary Cause</span>
              <span className="font-bold text-slate-800 block mt-0.5">{order.campaignName}</span>
              <span className="text-slate-500 flex items-center gap-1 mt-0.5">
                <Building2 className="w-3 h-3 text-emerald-600" />
                {order.ngoName}
              </span>
            </div>
            <div>
              <span className="text-slate-400 uppercase font-bold text-[10px] block">Procured From</span>
              <span className="font-bold text-slate-800 block mt-0.5">{order.supplierName}</span>
              <span className="text-slate-500 flex items-center gap-1 mt-0.5">
                <Truck className="w-3 h-3 text-blue-600" />
                Verified Supplier
              </span>
            </div>
            <div>
              <span className="text-slate-400 uppercase font-bold text-[10px] block">Donor</span>
              <span className="font-bold text-slate-800 block mt-0.5">{order.donorName}</span>
              <span className="text-slate-500 font-mono text-[11px] block mt-0.5">
                CNIC: {order.donorCnic || '35201-1234567-1'}
              </span>
            </div>
          </div>

          {/* Itemized Goods */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Itemized Relief Goods Funded
            </h4>
            <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-200">
              {order.items.map((it, idx) => (
                <div key={idx} className="p-3 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-900 block">{it.productName}</span>
                    <span className="text-slate-500 text-[11px]">
                      Required for: {it.itemType}
                    </span>
                  </div>
                  <div className="text-right font-mono">
                    <span className="font-bold text-slate-900 block">
                      {it.quantity} {it.unit}
                    </span>
                    <span className="text-slate-500 text-[11px]">
                      @ PKR {it.unitPrice.toLocaleString()} = PKR {(it.quantity * it.unitPrice).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Official Government Disaster Response Seal &bull; PakRelief</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-900 text-white font-bold hover:bg-slate-800 transition"
          >
            Close Receipt
          </button>
        </div>
      </div>
    </div>
  );
};
