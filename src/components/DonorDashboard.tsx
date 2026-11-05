import React, { useEffect, useState } from 'react';
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
  ArrowUpRight,
  AlertTriangle
} from 'lucide-react';
import { Order, Campaign } from '../types';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';

interface DonorDashboardProps {
  orders: Order[];
  campaigns?: Campaign[];
  onViewReceipt: (order: Order) => void;
  onExploreCampaigns: () => void;
  onSelectCampaign?: (campaign: Campaign) => void;
}

export const DonorDashboard: React.FC<DonorDashboardProps> = ({ 
  orders, 
  campaigns = [],
  onViewReceipt, 
  onExploreCampaigns,
  onSelectCampaign
}) => {
  const { user, refreshProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<'campaigns' | 'orders'>('campaigns');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [whatsappPhone, setWhatsappPhone] = useState(user?.whatsappPhone || user?.contact || '');
  const [whatsappOptIn, setWhatsappOptIn] = useState(user?.whatsappOptIn === true);
  const [isSavingWhatsAppConsent, setIsSavingWhatsAppConsent] = useState(false);
  const [whatsappConsentMessage, setWhatsappConsentMessage] = useState<string | null>(null);

  useEffect(() => {
    setWhatsappPhone(user?.whatsappPhone || user?.contact || '');
    setWhatsappOptIn(user?.whatsappOptIn === true);
  }, [user?.id, user?.whatsappPhone, user?.contact, user?.whatsappOptIn]);

  const handleSaveWhatsAppConsent = async (event: React.FormEvent) => {
    event.preventDefault();
    setWhatsappConsentMessage(null);
    setIsSavingWhatsAppConsent(true);
    try {
      await api.patch('/auth/whatsapp-consent', {
        optIn: whatsappOptIn,
        ...(whatsappOptIn ? { phone: whatsappPhone } : {})
      });
      await refreshProfile();
      setWhatsappConsentMessage(whatsappOptIn
        ? 'WhatsApp campaign notifications enabled.'
        : 'WhatsApp campaign notifications disabled.');
    } catch (error: any) {
      setWhatsappConsentMessage(error.response?.data?.error || 'Could not update WhatsApp preferences.');
    } finally {
      setIsSavingWhatsAppConsent(false);
    }
  };

  const myOrders = orders.filter(o => o.donorId === user?.id || o.donorEmail === user?.email);
  const confirmedOrders = myOrders.filter(o => ['Payment Confirmed', 'Dispatched', 'Delivered', 'NGO Confirmed'].includes(o.status));

  const totalDonated = confirmedOrders.reduce((acc, o) => acc + o.amount, 0);
  const totalItemsFunded = confirmedOrders.reduce(
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
      case 'Payment Pending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-200">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            Demo Reservation Pending
          </span>
        );
      case 'Payment Expired':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full bg-slate-100 text-slate-700 border border-slate-200">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            Reservation Expired
          </span>
        );
      case 'Paid':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full bg-slate-100 text-slate-700 border border-slate-200">
            <AlertTriangle className="w-3.5 h-3.5 text-slate-500" />
            Legacy status · payment unverified
          </span>
        );
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

      <form onSubmit={handleSaveWhatsAppConsent} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1 space-y-3">
          <label className="flex items-start gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={whatsappOptIn}
              onChange={event => setWhatsappOptIn(event.target.checked)}
              className="mt-0.5 accent-emerald-600"
            />
            <span>I agree to receive approved campaign announcements via WhatsApp. I can opt out at any time.</span>
          </label>
          <label className="block text-[11px] font-semibold text-slate-600">
            WhatsApp number
            <input
              type="tel"
              value={whatsappPhone}
              onChange={event => setWhatsappPhone(event.target.value)}
              placeholder="+92 300 1234567"
              autoComplete="tel"
              className="mt-1 block w-full sm:max-w-xs px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
            />
          </label>
          {whatsappConsentMessage && <p role="status" className="text-xs text-slate-600">{whatsappConsentMessage}</p>}
        </div>
        <button
          type="submit"
          disabled={isSavingWhatsAppConsent}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg text-xs font-bold"
        >
          {isSavingWhatsAppConsent ? 'Saving…' : 'Save preferences'}
        </button>
      </form>

      {/* Role Landing Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('campaigns')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeTab === 'campaigns'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Package className="w-4 h-4 text-emerald-400" />
          <span>Active Relief Campaigns to Fund</span>
          {campaigns.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-600 text-white font-mono">
              {campaigns.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('orders')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeTab === 'orders'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Receipt className="w-4 h-4 text-teal-400" />
          <span>My Funded Orders & Receipts</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-700 text-white font-mono">
            {myOrders.length}
          </span>
        </button>
      </div>

      {/* TAB 1: CAMPAIGNS VIEW */}
      {activeTab === 'campaigns' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">
              Disaster Relief Needs Requiring Verified Donor Support
            </h3>
            <span className="text-xs text-slate-500">
              100% itemized supplies delivered directly to verified camps
            </span>
          </div>

          {campaigns.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h4 className="text-base font-bold text-slate-800">No Active Relief Campaigns</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                No active disaster campaigns are currently listed. Please check back shortly or explore past orders.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {campaigns.map((camp) => (
                <div
                  key={camp.id}
                  className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md transition flex flex-col justify-between"
                >
                  <div>
                    <div className="relative h-44 w-full bg-slate-100 overflow-hidden">
                      <img
                        src={camp.photoUrl}
                        alt={camp.disasterName}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-0.5 rounded">
                        {camp.disasterType} &bull; {camp.province}
                      </div>
                    </div>

                    <div className="p-4 space-y-2">
                      <div className="text-[11px] font-semibold text-emerald-700">
                        {camp.ngoName}
                      </div>
                      <h4 className="font-bold text-sm text-slate-900 line-clamp-1">
                        {camp.disasterName}
                      </h4>
                      <p className="text-xs text-slate-500 line-clamp-2">
                        {camp.description}
                      </p>
                      <div className="text-[11px] text-slate-400">
                        Target: <strong className="text-slate-700">{camp.targetBeneficiaries.toLocaleString()} people</strong> in {camp.district}
                      </div>
                    </div>
                  </div>

                  <div className="p-4 pt-0">
                    <button
                      onClick={() => onSelectCampaign ? onSelectCampaign(camp) : onExploreCampaigns()}
                      className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <span>Select Supplies to Fund</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ORDERS VIEW */}
      {activeTab === 'orders' && (
        <div className="space-y-6">
          {/* Filter & Search Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider shrink-0 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" />
                Status:
              </span>
              {['all', 'Payment Pending', 'Payment Expired', 'Paid', 'Payment Confirmed', 'Dispatched', 'Delivered', 'NGO Confirmed'].map(st => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
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
                  You haven't funded items matching this filter yet.
                </p>
                <button
                  onClick={() => setActiveTab('campaigns')}
                  className="mt-4 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition cursor-pointer"
                >
                  Browse Relief Needs
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
                    <span className="text-[11px] text-slate-400 block font-medium">
                      {order.status === 'Payment Pending' ? 'Estimated reservation' : order.status === 'Payment Expired' ? 'Expired reservation' : order.status === 'Paid' ? 'Legacy unverified amount' : 'Amount Paid'}
                    </span>
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
      )}
    </div>
  );
};
