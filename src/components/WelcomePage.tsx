import React, { useState } from 'react';
import { 
  ShieldCheck, 
  ArrowRight, 
  Building2, 
  Truck, 
  HeartHandshake, 
  Search,
  CheckCircle2,
  Lock,
  PackageCheck
} from 'lucide-react';
import { UserRole } from '../types';

interface WelcomePageProps {
  onNavigate: (page: string) => void;
  onOpenAuthWithRole: (role: UserRole, mode: 'login' | 'register') => void;
  onQuickTrackOrder?: (orderNumber: string) => void;
}

export const WelcomePage: React.FC<WelcomePageProps> = ({
  onNavigate,
  onOpenAuthWithRole,
  onQuickTrackOrder
}) => {
  const [quickTrackId, setQuickTrackId] = useState('');

  const handleTrackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (quickTrackId.trim()) {
      if (onQuickTrackOrder) {
        onQuickTrackOrder(quickTrackId.trim());
      } else {
        onNavigate('tracker');
      }
    }
  };

  return (
    <div className="py-10 pb-24 space-y-16">
      {/* 1. SIMPLE & DIFFERENT WELCOME HERO */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Official Statutory Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-50 text-emerald-800 text-xs font-bold border border-emerald-200 mb-6 shadow-xs">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>OFFICIAL PAKISTAN DISASTER RELIEF CONSORTIUM</span>
        </div>

        {/* Hero Headline */}
        <h1 className="text-4xl sm:text-6xl font-black text-slate-900 tracking-tight leading-tight">
          PakRelief
        </h1>
        <p className="text-xl sm:text-2xl font-bold text-emerald-700 mt-2">
          Direct, Itemized Relief for Disaster-Affected Communities
        </p>

        {/* Concise Mission Statement */}
        <p className="text-slate-600 text-sm sm:text-base mt-4 max-w-2xl mx-auto leading-relaxed">
          Replacing unverified cash donations with 100% itemized, traceable relief goods. 
          Every ration box, medical kit, clean water unit, and shelter tent is purchased at wholesale prices 
          and verified by field inspectors upon physical arrival at disaster camps across Pakistan.
        </p>

        {/* Primary Call to Action */}
        <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
          <button
            onClick={() => onOpenAuthWithRole('donor', 'login')}
            className="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-md shadow-emerald-700/20 flex items-center gap-2 transition transform active:scale-95 cursor-pointer"
          >
            <span>Sign In to Access Your Portal</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            onClick={() => onNavigate('disasters')}
            className="px-5 py-3.5 bg-white hover:bg-slate-50 text-slate-800 rounded-xl font-bold text-sm border border-slate-300 shadow-xs flex items-center gap-2 transition cursor-pointer"
          >
            <span>Browse Relief Needs</span>
          </button>
        </div>
      </section>

      {/* 2. SIMPLE ROLE ACCESS GATEWAY (Enter by Role) */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-6">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Select Your Role to Sign In or Register
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Card 1: Donor */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 hover:border-emerald-500 shadow-sm transition flex flex-col justify-between group">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                  <HeartHandshake className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100">
                  CNIC Verified
                </span>
              </div>
              <h3 className="font-bold text-base text-slate-900">Donors & Public</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Fund specific relief packages, pay securely via JazzCash, and download itemized tax-compliant receipts with live delivery tracking.
              </p>
            </div>
            <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-2">
              <button
                onClick={() => onOpenAuthWithRole('donor', 'login')}
                className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition text-center cursor-pointer shadow-xs"
              >
                Donor Sign In
              </button>
              <button
                onClick={() => onOpenAuthWithRole('donor', 'register')}
                className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition text-center cursor-pointer"
              >
                Register
              </button>
            </div>
          </div>

          {/* Card 2: NGO */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 hover:border-teal-500 shadow-sm transition flex flex-col justify-between group">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold">
                  <Building2 className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-bold text-teal-700 bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-100">
                  SECP / Trust
                </span>
              </div>
              <h3 className="font-bold text-base text-slate-900">Relief Foundations (NGOs)</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Post ground-zero relief requirements with GPS coordinates and conduct physical camp inspection sign-offs when goods arrive.
              </p>
            </div>
            <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-2">
              <button
                onClick={() => onOpenAuthWithRole('ngo', 'login')}
                className="flex-1 py-2 px-3 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-bold transition text-center cursor-pointer shadow-xs"
              >
                NGO Sign In
              </button>
              <button
                onClick={() => onOpenAuthWithRole('ngo', 'register')}
                className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition text-center cursor-pointer"
              >
                Register
              </button>
            </div>
          </div>

          {/* Card 3: Supplier */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 hover:border-blue-500 shadow-sm transition flex flex-col justify-between group">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
                  <Truck className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100">
                  CUIN / NTN
                </span>
              </div>
              <h3 className="font-bold text-base text-slate-900">Suppliers & Manufacturers</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                List standardized rations and emergency shelter supplies at wholesale rates, manage dispatch logistics, and attach courier tracking.
              </p>
            </div>
            <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-2">
              <button
                onClick={() => onOpenAuthWithRole('supplier', 'login')}
                className="flex-1 py-2 px-3 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-bold transition text-center cursor-pointer shadow-xs"
              >
                Supplier Sign In
              </button>
              <button
                onClick={() => onOpenAuthWithRole('supplier', 'register')}
                className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition text-center cursor-pointer"
              >
                Register
              </button>
            </div>
          </div>

          {/* Card 4: NDMA Admin */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 hover:border-purple-500 shadow-sm transition flex flex-col justify-between group">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-100">
                  Statutory NDMA
                </span>
              </div>
              <h3 className="font-bold text-base text-slate-900">NDMA Statutory Authority</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Regulate stakeholder accreditations, audit financial inflows and transactions, and direct national disaster response priorities.
              </p>
            </div>
            <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-2">
              <button
                onClick={() => onOpenAuthWithRole('admin', 'login')}
                className="w-full py-2 px-3 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-xs font-bold transition text-center cursor-pointer shadow-xs"
              >
                NDMA Admin Portal Sign In
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 3. SIMPLE VERIFY RECEIPT / ORDER LOOKUP */}
      <section className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-slate-900 text-white rounded-2xl p-6 sm:p-8 shadow-md border border-slate-800">
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2">
            <PackageCheck className="w-4 h-4" />
            <span>Public Traceability Lookup</span>
          </div>
          <h3 className="text-lg font-bold text-white mb-1">
            Verify Any Relief Order or Receipt
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            Enter any PakRelief order identifier to instantly check live dispatch, courier tracking, and NGO camp sign-off.
          </p>

          <form onSubmit={handleTrackSubmit} className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
              <input
                type="text"
                value={quickTrackId}
                onChange={(e) => setQuickTrackId(e.target.value)}
                placeholder="e.g. ORD-PK-2026-001"
                className="w-full pl-9 pr-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <button
              type="submit"
              className="py-2.5 px-5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition cursor-pointer shrink-0"
            >
              Verify Order
            </button>
          </form>
        </div>
      </section>

      {/* 4. TRUST & SECURITY STANDARDS */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-200">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-xs text-slate-900">Zero Unaudited Cash</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Every transaction maps directly to cataloged relief supplies.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-xs text-slate-900">Regulated Accreditation</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                SECP, Societies, and CUIN verified stakeholders under NDMA oversight.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-xs text-slate-900">Camp Proof Sign-Off</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Field inspectors inspect shipments and log physical proof before closure.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
