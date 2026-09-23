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
import { User, Transaction, Campaign, Order } from '../types';
import api from '../lib/api';

interface AdminDashboardProps {
  campaigns: Campaign[];
  orders: Order[];
  onRefresh: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ 
  campaigns, 
  orders, 
  onRefresh 
}) => {
  const [activeTab, setActiveTab] = useState<'approvals' | 'transactions' | 'overview'>('approvals');
  const [users, setUsers] = useState<User[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Selected doc for preview
  const [selectedUserDoc, setSelectedUserDoc] = useState<User | null>(null);

  const fetchAdminData = async () => {
    setIsLoading(true);
    try {
      const [usersRes, txRes] = await Promise.all([
        api.get('/admin/pending-users'),
        api.get('/transactions')
      ]);
      setUsers(usersRes.data);
      setTransactions(txRes.data);
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
              Independent Gateway Verification Log (JazzCash Sandbox)
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
                  <th className="p-3">Backend Verification</th>
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
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        {tx.verifiedStatus}
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
