import React, { useState } from 'react';
import { 
  HeartHandshake, 
  Package, 
  Truck, 
  Building2, 
  CheckCircle2, 
  Clock, 
  Receipt, 
  Search, 
  Filter,
  Calendar,
  ShieldCheck,
  ArrowUpRight
} from 'lucide-react';
import { Order } from '../types';
import { useAuth } from '../context/AuthContext';

interface DonorDashboardProps {
  orders: Order[];
  onViewReceipt: (order: Order) => void;
  onExploreCampaigns: () => void;
}

export const DonorDashboard: React.FC<DonorDashboardProps> = ({ 
  orders, 
  onViewReceipt, 
  onExploreCampaigns 
}) => {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const myOrders = orders.filter(o => o.donorId === user?.id || o.donorEmail === user?.email);

  const totalDonated = myOrders.reduce((acc, o) => acc + o.amount, 0);
  const totalItemsFunded = myOrders.reduce(
    (acc, o) => acc + o.items.reduce((s, it) => s + it.quantity, 0), 
    0
  );
  const ngoConfirmedCount = myOrders.filter(o => o.status === 'NGO Confirmed').length;

  const filteredOrders = myOrders.filter(o => {
    const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
    const matchesSearch = 
      o.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.campaignName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.supplierName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.ngoName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const getStatusBadge = (status: Order['status']) => {
    switch (status) {
      case 'NGO Confirmed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            NGO Confirmed on Ground
          </span>
        );
      case 'Delivered':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full bg-teal-100 text-teal-800 border border-teal-200">
            <Building2 className="w-3.5 h-3.5 text-teal-600" />
            Delivered to Camp
          </span>
        );
      case 'Dispatched':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full bg-blue-100 text-blue-800 border border-blue-200">
            <Truck className="w-3.5 h-3.5 text-blue-600" />
            Dispatched in Transit
          </span>
        );
      case 'Payment Confirmed':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-200">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            Payment Confirmed
          </span>
        );
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Donor Profile Header */}
      <div className="bg-gradient-to-r from-slate-900 to-teal-950 text-white rounded-2xl p-6 sm:p-8 shadow-lg border border-teal-900/50">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1 text-xs text-emerald-400 font-bold uppercase tracking-wider">
              <HeartHandshake className="w-4 h-4" />
              <span>Verified Relief Contributor</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black">{user?.name}</h2>
            <div className="text-xs text-slate-300 mt-1 flex flex-wrap gap-3">
              <span>Email: <strong>{user?.email}</strong></span>
              <span>CNIC: <strong>{user?.cnic || '35201-1234567-1'}</strong></span>
              <span className="text-emerald-300 font-semibold flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                Verified Identity
              </span>
            </div>
          </div>

          <button
            onClick={onExploreCampaigns}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md transition shrink-0"
          >
            <span>Fund More Urgent Needs</span>
            <ArrowUpRight className="w-4 h-4" />
          </button>
        </div>

        {/* Stats Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-800">
          <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700/60">
            <span className="text-xs text-slate-400 block font-medium">Total Contributed</span>
            <span className="text-2xl font-black font-mono text-emerald-400">
              PKR {totalDonated.toLocaleString()}
            </span>
            <span className="text-[11px] text-slate-400 mt-0.5 block">Via JazzCash Sandbox</span>
          </div>

          <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700/60">
            <span className="text-xs text-slate-400 block font-medium">Items Funded</span>
            <span className="text-2xl font-black font-mono text-white">
              {totalItemsFunded.toLocaleString()} Units
            </span>
            <span className="text-[11px] text-slate-400 mt-0.5 block">Across Disaster Camps</span>
          </div>

          <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700/60">
            <span className="text-xs text-slate-400 block font-medium">NGO Certified Deliveries</span>
            <span className="text-2xl font-black font-mono text-teal-400">
              {ngoConfirmedCount} / {myOrders.length} Orders
            </span>
            <span className="text-[11px] text-slate-400 mt-0.5 block">Third-party inspected</span>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider shrink-0 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" />
            Status:
          </span>
          {['all', 'Payment Confirmed', 'Dispatched', 'Delivered', 'NGO Confirmed'].map(st => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                statusFilter === st
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {st === 'all' ? 'All Orders' : st}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search order #, disaster, NGO..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Orders List */}
      <div className="space-y-4">
        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h4 className="text-base font-bold text-slate-800">No Orders Found</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              You haven't funded items matching this filter yet. Browse active disaster campaigns to fund exact needs with live traceability.
            </p>
            <button
              onClick={onExploreCampaigns}
              className="mt-4 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition"
            >
              Browse Active Disasters
            </button>
          </div>
        ) : (
          filteredOrders.map(order => (
            <div
              key={order.id}
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:border-slate-300 transition space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-slate-900">
                      {order.orderNumber}
                    </span>
                    {getStatusBadge(order.status)}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>{new Date(order.createdAt).toLocaleDateString('en-PK', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    <span>&bull;</span>
                    <span className="font-mono text-[11px]">Ref: {order.gatewayReference}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-[11px] text-slate-400 block font-medium">Amount Paid</span>
                    <span className="text-base font-black font-mono text-emerald-700">
                      PKR {order.amount.toLocaleString()}
                    </span>
                  </div>
                  <button
                    onClick={() => onViewReceipt(order)}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5 transition"
                  >
                    <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                    <span>View Receipt</span>
                  </button>
                </div>
              </div>

              {/* Order Info Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div>
                  <span className="text-slate-400 text-[10px] font-bold uppercase block">Campaign & Destination</span>
                  <span className="font-bold text-slate-800 block mt-0.5">{order.campaignName}</span>
                  <span className="text-slate-500 flex items-center gap-1 mt-0.5">
                    <Building2 className="w-3 h-3 text-emerald-600" />
                    {order.ngoName}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 text-[10px] font-bold uppercase block">Supplier & Dispatch</span>
                  <span className="font-bold text-slate-800 block mt-0.5">{order.supplierName}</span>
                  <span className="text-slate-500 flex items-center gap-1 mt-0.5">
                    <Truck className="w-3 h-3 text-blue-600" />
                    {order.dispatchDetails ? `${order.dispatchDetails.courierName}` : 'Preparing Dispatch'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 text-[10px] font-bold uppercase block">Ground Confirmation</span>
                  {order.ngoConfirmation ? (
                    <div className="text-emerald-800 mt-0.5">
                      <span className="font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Certified by Field Officer
                      </span>
                      <span className="text-[11px] text-emerald-700 italic block line-clamp-1 mt-0.5">
                        "{order.ngoConfirmation.notes}"
                      </span>
                    </div>
                  ) : (
                    <span className="text-slate-500 text-xs mt-0.5 block">
                      Awaiting ground inspection upon delivery
                    </span>
                  )}
                </div>
              </div>

              {/* Itemized Items */}
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                  Items Funded in this Order:
                </span>
                <div className="flex flex-wrap gap-2">
                  {order.items.map((it, idx) => (
                    <div
                      key={idx}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 text-xs flex items-center gap-2 border border-slate-200"
                    >
                      <Package className="w-3.5 h-3.5 text-emerald-700" />
                      <span className="font-medium">{it.productName}</span>
                      <span className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200">
                        {it.quantity} {it.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
