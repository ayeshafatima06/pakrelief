import React from 'react';
import { 
  HeartHandshake, 
  Building2, 
  Truck, 
  ShieldCheck, 
  CheckCircle2, 
  ArrowRight, 
  UserCheck,
  LogIn,
  UserPlus
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';

interface PortalsPageProps {
  onOpenAuth: (role: UserRole, mode: 'login' | 'register') => void;
  onNavigateToDashboard: () => void;
}

export const PortalsPage: React.FC<PortalsPageProps> = ({
  onOpenAuth,
  onNavigateToDashboard
}) => {
  const { user } = useAuth();

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto">
        <span className="text-xs font-bold uppercase tracking-widest text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
          Role-Based Access Control (RBAC)
        </span>
        <h1 className="text-3xl sm:text-4xl font-black text-slate-900 mt-2">
          PakRelief Stakeholder Portals
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 mt-1">
          Access role-specific interfaces with statutory role-based access control.
        </p>
      </div>

      {/* Active Session Status Bar */}
      {user ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-sm">
              <UserCheck className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase text-emerald-800 tracking-wider">
                Currently Active Session
              </span>
              <h3 className="text-base font-bold text-slate-900">
                {user.name} &bull; <span className="uppercase text-emerald-700 font-mono">[{user.role}]</span>
              </h3>
              <span className="text-xs text-slate-500">
                Registered identifier: <code className="font-mono text-slate-800">{user.identifier}</code>
              </span>
            </div>
          </div>

          <button
            onClick={onNavigateToDashboard}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm self-start sm:self-auto cursor-pointer"
          >
            <span>Open My Active Workspace</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="bg-slate-100 border border-slate-200 rounded-2xl p-4 text-center text-xs text-slate-600">
          Please select your role below to <strong>Sign In</strong> with your registered identifier or <strong>Sign Up</strong> with email verification.
        </div>
      )}

      {/* 4 Portal Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 1. DONOR */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm flex flex-col justify-between space-y-6 hover:border-emerald-500 transition">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                <HeartHandshake className="w-6 h-6 text-emerald-700" />
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono">
                Donor Access
              </span>
            </div>

            <h3 className="text-xl font-bold text-slate-900">Donor Portal</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              For individuals, overseas Pakistanis, and corporate philanthropists. Fund exact relief goods, verify payments via JazzCash, and track orders to camp delivery.
            </p>

            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-2 text-xs text-slate-700">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Browse itemized relief requirements with direct cart checkout</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Traceable courier tracking and tax-exempt printable receipts</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => onOpenAuth('donor', 'login')}
              className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In as Donor</span>
            </button>
            <button
              onClick={() => onOpenAuth('donor', 'register')}
              className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Register</span>
            </button>
          </div>
        </div>

        {/* 2. NGO */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm flex flex-col justify-between space-y-6 hover:border-teal-500 transition">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 rounded-2xl bg-teal-100 text-teal-800 flex items-center justify-center font-bold">
                <Building2 className="w-6 h-6 text-teal-700" />
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-teal-50 text-teal-700 border border-teal-200 font-mono">
                SECP / Societies / Trust
              </span>
            </div>

            <h3 className="text-xl font-bold text-slate-900">NGO Relief Center</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              For accredited relief foundations (SECP Sec 42, Societies Act, Trust Act, or VSWA). Post itemized requirements, manage camp distributions, and submit independent delivery confirmations.
            </p>

            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-2 text-xs text-slate-700">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span>Publish itemized disaster needs, specs, quantities, and camp coordinates</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span>Digital sign-off on incoming supplier shipments upon camp arrival</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => onOpenAuth('ngo', 'login')}
              className="flex-1 py-3 px-4 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In as NGO</span>
            </button>
            <button
              onClick={() => onOpenAuth('ngo', 'register')}
              className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Register NGO</span>
            </button>
          </div>
        </div>

        {/* 3. SUPPLIER */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm flex flex-col justify-between space-y-6 hover:border-blue-500 transition">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-800 flex items-center justify-center font-bold">
                <Truck className="w-6 h-6 text-blue-700" />
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 font-mono">
                CUIN Registered
              </span>
            </div>

            <h3 className="text-xl font-bold text-slate-900">Supplier Logistics Hub</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              For accredited Pakistani manufacturers and wholesale distributors. Manage inventory, fulfill funded relief orders with courier tracking numbers, and confirm camp dispatches.
            </p>

            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-2 text-xs text-slate-700">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>List wholesale disaster relief packages with fixed PKR prices</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Fulfill orders with courier name, tracking number, and vehicle plates</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => onOpenAuth('supplier', 'login')}
              className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In as Supplier</span>
            </button>
            <button
              onClick={() => onOpenAuth('supplier', 'register')}
              className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Register Supplier</span>
            </button>
          </div>
        </div>

        {/* 4. ADMIN */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm flex flex-col justify-between space-y-6 hover:border-purple-500 transition">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-800 flex items-center justify-center font-bold">
                <ShieldCheck className="w-6 h-6 text-purple-700" />
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200 font-mono">
                Statutory Authority
              </span>
            </div>

            <h3 className="text-xl font-bold text-slate-900">NDMA Central Admin</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              National Disaster Management Authority oversight. Review and approve NGO statutory documents, audit supplier registries, and monitor JazzCash transactions.
            </p>

            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-2 text-xs text-slate-700">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                <span>Audit and approve pending NGO and Supplier accreditation queues</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                <span>National relief transparency audit and transaction monitoring</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => onOpenAuth('admin', 'login')}
              className="flex-1 py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
            >
              <LogIn className="w-4 h-4 text-purple-400" />
              <span>NDMA Official Sign In</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
