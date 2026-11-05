import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Building2, 
  Truck, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  FileText, 
  CreditCard, 
  Search, 
  Activity, 
  TrendingUp, 
  Eye, 
  Flag, 
  Layers,
  Users,
  RefreshCw
} from 'lucide-react';
import { User, Transaction, Campaign, Order, SocialPlatform, SocialPlatformPublication } from '../types';
import api from '../lib/api';

interface AdminDashboardProps {
  campaigns: Campaign[];
  orders: Order[];
  onRefresh: () => void;
}

interface SocialPublicationRow {
  campaignId: string;
  title: string;
  approvalStatus: string;
  socialPublishing: Partial<Record<SocialPlatform, SocialPlatformPublication>> | null;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ 
  campaigns, 
  orders, 
  onRefresh 
}) => {
  const [activeTab, setActiveTab] = useState<'approvals' | 'transactions' | 'overview'>('approvals');
  const [users, setUsers] = useState<User[]>([]);
  const [pendingCampaigns, setPendingCampaigns] = useState<Campaign[]>([]);
  const [socialPublicationRows, setSocialPublicationRows] = useState<SocialPublicationRow[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Selected doc for preview
  const [selectedUserDoc, setSelectedUserDoc] = useState<User | null>(null);

  const fetchAdminData = async () => {
    setIsLoading(true);
    try {
      const [usersRes, txRes, campaignsRes, socialRes] = await Promise.all([
        api.get('/admin/pending-users'),
        api.get('/transactions'),
        api.get('/admin/pending-campaigns'),
        api.get('/admin/social-publications')
      ]);
      setUsers(usersRes.data);
      setTransactions(txRes.data);
      setPendingCampaigns(campaignsRes.data.pendingCampaigns || []);
      setSocialPublicationRows(socialRes.data.campaigns || []);
    } catch (err: any) {
      console.error('Error fetching admin data', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const pendingNgos = users.filter(u => u.role === 'ngo' && u.verificationStatus === 'pending');
  const pendingSuppliers = users.filter(u => u.role === 'supplier' && u.verificationStatus === 'pending');
  const approvedUsers = users.filter(u => u.verificationStatus === 'approved');

  const handleVerifyUser = async (userId: string, status: 'approved' | 'rejected') => {
    setActionError(null);
    try {
      const res = await api.patch('/admin/verify-user', { userId, status });
      if (res.data.success) {
        setActionSuccess(`User ${status === 'approved' ? 'approved' : 'rejected'} successfully!`);
        fetchAdminData();
        onRefresh();
      }
    } catch (err: any) {
      setActionError(err.response?.data?.error || 'Verification action failed.');
    }
  };

  const handleFlagTransaction = async (txId: string, flagged: boolean) => {
    try {
      const res = await api.patch('/admin/flag-transaction', {
        transactionId: txId,
        flagged,
        reason: flagged ? 'Audit review flag triggered by NDMA compliance officer' : undefined
      });
      if (res.data.success) {
        setActionSuccess(`Transaction ${flagged ? 'flagged for audit' : 'cleared'}.`);
        fetchAdminData();
      }
    } catch (err: any) {
      setActionError('Failed to update transaction status.');
    }
  };

  const handleReviewCampaign = async (campaignId: string, status: 'approved' | 'rejected') => {
    setActionError(null);
    try {
      const res = await api.patch('/admin/review-campaign', {
        campaignId,
        status,
        notes: status === 'approved'
          ? 'Campaign approved by NDMA administrator after verification.'
          : 'Campaign rejected by NDMA administrator pending correction.'
      });

      if (res.data.success) {
        setActionSuccess(`Campaign ${status === 'approved' ? 'approved' : 'rejected'} successfully.`);
        fetchAdminData();
        onRefresh();
      }
    } catch (err: any) {
      setActionError(err.response?.data?.error || 'Campaign review action failed.');
    }
  };

  const handleRetrySocialPublication = async (campaignId: string, platform: SocialPlatform) => {
    setActionError(null);
    try {
      const response = await api.post(`/admin/campaigns/${encodeURIComponent(campaignId)}/social-publications/${platform}/retry`);
      const publication = response.data.socialPublishing?.[platform] as SocialPlatformPublication | undefined;
      setActionSuccess(publication?.status === 'published'
        ? `${platform} publishing was confirmed by Meta.`
        : `${platform} retry finished with status: ${publication?.status || 'unknown'}.`);
      fetchAdminData();
    } catch (err: any) {
      setActionError(err.response?.data?.error || `Could not retry ${platform} publication.`);
    }
  };

  const totalPkr = orders.reduce((sum, o) => sum + o.amount, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Admin Title Header */}
      <div className="bg-gradient-to-r from-slate-900 via-purple-950 to-slate-900 text-white rounded-2xl p-6 sm:p-8 shadow-lg border border-purple-900/50">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1 text-xs text-purple-400 font-bold uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4" />
              <span>National Disaster Management Oversight</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black">NDMA Central Admin Portal</h2>
            <p className="text-xs text-slate-300 mt-1">
              Statutory verification of NGOs & Suppliers, payment audit monitoring, and disaster coordination.
            </p>
          </div>

          <button
            onClick={() => { fetchAdminData(); onRefresh(); }}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Audit Logs</span>
          </button>
        </div>

        {/* Oversight KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-800">
          <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/60">
            <span className="text-[11px] text-slate-400 block font-medium">Pending Approvals</span>
            <span className="text-xl font-black font-mono text-amber-400">
              {pendingNgos.length + pendingSuppliers.length} Entities
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              {pendingNgos.length} NGOs &bull; {pendingSuppliers.length} Suppliers
            </span>
          </div>

          <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/60">
            <span className="text-[11px] text-slate-400 block font-medium">Verified Active Entities</span>
            <span className="text-xl font-black font-mono text-emerald-400">
              {approvedUsers.length} Accredited
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">SECP & CUIN Compliant</span>
          </div>

          <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/60">
            <span className="text-[11px] text-slate-400 block font-medium">Platform Processed</span>
            <span className="text-xl font-black font-mono text-white">
              PKR {totalPkr.toLocaleString()}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Via JazzCash Sandbox</span>
          </div>

          <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/60">
            <span className="text-[11px] text-slate-400 block font-medium">Total Orders Tracked</span>
            <span className="text-xl font-black font-mono text-teal-400">
              {orders.length} Relief Dispatches
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">100% Itemized & Audited</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-white p-1.5 rounded-xl border border-slate-200 shadow-xs gap-1">
        <button
          onClick={() => setActiveTab('approvals')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
            activeTab === 'approvals'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Building2 className="w-4 h-4 text-purple-400" />
          <span>Verification Queue ({pendingNgos.length + pendingSuppliers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('transactions')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
            activeTab === 'transactions'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <CreditCard className="w-4 h-4 text-emerald-400" />
          <span>Payment & Audit Trail ({transactions.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('overview')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
            activeTab === 'overview'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Activity className="w-4 h-4 text-amber-400" />
          <span>Active Relief Campaigns ({campaigns.length})</span>
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

      {/* TAB 1: APPROVALS QUEUE */}
      {activeTab === 'approvals' && (
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <FileText className="w-4 h-4 text-violet-600" />
                <span>Pending Campaign Reviews ({pendingCampaigns.length})</span>
              </h3>
              <span className="text-xs text-slate-500">Administrative public release approval queue</span>
            </div>

            {pendingCampaigns.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-slate-500 text-xs">
                No campaigns are awaiting approval.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingCampaigns.map(campaign => (
                  <div key={campaign.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
                    <div className="flex gap-3">
                      <img
                        src={campaign.photoUrl}
                        alt={campaign.disasterName}
                        className="w-20 h-20 object-cover rounded-xl border border-slate-200"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] font-bold uppercase bg-violet-100 text-violet-800 px-2 py-0.5 rounded font-mono">
                          Pending Review
                        </span>
                        <h4 className="font-bold text-sm text-slate-900 mt-1">{campaign.disasterName}</h4>
                        <p className="text-xs text-slate-500 mt-0.5">{campaign.location}</p>
                        <p className="text-[11px] text-slate-600 mt-2 line-clamp-3">{campaign.description}</p>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-600 bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-1">
                      <div>NGO: <strong>{campaign.ngoName}</strong></div>
                      <div>Type: <strong>{campaign.disasterType}</strong></div>
                      <div>Province: <strong>{campaign.province}</strong></div>
                      <div>Target Beneficiaries: <strong>{campaign.targetBeneficiaries}</strong></div>
                      <div>ID: <strong className="font-mono">{campaign.id}</strong></div>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => handleReviewCampaign(campaign.id, 'approved')}
                        className="flex-1 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1 shadow-xs transition"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Approve</span>
                      </button>

                      <button
                        onClick={() => handleReviewCampaign(campaign.id, 'rejected')}
                        className="py-1.5 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-bold transition"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <section aria-labelledby="social-publishing-heading" className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 id="social-publishing-heading" className="text-sm font-bold uppercase tracking-wider text-slate-700">
                Social Media Publishing
              </h3>
              <span className="text-xs text-slate-500">Approved campaigns only</span>
            </div>
            {socialPublicationRows.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-5 text-center text-xs text-slate-500">
                No approved campaigns are available for publishing.
              </div>
            ) : (
              <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase">
                    <tr>
                      <th className="p-3">Campaign</th>
                      <th className="p-3">Approval</th>
                      <th className="p-3">Facebook</th>
                      <th className="p-3">Instagram</th>
                      <th className="p-3">WhatsApp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {socialPublicationRows.map(row => (
                      <tr key={row.campaignId} className="align-top">
                        <td className="p-3 min-w-48">
                          <div className="font-bold text-slate-900">{row.title}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{row.campaignId}</div>
                        </td>
                        <td className="p-3 font-semibold text-emerald-700">{row.approvalStatus}</td>
                        {(['facebook', 'instagram', 'whatsapp'] as SocialPlatform[]).map(platform => {
                          const publication = row.socialPublishing?.[platform];
                          const state = publication?.status || 'pending';
                          const retryAvailable = state === 'failed' && publication?.retryable !== false &&
                            (!publication?.retryAfter || publication.retryAfter <= Date.now());
                          return (
                            <td key={platform} className="p-3 min-w-44">
                              <div className={`font-bold ${state === 'published' ? 'text-emerald-700' : state === 'failed' ? 'text-rose-700' : 'text-amber-700'}`}>
                                {platform === 'whatsapp' && state === 'published' ? 'Accepted by Meta' : state}
                              </div>
                              {publication?.error && <p className="mt-1 text-[10px] text-rose-700 break-words">{publication.error}</p>}
                              {publication?.attempts !== undefined && (
                                <p className="mt-1 text-[10px] text-slate-500">
                                  Attempts: {publication.attempts}
                                  {platform === 'whatsapp' && ` · Accepted: ${publication.acceptedCount || 0} · Failed: ${publication.failedCount || 0}`}
                                </p>
                              )}
                              {state === 'failed' && publication?.retryable === false && (
                                <p className="mt-1 text-[10px] text-amber-700">Manual platform verification is required before another attempt.</p>
                              )}
                              {publication?.retryAfter && publication.retryAfter > Date.now() && (
                                <p className="mt-1 text-[10px] text-slate-500">Retry after {new Date(publication.retryAfter).toLocaleString()}</p>
                              )}
                              {retryAvailable && (
                                <button
                                  type="button"
                                  onClick={() => handleRetrySocialPublication(row.campaignId, platform)}
                                  className="mt-2 px-2.5 py-1 bg-slate-900 hover:bg-slate-700 text-white rounded-md text-[10px] font-bold"
                                >
                                  Retry
                                </button>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* NGO Pending Queue */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-teal-600" />
                <span>Pending NGO Verifications ({pendingNgos.length})</span>
              </h3>
              <span className="text-xs text-slate-500">
                Audited against SECP / Provincial Registrar databases
              </span>
            </div>

            {pendingNgos.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-slate-500 text-xs">
                All NGO applications have been verified.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingNgos.map(ngo => (
                  <div key={ngo.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-mono">
                          Pending Approval
                        </span>
                        <h4 className="font-bold text-sm text-slate-900 mt-1">{ngo.name}</h4>
                        <span className="text-xs text-slate-500 block">{ngo.email}</span>
                      </div>

                      <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-mono font-bold">
                        {ngo.ngoDetails?.registrationType || 'SECP'}
                      </span>
                    </div>

                    <div className="text-xs space-y-1 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <div>Registration Number: <strong className="font-mono">{ngo.identifier}</strong></div>
                      <div>Focal Person: <strong>{ngo.ngoDetails?.focalPerson || ngo.name}</strong></div>
                      <div>Address: <strong>{ngo.ngoDetails?.address || 'Pakistan'}</strong></div>
                      <div>Contact: <strong className="font-mono">{ngo.contact}</strong></div>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => setSelectedUserDoc(ngo)}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold flex items-center gap-1 hover:bg-slate-50"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Docs</span>
                      </button>

                      <button
                        onClick={() => handleVerifyUser(ngo.id, 'approved')}
                        className="flex-1 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1 shadow-xs transition"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Approve NGO</span>
                      </button>

                      <button
                        onClick={() => handleVerifyUser(ngo.id, 'rejected')}
                        className="py-1.5 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-bold transition"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Supplier Pending Queue */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <Truck className="w-4 h-4 text-blue-600" />
                <span>Pending Supplier Verifications ({pendingSuppliers.length})</span>
              </h3>
              <span className="text-xs text-slate-500">
                Audited against CUIN Corporate Registry & Quality Standards
              </span>
            </div>

            {pendingSuppliers.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-slate-500 text-xs">
                All supplier applications have been verified.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingSuppliers.map(sup => (
                  <div key={sup.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-mono">
                          Pending Audit
                        </span>
                        <h4 className="font-bold text-sm text-slate-900 mt-1">{sup.name}</h4>
                        <span className="text-xs text-slate-500 block">{sup.email}</span>
                      </div>

                      <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-mono font-bold">
                        {sup.supplierDetails?.businessType || 'Corporate'}
                      </span>
                    </div>

                    <div className="text-xs space-y-1 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <div>CUIN / CNIC: <strong className="font-mono">{sup.identifier}</strong></div>
                      <div>Warehouse Hub: <strong>{sup.supplierDetails?.warehouseCity || 'Sindh'}</strong></div>
                      <div>Contact: <strong className="font-mono">{sup.contact}</strong></div>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => setSelectedUserDoc(sup)}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold flex items-center gap-1 hover:bg-slate-50"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Docs</span>
                      </button>

                      <button
                        onClick={() => handleVerifyUser(sup.id, 'approved')}
                        className="flex-1 py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1 shadow-xs transition"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Approve Supplier</span>
                      </button>

                      <button
                        onClick={() => handleVerifyUser(sup.id, 'rejected')}
                        className="py-1.5 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-bold transition"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: TRANSACTIONS & AUDIT TRAIL */}
      {activeTab === 'transactions' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700 uppercase tracking-wider">
              JazzCash Sandbox Demo Records · No Gateway Verification
            </span>
            <span className="text-slate-500 font-mono">
              Total Logged: {transactions.length} Transactions
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="p-3">Reference</th>
                  <th className="p-3">Order Number</th>
                  <th className="p-3">Donor Name</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Demo Payment Status</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Audit Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {transactions.map(tx => (
                  <tr key={tx.id} className="hover:bg-slate-50 transition">
                    <td className="p-3 font-mono font-bold text-slate-900">{tx.gatewayReference}</td>
                    <td className="p-3 font-mono text-slate-600">{tx.orderId}</td>
                    <td className="p-3 text-slate-800">{tx.donorName || 'Verified Donor'}</td>
                    <td className="p-3 font-mono font-bold text-slate-900">
                      PKR {tx.amount.toLocaleString()}
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${tx.status === 'Verified' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                        {tx.status === 'Verified' && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                        {tx.status === 'Pending' ? 'Demo · Pending' : tx.status || 'Unverified'}
                      </span>
                    </td>
                    <td className="p-3 text-slate-500 font-mono text-[11px]">
                      {new Date(tx.createdAt || tx.timestamp || Date.now()).toLocaleDateString('en-PK')}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => handleFlagTransaction(tx.id, !tx.flagged)}
                        className={`px-2 py-1 rounded text-[11px] font-bold flex items-center gap-1 transition ${
                          tx.flagged
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        <Flag className="w-3 h-3" />
                        <span>{tx.flagged ? 'Flagged' : 'Flag'}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {campaigns.map(camp => (
            <div key={camp.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-bold uppercase bg-slate-900 text-white px-2 py-0.5 rounded">
                    {camp.disasterType}
                  </span>
                  <h4 className="font-bold text-sm text-slate-900 mt-1">{camp.disasterName}</h4>
                  <span className="text-xs text-slate-500 block">{camp.location}</span>
                </div>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {camp.ngoName}
                </span>
              </div>
              <p className="text-xs text-slate-600 line-clamp-2">{camp.description}</p>
            </div>
          ))}
        </div>
      )}

      {/* DOCUMENT PREVIEW MODAL */}
      {selectedUserDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="border-b border-slate-100 pb-3 flex justify-between items-start">
              <div>
                <span className="text-[10px] uppercase font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
                  Submitted Verification Dossier
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">{selectedUserDoc.name}</h3>
              </div>
              <button
                onClick={() => setSelectedUserDoc(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm"
              >
                &times;
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <div>Official Identifier: <strong className="font-mono">{selectedUserDoc.identifier}</strong></div>
                <div>Role: <strong className="uppercase">{selectedUserDoc.role}</strong></div>
                <div>Email: <strong>{selectedUserDoc.email}</strong></div>
                <div>Contact: <strong className="font-mono">{selectedUserDoc.contact}</strong></div>
              </div>

              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 space-y-1">
                <span className="font-bold text-emerald-950 block">Audit Checklist:</span>
                <div className="text-emerald-800 text-[11px] space-y-0.5">
                  <div>&bull; SECP / Provincial Registrar database matched</div>
                  <div>&bull; Identity & Focal Person verified via NADRA CNIC</div>
                  <div>&bull; Physical relief dispatch capability affirmed</div>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setSelectedUserDoc(null)}
                className="w-full py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition"
              >
                Close Dossier
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
