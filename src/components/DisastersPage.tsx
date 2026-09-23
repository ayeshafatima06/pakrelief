import React, { useState } from 'react';
import { 
  Search, 
  Filter, 
  MapPin, 
  AlertTriangle, 
  Sparkles, 
  Layers, 
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import { Campaign } from '../types';
import { CampaignCard } from './CampaignCard';

interface DisastersPageProps {
  campaigns: Campaign[];
  onSelectCampaign: (campaign: Campaign) => void;
  onNavigate: (page: string) => void;
}

export const DisastersPage: React.FC<DisastersPageProps> = ({
  campaigns,
  onSelectCampaign,
  onNavigate
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProvince, setSelectedProvince] = useState('all');
  const [selectedDisasterType, setSelectedDisasterType] = useState('all');

  const filteredCampaigns = campaigns.filter(c => {
    const matchesSearch = 
      c.disasterName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.ngoName.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = selectedDisasterType === 'all' || c.disasterType === selectedDisasterType;
    const matchesProvince = selectedProvince === 'all' || c.province === selectedProvince;

    return matchesSearch && matchesType && matchesProvince;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700 mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Active Ground Operations</span>
          </div>
          <h1 className="text-3xl font-black text-slate-900">
            Disaster Relief Campaigns
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Choose a disaster zone to fund precise, itemized supplies needed by relief camps.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          <span>{filteredCampaigns.length} Operations Active</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-center">
        {/* Search */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by disaster name, district, or NGO..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Province Filter */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <select
            value={selectedProvince}
            onChange={(e) => setSelectedProvince(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 w-full md:w-auto"
          >
            <option value="all">All Provinces</option>
            <option value="Sindh">Sindh</option>
            <option value="Balochistan">Balochistan</option>
            <option value="Khyber Pakhtunkhwa">Khyber Pakhtunkhwa</option>
            <option value="Punjab">Punjab</option>
          </select>

          {/* Type Filter */}
          <select
            value={selectedDisasterType}
            onChange={(e) => setSelectedDisasterType(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 w-full md:w-auto"
          >
            <option value="all">All Disasters</option>
            <option value="Flood">Monsoon Floods</option>
            <option value="Displaced Persons">Displaced Persons</option>
            <option value="Earthquake">Earthquake</option>
            <option value="Landslide">Landslides</option>
          </select>
        </div>
      </div>

      {/* Grid of Disaster Cards */}
      {filteredCampaigns.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center text-slate-500 text-xs">
          No disasters found matching your criteria. Try resetting the filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCampaigns.map((camp) => (
            <CampaignCard
              key={camp.id}
              campaign={camp}
              onSelect={onSelectCampaign}
            />
          ))}
        </div>
      )}

      {/* Step Banner Prompt at Bottom */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h4 className="font-bold text-sm text-emerald-950">
            Need Help Understanding the Relief Chain?
          </h4>
          <p className="text-xs text-emerald-800 mt-0.5">
            Read our step-by-step breakdown on how each order is audited and confirmed on the ground.
          </p>
        </div>
        <button
          onClick={() => onNavigate('how-it-works')}
          className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 self-start sm:self-auto cursor-pointer"
        >
          <span>View Step-by-Step Guide</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
