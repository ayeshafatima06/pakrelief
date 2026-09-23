import React, { useState } from 'react';
import { 
  Search, 
  CheckCircle2, 
  Clock, 
  Truck, 
  FileCheck, 
  CreditCard, 
  MapPin, 
  Building2, 
  ShieldCheck, 
  Receipt, 
  ArrowRight,
  AlertCircle
} from 'lucide-react';
import { Order } from '../types';

interface OrderTrackerPageProps {
  orders: Order[];
  onViewReceipt: (order: Order) => void;
  onNavigate: (page: string) => void;
}

export const OrderTrackerPage: React.FC<OrderTrackerPageProps> = ({
  orders,
  onViewReceipt,
  onNavigate
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(orders[0] || null);

  const filteredOrders = orders.filter(o => 
    o.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.gatewayReference.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.donorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.campaignName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStepStatus = (order: Order, stepNumber: number) => {
    // 1: Need & Order Placed
    if (stepNumber === 1) return 'completed';
    // 2: Payment Verified
    if (stepNumber === 2) return 'completed';
    // 3: Dispatched
    if (stepNumber === 3) {
      if (['Dispatched', 'Delivered', 'NGO Confirmed'].includes(order.status)) return 'completed';
      return 'pending';
    }
    // 4: NGO Ground Confirmed
    if (stepNumber === 4) {
      if (order.status === 'NGO Confirmed') return 'completed';
      if (order.status === 'Delivered') return 'current';
      return 'pending';
    }
    return 'pending';
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto">
        <span className="text-xs font-bold uppercase tracking-widest text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
          Public Audit & Verification
        </span>
        <h1 className="text-3xl sm:text-4xl font-black text-slate-900 mt-2">
          Relief Order Traceability Tracker
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 mt-1">
          Verify any order's journey from JazzCash payment to physical NGO camp delivery.
        </p>
      </div>

      {/* Search Bar & Order Picker */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by Order #, Gateway Ref, or Donor..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto text-xs pb-1">
          <span className="text-slate-400 font-semibold shrink-0">Quick Demo Orders:</span>
          {orders.slice(0, 3).map((ord) => (
            <button
              key={ord.id}
              onClick={() => setSelectedOrder(ord)}
              className={`px-3 py-1.5 rounded-lg font-mono text-[11px] font-bold shrink-0 transition cursor-pointer ${
                selectedOrder?.id === ord.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              {ord.orderNumber.split('-').slice(-1)[0]} ({ord.status})
            </button>
          ))}
        </div>
      </div>

      {selectedOrder ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-10 shadow-sm space-y-8">
          {/* Order Summary Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-slate-500">
                  {selectedOrder.orderNumber}
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold font-mono ${
                  selectedOrder.status === 'NGO Confirmed'
                    ? 'bg-emerald-100 text-emerald-800'
                    : selectedOrder.status === 'Delivered'
                    ? 'bg-teal-100 text-teal-800'
                    : selectedOrder.status === 'Dispatched'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  {selectedOrder.status}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
                {selectedOrder.campaignName}
              </h2>
              <span className="text-xs text-slate-500">
                Funded by: <strong className="text-slate-800">{selectedOrder.donorName}</strong> &bull; Total: <strong className="font-mono text-emerald-700">PKR {selectedOrder.amount.toLocaleString()}</strong>
              </span>
            </div>

            <button
              onClick={() => onViewReceipt(selectedOrder)}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer self-start md:self-auto"
            >
              <Receipt className="w-3.5 h-3.5 text-emerald-400" />
              <span>View Official Tax Receipt</span>
            </button>
          </div>

          {/* 4-Stage Lifecycle Stepper */}
          <div className="space-y-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Verified Order Milestones
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative">
              {/* Milestone 1 */}
              <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 mb-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>1. Disaster Need</span>
                </div>
                <p className="text-[11px] text-slate-600">
                  Targeted by <strong>{selectedOrder.ngoName}</strong> for relief camps.
                </p>
              </div>

              {/* Milestone 2 */}
              <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 mb-1">
                  <CreditCard className="w-4 h-4 text-emerald-600" />
                  <span>2. Payment Verified</span>
                </div>
                <p className="text-[11px] text-slate-600">
                  Gateway Ref: <span className="font-mono font-bold text-slate-800">{selectedOrder.gatewayReference}</span>
                </p>
              </div>

              {/* Milestone 3 */}
              <div className={`p-4 rounded-2xl border ${
                getStepStatus(selectedOrder, 3) === 'completed'
                  ? 'bg-emerald-50/70 border-emerald-200'
                  : 'bg-slate-50 border-slate-200 opacity-60'
              }`}>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800 mb-1">
                  <Truck className="w-4 h-4 text-blue-600" />
                  <span>3. Supplier Dispatch</span>
                </div>
                {selectedOrder.dispatchDetails ? (
                  <p className="text-[11px] text-slate-600">
                    Fleet: {selectedOrder.dispatchDetails.courierName} ({selectedOrder.dispatchDetails.trackingNumber})
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400">Awaiting supplier dispatch</p>
                )}
              </div>

              {/* Milestone 4 */}
              <div className={`p-4 rounded-2xl border ${
                selectedOrder.status === 'NGO Confirmed'
                  ? 'bg-emerald-50/70 border-emerald-200'
                  : 'bg-slate-50 border-slate-200 opacity-60'
              }`}>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800 mb-1">
                  <FileCheck className="w-4 h-4 text-teal-700" />
                  <span>4. NGO Ground Sign-off</span>
                </div>
                {selectedOrder.ngoConfirmation ? (
                  <p className="text-[11px] text-slate-600">
                    Certified by: {selectedOrder.ngoConfirmation.confirmedBy}
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400">Pending camp receipt check</p>
                )}
              </div>
            </div>
          </div>

          {/* Itemized Goods Breakdown */}
          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200/80 space-y-3">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Itemized Goods Funded in This Order
            </h4>

            <div className="divide-y divide-slate-200">
              {selectedOrder.items.map((item, idx) => (
                <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-900">{item.productName}</span>
                    <span className="text-slate-500 block text-[11px]">
                      Supplied by {selectedOrder.supplierName} &bull; Qty: {item.quantity} {item.unit}
                    </span>
                  </div>
                  <span className="font-mono font-bold text-slate-900">
                    PKR {(item.quantity * item.unitPrice).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center text-slate-500 text-xs">
          No order selected. Search for an order above or select from the demo buttons.
        </div>
      )}
    </div>
  );
};
