import React, { useState } from 'react';
import { 
  Building2, 
  Plus, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Package, 
  Truck, 
  MapPin, 
  Users, 
  Calendar,
  ShieldCheck,
  FileCheck,
  Sparkles,
  ArrowRight,
  TrendingUp
} from 'lucide-react';
import { Campaign, Requirement, Order } from '../types';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';

interface NgoDashboardProps {
  campaigns: (Campaign & { requirements?: Requirement[] })[];
  orders: Order[];
  onRefresh: () => void;
}

export const NgoDashboard: React.FC<NgoDashboardProps> = ({ 
  campaigns, 
  orders, 
  onRefresh 
}) => {
  const { user, verificationStatus } = useAuth();

  const [activeTab, setActiveTab] = useState<'campaigns' | 'deliveries' | 'new_campaign'>('deliveries');

  // New Campaign Form
  const [newDisasterName, setNewDisasterName] = useState('');
  const [newDisasterType, setNewDisasterType] = useState<any>('Flood');
  const [newProvince, setNewProvince] = useState('Sindh');
  const [newDistrict, setNewDistrict] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newTargetBeneficiaries, setNewTargetBeneficiaries] = useState('10000');
  const [newPhotoUrl, setNewPhotoUrl] = useState('https://images.unsplash.com/photo-1547683905-f686c993aae5?w=1000&auto=format&fit=crop&q=80');

  // New Requirement Form
  const [selectedCampaignForReq, setSelectedCampaignForReq] = useState<string>('');
  const [isAddingReq, setIsAddingReq] = useState(false);
  const [reqItemType, setReqItemType] = useState('');
  const [reqCategory, setReqCategory] = useState<any>('Food Rations');
  const [reqQtyNeeded, setReqQtyNeeded] = useState('1000');
  const [reqUnit, setReqUnit] = useState('Packs');
  const [reqUrgency, setReqUrgency] = useState<any>('Critical');
  const [reqDeadline, setReqDeadline] = useState('2026-10-25');
  const [reqEstimatedCost, setReqEstimatedCost] = useState('5000');

  // Confirmation Modal
  const [confirmingOrder, setConfirmingOrder] = useState<Order | null>(null);
  const [confirmationOfficer, setConfirmationOfficer] = useState(user?.name || 'Field Officer');
  const [confirmationNotes, setConfirmationNotes] = useState('');
  const [isSubmittingConfirm, setIsSubmittingConfirm] = useState(false);

  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Incoming orders needing NGO confirmation
  const incomingDeliveries = orders.filter(
    o => o.status === 'Delivered'
  );

  const confirmedDeliveries = orders.filter(
    o => o.status === 'NGO Confirmed'
  );

  // Handle Create Campaign
  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    try {
      const res = await api.post('/campaigns', {
        disasterName: newDisasterName,
        disasterType: newDisasterType,
        province: newProvince,
        district: newDistrict,
        location: newLocation || `${newDistrict}, ${newProvince}`,
        description: newDescription,
        photoUrl: newPhotoUrl,
        targetBeneficiaries: Number(newTargetBeneficiaries),
        ngoId: user?.id || 'ngo-1',
        ngoName: user?.name || 'Al-Khidmat Foundation'
      });

      if (res.data.success) {
        setActionSuccess('Disaster relief campaign created successfully!');
        setActiveTab('campaigns');
        onRefresh();
        // Reset form
        setNewDisasterName('');
        setNewDistrict('');
        setNewDescription('');
      }
    } catch (err: any) {
      setActionError(err.response?.data?.error || 'Failed to create campaign.');
    }
  };

  // Handle Add Requirement
  const handleAddRequirement = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    try {
      const res = await api.post('/requirements', {
        campaignId: selectedCampaignForReq,
        itemType: reqItemType,
        category: reqCategory,
        quantityNeeded: Number(reqQtyNeeded),
        unit: reqUnit,
        urgency: reqUrgency,
        deadline: reqDeadline,
        estimatedUnitCost: Number(reqEstimatedCost)
      });

      if (res.data.success) {
        setActionSuccess('Itemized requirement added to campaign!');
        setIsAddingReq(false);
        setReqItemType('');
        onRefresh();
      }
    } catch (err: any) {
      setActionError(err.response?.data?.error || 'Failed to add requirement.');
    }
  };

  // Handle Confirm Receipt
  const handleConfirmReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmingOrder) return;
    setIsSubmittingConfirm(true);
    setActionError(null);

    try {
      const res = await api.post('/orders/confirm-receipt', {
        orderId: confirmingOrder.id,
        confirmedBy: confirmationOfficer,
        notes: confirmationNotes || 'Goods inspected and verified intact at ground relief base. Distributed directly to verified flood victims.',
        distributionProofUrl: 'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=600&auto=format&fit=crop&q=80'
      });

      if (res.data.success) {
        setActionSuccess(
          `Delivery for order ${confirmingOrder.orderNumber} successfully confirmed! Traceability chain completed.`
        );
        setConfirmingOrder(null);
        setConfirmationNotes('');
        setIsSubmittingConfirm(false);
        onRefresh();
      }
    } catch (err: any) {
      setIsSubmittingConfirm(false);
      setActionError(err.response?.data?.error || 'Failed to confirm receipt.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* PENDING APPROVAL BANNER (Spec Requirement) */}
      {verificationStatus === 'pending' && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl flex items-start gap-3 shadow-xs">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 space-y-1">
            <h4 className="font-bold text-sm">Account Status: Pending Admin Approval</h4>
            <p>
              Your NGO registration documents (SECP / Society / Trust / VSWA) are under review by NDMA PakRelief Admin.
              Once approved by the government administrator, you will be able to publish public relief campaigns and certify receipts.
            </p>
            <p className="text-[11px] text-amber-800 font-semibold">
              Tip for Testing: You can switch to the pre-approved NGO (Al-Khidmat) using the demo bar above to test full features immediately!
            </p>
          </div>
        </div>
      )}

      {/* NGO Header */}
      <div className="bg-gradient-to-r from-slate-900 to-teal-950 text-white rounded-2xl p-6 sm:p-8 shadow-lg border border-teal-900/50">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1 text-xs text-teal-400 font-bold uppercase tracking-wider">
              <Building2 className="w-4 h-4" />
              <span>Registered Non-Governmental Organization</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black">{user?.name}</h2>
            <div className="text-xs text-slate-300 mt-1 flex flex-wrap gap-3">
              <span>Registration: <strong className="text-white font-mono">{user?.identifier || 'SECP-10492'}</strong></span>
              <span>Status: <strong className="capitalize text-emerald-400 font-bold">{verificationStatus}</strong></span>
              <span>Email: <strong className="text-white">{user?.email}</strong></span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('new_campaign')}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md transition"
            >
              <Plus className="w-4 h-4" />
              <span>New Disaster Campaign</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-white p-1.5 rounded-xl border border-slate-200 shadow-xs gap-1">
        <button
          onClick={() => setActiveTab('deliveries')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
            activeTab === 'deliveries'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Truck className="w-4 h-4 text-emerald-400" />
          <span>Confirm Incoming Deliveries ({incomingDeliveries.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('campaigns')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
            activeTab === 'campaigns'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Package className="w-4 h-4 text-teal-400" />
          <span>Active Campaigns & Itemized Requirements</span>
        </button>

        <button
          onClick={() => setActiveTab('new_campaign')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
            activeTab === 'new_campaign'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Plus className="w-4 h-4 text-amber-400" />
          <span>Create Disaster Campaign</span>
        </button>
      </div>

      {actionSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-xs text-rose-800 rounded-xl flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* TAB 1: CONFIRM DELIVERIES (Crucial third party check) */}
      {activeTab === 'deliveries' && (
        <div className="space-y-6">
          <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl text-xs text-emerald-900 space-y-1">
            <h4 className="font-bold flex items-center gap-1.5 text-sm text-emerald-950">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              Third-Party Receipt Certification Protocol
            </h4>
            <p>
              Under PakRelief regulations, suppliers only mark shipments as "Delivered" to your relief camp. 
              <strong> You, as an independent NGO, inspect the goods on the ground and confirm actual receipt</strong> before the order is closed and donors are notified.
            </p>
          </div>

          {/* Pending Confirmations */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              <span>Deliveries Awaiting Your Physical Inspection ({incomingDeliveries.length})</span>
            </h3>

            {incomingDeliveries.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500 text-xs">
                No shipments currently awaiting confirmation. Any order marked "Delivered" by suppliers will appear here for your independent verification.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {incomingDeliveries.map(ord => (
                  <div
                    key={ord.id}
                    className="bg-white rounded-2xl border-2 border-emerald-300 p-5 shadow-sm space-y-4"
                  >
                    <div className="flex justify-between items-start pb-3 border-b border-slate-100">
                      <div>
                        <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-mono">
                          Delivered by Supplier
                        </span>
                        <h4 className="font-mono font-bold text-sm text-slate-900 mt-1">
                          {ord.orderNumber}
                        </h4>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Supplier: <strong>{ord.supplierName}</strong>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-xs text-slate-400 block font-medium">Order Value</span>
                        <span className="text-base font-black font-mono text-slate-900">
                          PKR {ord.amount.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Dispatch Info */}
                    {ord.dispatchDetails && (
                      <div className="p-3 bg-slate-50 rounded-xl text-xs space-y-1 text-slate-700 border border-slate-100">
                        <div className="font-semibold flex items-center gap-1 text-blue-700">
                          <Truck className="w-3.5 h-3.5" />
                          <span>Courier: {ord.dispatchDetails.courierName}</span>
                        </div>
                        <div>Tracking #: <strong className="font-mono">{ord.dispatchDetails.trackingNumber}</strong></div>
                        {ord.dispatchDetails.vehicleNumber && (
                          <div>Vehicle: <strong className="font-mono">{ord.dispatchDetails.vehicleNumber}</strong></div>
                        )}
                      </div>
                    )}

                    {/* Items List */}
                    <div>
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                        Goods to Inspect:
                      </span>
                      <div className="space-y-1">
                        {ord.items.map((it, idx) => (
                          <div key={idx} className="flex justify-between text-xs p-1.5 bg-slate-50 rounded">
                            <span className="font-medium text-slate-800">{it.productName}</span>
                            <span className="font-mono font-bold text-slate-900">
                              {it.quantity} {it.unit}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Action */}
                    <button
                      onClick={() => setConfirmingOrder(ord)}
                      className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirm Receipt of Delivered Supplies</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Confirmed Deliveries Archive */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Certified Receipts Archive ({confirmedDeliveries.length})</span>
            </h3>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
              {confirmedDeliveries.map(ord => (
                <div key={ord.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900">{ord.orderNumber}</span>
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        Certified
                      </span>
                    </div>
                    <p className="text-slate-500 text-[11px] mt-0.5 italic">
                      "{ord.ngoConfirmation?.notes}"
                    </p>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      Confirmed by: {ord.ngoConfirmation?.confirmedBy} &bull; {ord.ngoConfirmation?.confirmedAt && new Date(ord.ngoConfirmation.confirmedAt).toLocaleString()}
                    </span>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-mono font-bold text-slate-900 text-sm">
                      PKR {ord.amount.toLocaleString()}
                    </span>
                    <span className="text-[11px] text-slate-400 block">
                      {ord.items.reduce((s, it) => s + it.quantity, 0)} Items Received
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CAMPAIGNS & REQUIREMENTS */}
      {activeTab === 'campaigns' && (
        <div className="space-y-6">
          {campaigns.map(camp => (
            <div key={camp.id} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold uppercase">
                      {camp.disasterType}
                    </span>
                    <span className="text-xs text-slate-500 flex items-center gap-1 font-medium">
                      <MapPin className="w-3.5 h-3.5 text-teal-600" />
                      {camp.location}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">{camp.disasterName}</h3>
                  <p className="text-xs text-slate-600 mt-1 max-w-2xl">{camp.description}</p>
                </div>

                <button
                  onClick={() => {
                    setSelectedCampaignForReq(camp.id);
                    setIsAddingReq(true);
                  }}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Itemized Requirement</span>
                </button>
              </div>

              {/* Requirements list */}
              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Itemized Relief Requirements ({camp.requirements?.length || 0}):
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {camp.requirements?.map(req => {
                    const fundedPct = req.quantityNeeded > 0 ? Math.round((req.quantityFunded / req.quantityNeeded) * 100) : 0;
                    const deliveredPct = req.quantityFunded > 0 ? Math.round((req.quantityDelivered / req.quantityFunded) * 100) : 0;

                    return (
                      <div key={req.id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-bold text-slate-900 block">{req.itemType}</span>
                            <span className="text-slate-500 text-[11px]">{req.category} &bull; Urgency: <strong className="text-rose-600">{req.urgency}</strong></span>
                          </div>
                          <span className="font-mono text-[11px] text-slate-500">
                            Deadline: {req.deadline}
                          </span>
                        </div>

                        {/* Progress */}
                        <div className="space-y-1 pt-1">
                          <div className="flex justify-between text-[11px]">
                            <span>Funded: <strong>{req.quantityFunded}</strong> of {req.quantityNeeded} {req.unit}</span>
                            <span className="font-bold text-emerald-700">{fundedPct}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${fundedPct}%` }} />
                          </div>

                          <div className="flex justify-between text-[11px]">
                            <span>Delivered on Ground: <strong>{req.quantityDelivered}</strong> {req.unit}</span>
                            <span className="font-bold text-teal-700">{deliveredPct}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full bg-teal-500 rounded-full" style={{ width: `${deliveredPct}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: CREATE NEW CAMPAIGN */}
      {activeTab === 'new_campaign' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs max-w-2xl mx-auto space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-900">Initiate Disaster Relief Operation</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Launch a transparent campaign with itemized requirements that donors can fund directly.
            </p>
          </div>

          <form onSubmit={handleCreateCampaign} className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 uppercase mb-1">
                Disaster Name / Title
              </label>
              <input
                type="text"
                value={newDisasterName}
                onChange={e => setNewDisasterName(e.target.value)}
                placeholder="e.g. South Punjab Flash Flood Relief Operations"
                required
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Disaster Type
                </label>
                <select
                  value={newDisasterType}
                  onChange={e => setNewDisasterType(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
                >
                  <option value="Flood">Monsoon Floods</option>
                  <option value="Earthquake">Earthquake</option>
                  <option value="Displaced Persons">Displaced Persons</option>
                  <option value="Heatwave">Heatwave Emergency</option>
                  <option value="Drought">Drought Relief</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Target Beneficiaries
                </label>
                <input
                  type="number"
                  value={newTargetBeneficiaries}
                  onChange={e => setNewTargetBeneficiaries(e.target.value)}
                  placeholder="10000"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Province
                </label>
                <select
                  value={newProvince}
                  onChange={e => setNewProvince(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
                >
                  <option value="Sindh">Sindh</option>
                  <option value="Balochistan">Balochistan</option>
                  <option value="Khyber Pakhtunkhwa">Khyber Pakhtunkhwa</option>
                  <option value="Punjab">Punjab</option>
                  <option value="Gilgit Baltistan">Gilgit Baltistan</option>
                  <option value="Azad Kashmir">Azad Kashmir</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  District / Tehsil
                </label>
                <input
                  type="text"
                  value={newDistrict}
                  onChange={e => setNewDistrict(e.target.value)}
                  placeholder="e.g. Rajanpur & Taunsa"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 uppercase mb-1">
                Disaster Ground Assessment Description
              </label>
              <textarea
                rows={3}
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                placeholder="Describe current status, road access, and urgent humanitarian requirements..."
                required
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition"
            >
              Publish Disaster Campaign
            </button>
          </form>
        </div>
      )}

      {/* CONFIRM RECEIPT MODAL */}
      {confirmingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="border-b border-slate-100 pb-3">
              <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                Official Independent Verification
              </span>
              <h3 className="text-base font-bold text-slate-900 mt-1">
                Certify Delivery Receipt — {confirmingOrder.orderNumber}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Supplier: <strong>{confirmingOrder.supplierName}</strong>
              </p>
            </div>

            <div className="space-y-2 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="font-bold text-slate-700 block">Shipment Items to Certify:</span>
              {confirmingOrder.items.map((it, idx) => (
                <div key={idx} className="flex justify-between text-slate-800">
                  <span>{it.productName}</span>
                  <span className="font-mono font-bold">{it.quantity} {it.unit}</span>
                </div>
              ))}
            </div>

            <form onSubmit={handleConfirmReceipt} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Certifying NGO Field Officer Name & Designation
                </label>
                <input
                  type="text"
                  value={confirmationOfficer}
                  onChange={e => setConfirmationOfficer(e.target.value)}
                  required
                  placeholder="e.g. Aslam Farooqi (Base Camp Coordinator)"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Ground Verification & Distribution Notes
                </label>
                <textarea
                  rows={3}
                  value={confirmationNotes}
                  onChange={e => setConfirmationNotes(e.target.value)}
                  placeholder="Confirm goods arrived in sealed condition, inspected by team, and distributed to verified displaced families..."
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmingOrder(null)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingConfirm}
                  className="flex-1 py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold shadow-md transition disabled:opacity-50"
                >
                  {isSubmittingConfirm ? 'Submitting Certification...' : 'Sign & Submit Official Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD REQUIREMENT MODAL */}
      {isAddingReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Add Itemized Relief Requirement
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Suppliers match this specification and donors fund exact quantities.
              </p>
            </div>

            <form onSubmit={handleAddRequirement} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Item Name / Specification
                </label>
                <input
                  type="text"
                  value={reqItemType}
                  onChange={e => setReqItemType(e.target.value)}
                  placeholder="e.g. 15-Day Family Ration Pack (Flour, Rice, Ghee)"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Category
                  </label>
                  <select
                    value={reqCategory}
                    onChange={e => setReqCategory(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                  >
                    <option value="Food Rations">Food Rations</option>
                    <option value="Clean Water & Filtration">Clean Water & Filtration</option>
                    <option value="Medical Supplies">Medical Supplies</option>
                    <option value="Shelter & Tents">Shelter & Tents</option>
                    <option value="Hygiene Kits">Hygiene Kits</option>
                    <option value="Warm Blankets & Clothing">Warm Blankets & Clothing</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Urgency
                  </label>
                  <select
                    value={reqUrgency}
                    onChange={e => setReqUrgency(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
                  >
                    <option value="Critical">Critical (Immediate)</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Quantity Needed
                  </label>
                  <input
                    type="number"
                    value={reqQtyNeeded}
                    onChange={e => setReqQtyNeeded(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Unit
                  </label>
                  <input
                    type="text"
                    value={reqUnit}
                    onChange={e => setReqUnit(e.target.value)}
                    placeholder="Packs, Tents, Cans"
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingReq(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-md transition"
                >
                  Save Requirement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
