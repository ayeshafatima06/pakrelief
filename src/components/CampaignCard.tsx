import React from 'react';
import { 
  MapPin, 
  Users, 
  Building2, 
  CheckCircle2, 
  AlertOctagon, 
  Clock, 
  ArrowRight,
  ShieldCheck,
  TrendingUp,
  Package
} from 'lucide-react';
import { Campaign, Requirement } from '../types';

interface CampaignCardProps {
  campaign: Campaign & {
    requirements?: Requirement[];
    totalNeeded?: number;
    totalFunded?: number;
    totalDelivered?: number;
  };
  onSelect: (campaign: Campaign) => void;
}

export const CampaignCard: React.FC<CampaignCardProps> = ({ campaign, onSelect }) => {
  const reqs = campaign.requirements || [];
  const totalNeeded = campaign.totalNeeded || reqs.reduce((sum, r) => sum + r.quantityNeeded, 0);
  const totalFunded = campaign.totalFunded || reqs.reduce((sum, r) => sum + r.quantityFunded, 0);
  const totalDelivered = campaign.totalDelivered || reqs.reduce((sum, r) => sum + r.quantityDelivered, 0);

  const fundedPercentage = totalNeeded > 0 ? Math.min(100, Math.round((totalFunded / totalNeeded) * 100)) : 0;
  const deliveredPercentage = totalFunded > 0 ? Math.min(100, Math.round((totalDelivered / totalFunded) * 100)) : 0;

  const criticalRequirements = reqs.filter(r => r.urgency === 'Critical');

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition duration-200 flex flex-col">
      {/* Photo Header */}
      <div className="relative h-48 sm:h-52 w-full overflow-hidden bg-slate-100">
        <img
          src={campaign.photoUrl}
          alt={campaign.disasterName}
          className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-black/30" />

        {/* Disaster Type & Province Tag */}
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          <span className="px-2.5 py-1 rounded-full bg-slate-900/85 backdrop-blur-xs text-white text-xs font-bold uppercase tracking-wider border border-white/20">
            {campaign.disasterType}
          </span>
          <span className="px-2.5 py-1 rounded-full bg-emerald-600/90 backdrop-blur-xs text-white text-xs font-semibold">
            {campaign.province}
          </span>
        </div>

        {/* Affected Count */}
        <div className="absolute top-3 right-3">
          <span className="px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-xs text-slate-100 text-xs font-mono font-medium flex items-center gap-1 border border-white/10">
            <Users className="w-3.5 h-3.5 text-amber-400" />
            {campaign.targetBeneficiaries.toLocaleString()} People Affected
          </span>
        </div>

        {/* Location subtitle on banner bottom */}
        <div className="absolute bottom-3 left-3 right-3 text-white">
          <div className="flex items-center gap-1.5 text-xs text-slate-200 font-medium">
            <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span className="truncate">{campaign.location}</span>
          </div>
          <h3 className="text-lg font-bold leading-snug truncate mt-0.5 text-white drop-shadow-xs">
            {campaign.disasterName}
          </h3>
        </div>
      </div>

      {/* Body Content */}
      <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
        {/* NGO Credential Strip */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 text-xs">
          <div className="flex items-center gap-2 text-slate-700 font-semibold truncate">
            <Building2 className="w-4 h-4 text-teal-600 shrink-0" />
            <span className="truncate">{campaign.ngoName}</span>
          </div>
          <span className="inline-flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200/60 shrink-0">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            {campaign.ngoRegNumber || 'VERIFIED'}
          </span>
        </div>

        {/* Description */}
        <p className="text-slate-600 text-xs sm:text-sm line-clamp-2 leading-relaxed">
          {campaign.description}
        </p>

        {/* Live Progress Bars: Need / Funded / Delivered */}
        <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100 space-y-2.5">
          {/* Need vs Funded */}
          <div>
            <div className="flex justify-between text-xs font-semibold mb-1">
              <span className="text-slate-700 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                Items Funded:
              </span>
              <span className="font-mono text-emerald-700 font-bold">
                {totalFunded.toLocaleString()} / {totalNeeded.toLocaleString()} ({fundedPercentage}%)
              </span>
            </div>
            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${fundedPercentage}%` }}
              />
            </div>
          </div>

          {/* Delivered vs Funded */}
          <div>
            <div className="flex justify-between text-xs font-semibold mb-1">
              <span className="text-slate-700 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                Verified Delivered to Ground:
              </span>
              <span className="font-mono text-teal-700 font-bold">
                {totalDelivered.toLocaleString()} ({deliveredPercentage}% of funded)
              </span>
            </div>
            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-500 rounded-full transition-all duration-500"
                style={{ width: `${deliveredPercentage}%` }}
              />
            </div>
          </div>
        </div>

        {/* Requirements Preview */}
        <div>
          <div className="flex items-center justify-between text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            <span>Itemized Requirements ({reqs.length})</span>
            {criticalRequirements.length > 0 && (
              <span className="text-rose-600 font-semibold flex items-center gap-1 normal-case text-xs">
                <AlertOctagon className="w-3.5 h-3.5" />
                {criticalRequirements.length} Critical
              </span>
            )}
          </div>
          <div className="space-y-1.5">
            {reqs.slice(0, 2).map(r => {
              const remaining = Math.max(0, r.quantityNeeded - r.quantityFunded);
              return (
                <div 
                  key={r.id} 
                  className="flex items-center justify-between p-2 rounded-lg bg-slate-50/80 border border-slate-100 text-xs"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className={`w-2 h-2 rounded-full ${
                      r.urgency === 'Critical' ? 'bg-rose-500' : 'bg-amber-500'
                    }`} />
                    <span className="font-medium text-slate-800 truncate">{r.itemType}</span>
                  </div>
                  <span className="font-mono font-bold text-slate-600 shrink-0">
                    {remaining} {r.unit} needed
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={() => onSelect(campaign)}
          className="w-full mt-2 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition duration-150 shadow-xs"
        >
          <Package className="w-4 h-4" />
          <span>Pick Items to Fund & Deliver</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
