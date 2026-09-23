import React from 'react';
import { AlertCircle, ArrowRight, ShieldCheck, MapPin, Activity, PackageCheck, Flame } from 'lucide-react';

interface DisasterBannerProps {
  onLearnMore?: () => void;
  stats?: {
    activeDisasters: number;
    totalAmountRaised: number;
    totalQuantityNeeded: number;
    totalQuantityFunded: number;
    totalQuantityDelivered: number;
  };
}

export const DisasterBanner: React.FC<DisasterBannerProps> = ({ stats }) => {
  const fundedPercent = stats && stats.totalQuantityNeeded > 0
    ? Math.round((stats.totalQuantityFunded / stats.totalQuantityNeeded) * 100)
    : 68;

  const deliveredPercent = stats && stats.totalQuantityFunded > 0
    ? Math.round((stats.totalQuantityDelivered / stats.totalQuantityFunded) * 100)
    : 74;

  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 text-white py-8 px-4 sm:px-6 lg:px-8 border-b border-teal-800/40">
      {/* Subtle background glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.15),transparent_50%)]" />

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          {/* Main Emergency Alert Title */}
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-bold uppercase tracking-wider mb-3 animate-pulse">
              <Flame className="w-3.5 h-3.5 text-rose-400" />
              National Emergency Operations Active — Monsoon 2026
            </div>
            
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
              Pakistan Disaster Relief E-Commerce Network
            </h1>
            
            <p className="mt-2 text-sm sm:text-base text-slate-300 leading-relaxed">
              Eliminating blind cash donations. Donors buy verified relief items from vetted Pakistani suppliers. 
              Accredited NGOs inspect shipments on the ground and independently certify receipt before orders close.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-300">
              <span className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700/60">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                SECP / VSWA Verified NGOs
              </span>
              <span className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700/60">
                <MapPin className="w-4 h-4 text-teal-400" />
                Sindh &bull; Balochistan &bull; KP Swat
              </span>
              <span className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700/60">
                <PackageCheck className="w-4 h-4 text-amber-400" />
                100% Itemized & Verifiable
              </span>
            </div>
          </div>

          {/* Live Progress Card */}
          <div className="bg-slate-800/90 backdrop-blur-md rounded-2xl p-5 border border-slate-700/80 shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between border-b border-slate-700/70 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  National Response Metrics
                </span>
              </div>
              <span className="text-[11px] font-mono text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/50">
                LIVE SNAPSHOT
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <span className="text-[11px] text-slate-400 block font-medium">Total PKR Funded</span>
                <span className="text-lg font-black text-white font-mono">
                  PKR {(stats?.totalAmountRaised || 166400).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block font-medium">Active Zones</span>
                <span className="text-lg font-black text-amber-400 font-mono">
                  {stats?.activeDisasters || 3} Districts
                </span>
              </div>
            </div>

            {/* Need vs Funded Bar */}
            <div className="space-y-1 mb-3">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-slate-300">Total Items Needed vs Funded:</span>
                <span className="text-emerald-400 font-mono font-bold">{fundedPercent}%</span>
              </div>
              <div className="w-full h-2.5 bg-slate-700 rounded-full overflow-hidden flex">
                <div 
                  className="bg-emerald-500 h-full rounded-full transition-all duration-700" 
                  style={{ width: `${fundedPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>{(stats?.totalQuantityFunded || 10410).toLocaleString()} Funded</span>
                <span>{(stats?.totalQuantityNeeded || 16800).toLocaleString()} Target Needed</span>
              </div>
            </div>

            {/* Funded vs Delivered Bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-slate-300">Funded Items Certified Delivered:</span>
                <span className="text-teal-400 font-mono font-bold">{deliveredPercent}%</span>
              </div>
              <div className="w-full h-2.5 bg-slate-700 rounded-full overflow-hidden flex">
                <div 
                  className="bg-teal-400 h-full rounded-full transition-all duration-700" 
                  style={{ width: `${deliveredPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>{(stats?.totalQuantityDelivered || 8570).toLocaleString()} Confirmed Received</span>
                <span>Third-Party Certified</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
