import React from 'react';
import { 
  ShieldCheck, 
  ArrowRight, 
  Package, 
  Truck, 
  Building2, 
  HeartHandshake, 
  ChevronRight,
  AlertTriangle,
  FileCheck,
  CreditCard,
  PlusCircle
} from 'lucide-react';
import { Campaign } from '../types';

interface WelcomePageProps {
  stats: any;
  featuredCampaign?: Campaign;
  onNavigate: (page: string) => void;
  onSelectCampaign: (campaign: Campaign) => void;
  onOpenAuth: () => void;
}

export const WelcomePage: React.FC<WelcomePageProps> = ({
  stats,
  featuredCampaign,
  onNavigate,
  onSelectCampaign,
  onOpenAuth
}) => {
  return (
    <div className="space-y-16 py-6 pb-20">
      {/* 1. HERO SECTION */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 text-white rounded-3xl p-8 sm:p-14 shadow-2xl relative overflow-hidden border border-emerald-800/40">
          <div className="absolute -right-20 -top-20 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30 mb-6 tracking-wide">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>OFFICIAL PAKISTAN DISASTER RELIEF CONSORTIUM</span>
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-tight">
              Pak Relief
            </h1>
            <p className="text-xl sm:text-2xl font-bold text-emerald-200 mt-2">
              Traceable E-Commerce Relief for Pakistan
            </p>

            <p className="text-slate-300 text-sm sm:text-base mt-4 leading-relaxed max-w-2xl">
              PakRelief transforms disaster response in Pakistan by replacing blind cash donations with 
              <strong> 100% itemized, verifiable e-commerce relief orders</strong>. We connect Donors, 
              accredited NGOs, vetted local Suppliers, and NDMA regulators in one transparent pipeline.
            </p>

            {/* Main Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 mt-8">
              <button
                onClick={() => onNavigate('disasters')}
                className="px-6 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl font-bold text-sm shadow-lg shadow-emerald-900/40 flex items-center gap-2 transition transform active:scale-95 cursor-pointer"
              >
                <span>Browse Relief Operations</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => onNavigate('how-it-works')}
                className="px-5 py-3.5 bg-slate-800/80 hover:bg-slate-700 text-white rounded-xl font-bold text-sm border border-slate-700 flex items-center gap-2 transition cursor-pointer"
              >
                <span>How Traceability Works</span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                onClick={() => onNavigate('portals')}
                className="px-5 py-3.5 bg-white/10 hover:bg-white/20 text-emerald-300 rounded-xl font-bold text-sm border border-emerald-500/30 flex items-center gap-2 transition cursor-pointer"
              >
                <span>Stakeholder Portals</span>
              </button>
            </div>
          </div>

          {/* Real Live Database Stats Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-12 pt-8 border-t border-slate-800/80 relative z-10">
            <div>
              <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">Active Disasters</span>
              <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-400">
                {stats?.activeDisasters || 0}
              </span>
              <span className="text-[10px] text-slate-400 mt-0.5 block">Live Operations</span>
            </div>

            <div>
              <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">Goods Requested</span>
              <span className="text-2xl sm:text-3xl font-black font-mono text-white">
                {(stats?.totalQuantityNeeded || 0).toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-400 mt-0.5 block">Itemized Units</span>
            </div>

            <div>
              <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">Verified Delivered</span>
              <span className="text-2xl sm:text-3xl font-black font-mono text-teal-300">
                {(stats?.totalQuantityDelivered || 0).toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-400 mt-0.5 block">Camp Confirmed</span>
            </div>

            <div>
              <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">Aid Processed</span>
              <span className="text-2xl sm:text-3xl font-black font-mono text-amber-300">
                PKR {(stats?.totalAmountRaised || 0).toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-400 mt-0.5 block">Verified by JazzCash</span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. THE 4-STEP RELIEF PIPELINE */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <span className="text-xs font-bold uppercase tracking-widest text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
            Step-by-Step Transparency
          </span>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mt-2">
            The 4-Stage Relief Chain
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Every Rupee spent is tied to a specific item from request to physical camp confirmation.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          {/* Step 1 */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 font-black text-sm flex items-center justify-center">
                  01
                </span>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Demand</span>
              </div>
              <h3 className="font-bold text-base text-slate-900 mb-1">Disaster Need</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Vetted NGOs (SECP/Trust registered) survey ground zero and post exact itemized requirements, quantities, and camp coordinates.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center text-xs font-bold text-rose-600">
              <Building2 className="w-3.5 h-3.5 mr-1" />
              <span>NGO Assessment</span>
            </div>
          </div>

          {/* Step 2 */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 font-black text-sm flex items-center justify-center">
                  02
                </span>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Supply</span>
              </div>
              <h3 className="font-bold text-base text-slate-900 mb-1">Supplier Products</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Accredited Pakistani manufacturers list standardized rations, tents, and medicines at fixed, transparent PKR wholesale prices.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center text-xs font-bold text-blue-600">
              <Package className="w-3.5 h-3.5 mr-1" />
              <span>Vetted Catalog</span>
            </div>
          </div>

          {/* Step 3 */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 font-black text-sm flex items-center justify-center">
                  03
                </span>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Payment</span>
              </div>
              <h3 className="font-bold text-base text-slate-900 mb-1">Donor Cart & Pay</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Donors add exact supplies to cart (e.g. 5 ration packs). Backend independently verifies the transaction with JazzCash.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center text-xs font-bold text-emerald-600">
              <CreditCard className="w-3.5 h-3.5 mr-1" />
              <span>JazzCash Gateway</span>
            </div>
          </div>

          {/* Step 4 */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="w-8 h-8 rounded-xl bg-teal-100 text-teal-700 font-black text-sm flex items-center justify-center">
                  04
                </span>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Audit</span>
              </div>
              <h3 className="font-bold text-base text-slate-900 mb-1">Delivery & Sign-off</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Suppliers dispatch with courier tracking. NGO field logistics officers independently inspect and certify receipt before closure.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center text-xs font-bold text-teal-700">
              <FileCheck className="w-3.5 h-3.5 mr-1" />
              <span>Certified Delivery</span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. FEATURED EMERGENCY OR EMPTY STATE */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {featuredCampaign ? (
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-md flex flex-col md:flex-row">
            <div className="md:w-5/12 relative h-64 md:h-auto min-h-[260px]">
              <img
                src={featuredCampaign.photoUrl}
                alt={featuredCampaign.disasterName}
                className="w-full h-full object-cover"
              />
              <div className="absolute top-4 left-4 bg-rose-600 text-white text-[11px] font-black uppercase px-2.5 py-1 rounded-md shadow-md flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Urgent Priority</span>
              </div>
            </div>

            <div className="p-6 sm:p-8 md:w-7/12 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500 mb-1">
                  <span>{featuredCampaign.province}, Pakistan</span>
                  <span>&bull;</span>
                  <span className="text-emerald-700 font-semibold">{featuredCampaign.ngoName}</span>
                </div>

                <h3 className="text-xl sm:text-2xl font-black text-slate-900">
                  {featuredCampaign.disasterName}
                </h3>

                <p className="text-xs sm:text-sm text-slate-600 mt-2 line-clamp-3">
                  {featuredCampaign.description}
                </p>

                {featuredCampaign.urgentNotice && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 font-medium">
                    ⚠️ {featuredCampaign.urgentNotice}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <div>
                  <span className="text-[11px] text-slate-400 block font-semibold">Beneficiaries Targeted</span>
                  <span className="text-base font-black font-mono text-slate-800">
                    {featuredCampaign.targetBeneficiaries.toLocaleString()} Individuals
                  </span>
                </div>

                <button
                  onClick={() => onSelectCampaign(featuredCampaign)}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-2 cursor-pointer"
                >
                  <span>Select Supplies to Fund</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 text-center shadow-sm space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto">
              <Building2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">
              No Active Disaster Campaigns Currently Posted
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 max-w-lg mx-auto">
              Verified relief foundations (SECP, Societies, or Trust registered) can register their organization and publish itemized disaster relief requirements with camp coordinates.
            </p>
            <div className="pt-2 flex justify-center gap-3">
              <button
                onClick={() => onNavigate('portals')}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-sm"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Publish Campaign via NGO Portal</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 4. CHOOSE A ROLE / PERSONA PORTALS */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-xl mx-auto mb-8">
          <span className="text-xs font-bold uppercase tracking-widest text-slate-500 bg-slate-200 px-3 py-1 rounded-full">
            Multi-User Roles
          </span>
          <h2 className="text-2xl font-black text-slate-900 mt-2">
            Explore by User Portal
          </h2>
          <p className="text-xs text-slate-600 mt-1">
            PakRelief enforces Role-Based Access Control (RBAC) across 4 verified stakeholder types:
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Donor */}
          <div 
            onClick={() => onNavigate('portals')}
            className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-emerald-500 hover:shadow-md transition cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold mb-3 group-hover:scale-105 transition">
              <HeartHandshake className="w-5 h-5 text-emerald-700" />
            </div>
            <h4 className="font-bold text-sm text-slate-900">Donor Portal</h4>
            <p className="text-xs text-slate-500 mt-1">
              Browse disasters, checkout with JazzCash, and track receipts end-to-end.
            </p>
            <div className="mt-3 text-xs font-bold text-emerald-600 flex items-center gap-1">
              <span>Enter Portal</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* NGO */}
          <div 
            onClick={() => onNavigate('portals')}
            className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-teal-500 hover:shadow-md transition cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center font-bold mb-3 group-hover:scale-105 transition">
              <Building2 className="w-5 h-5 text-teal-700" />
            </div>
            <h4 className="font-bold text-sm text-slate-900">NGO Relief Center</h4>
            <p className="text-xs text-slate-500 mt-1">
              Submit itemized requests, manage campaigns, and verify physical delivery at camps.
            </p>
            <div className="mt-3 text-xs font-bold text-teal-700 flex items-center gap-1">
              <span>Enter Portal</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Supplier */}
          <div 
            onClick={() => onNavigate('portals')}
            className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-blue-500 hover:shadow-md transition cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-bold mb-3 group-hover:scale-105 transition">
              <Truck className="w-5 h-5 text-blue-700" />
            </div>
            <h4 className="font-bold text-sm text-slate-900">Supplier Logistics</h4>
            <p className="text-xs text-slate-500 mt-1">
              List fixed-price relief items, fulfill orders, and attach courier tracking.
            </p>
            <div className="mt-3 text-xs font-bold text-blue-600 flex items-center gap-1">
              <span>Enter Portal</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Admin */}
          <div 
            onClick={() => onNavigate('portals')}
            className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-purple-500 hover:shadow-md transition cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center font-bold mb-3 group-hover:scale-105 transition">
              <ShieldCheck className="w-5 h-5 text-purple-700" />
            </div>
            <h4 className="font-bold text-sm text-slate-900">NDMA Central Admin</h4>
            <p className="text-xs text-slate-500 mt-1">
              Audit NGO registrations (SECP/Trust), approve suppliers, and review transactions.
            </p>
            <div className="mt-3 text-xs font-bold text-purple-700 flex items-center gap-1">
              <span>Enter Portal</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
