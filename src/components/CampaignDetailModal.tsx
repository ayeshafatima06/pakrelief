import React, { useState } from 'react';
import { 
  X, 
  MapPin, 
  Building2, 
  ShieldCheck, 
  AlertTriangle, 
  Package, 
  CheckCircle2, 
  Clock, 
  Truck, 
  ShoppingBag, 
  Users, 
  ChevronRight,
  Plus,
  Minus
} from 'lucide-react';
import { Campaign, Requirement, Product } from '../types';
import { useCart } from '../context/CartContext';

interface CampaignDetailModalProps {
  campaign: Campaign & { requirements?: Requirement[] };
  products: Product[];
  onClose: () => void;
}

export const CampaignDetailModal: React.FC<CampaignDetailModalProps> = ({ 
  campaign, 
  products, 
  onClose 
}) => {
  const { addItem, items: cartItems } = useCart();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const reqs = campaign.requirements || [];

  const categories = Array.from(new Set(reqs.map(r => r.category)));

  const filteredReqs = selectedCategory === 'all' 
    ? reqs 
    : reqs.filter(r => r.category === selectedCategory);

  const getMatchedProduct = (req: Requirement): Product | undefined => {
    // Match by category and keyword, or first product of same category
    return products.find(p => p.category === req.category) || products[0];
  };

  const handleQtyChange = (reqId: string, delta: number, maxNeeded: number) => {
    setQuantities(prev => {
      const current = prev[reqId] || 1;
      const next = Math.max(1, Math.min(current + delta, maxNeeded || 999));
      return { ...prev, [reqId]: next };
    });
  };

  const handleAddToCart = (req: Requirement, product: Product) => {
    const qty = quantities[req.id] || 1;
    addItem(product, req, campaign, qty);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      <div className="relative bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="relative bg-slate-900 text-white p-5 sm:p-6 shrink-0">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 rounded-full bg-rose-500 text-white text-xs font-bold uppercase tracking-wider">
              {campaign.disasterType}
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-xs font-semibold">
              {campaign.province}
            </span>
            <span className="text-slate-300 text-xs flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-teal-400" />
              {campaign.location}
            </span>
          </div>

          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
            {campaign.disasterName}
          </h2>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300 pt-3 border-t border-slate-800">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-emerald-400" />
              <span>Implementing Partner:</span>
              <span className="font-bold text-white">{campaign.ngoName}</span>
              <span className="bg-emerald-950 text-emerald-400 font-mono px-2 py-0.5 rounded border border-emerald-700/60">
                {campaign.ngoRegNumber || 'VERIFIED'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 font-medium text-amber-300">
              <Users className="w-4 h-4" />
              <span>{campaign.targetBeneficiaries.toLocaleString()} Target Beneficiaries</span>
            </div>
          </div>
        </div>

        {/* Traceability Guarantee Banner */}
        <div className="bg-emerald-50 px-5 py-2.5 border-b border-emerald-100 flex items-center justify-between text-xs text-emerald-900">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
            <span className="font-semibold">Full Traceability Guarantee:</span>
            <span className="hidden sm:inline text-emerald-800">
              Your contribution procures verified products from registered suppliers. The NGO independently inspects & confirms receipt before completion.
            </span>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2 overflow-x-auto">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider shrink-0">Filter:</span>
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
              selectedCategory === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            All Items ({reqs.length})
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                selectedCategory === cat
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Requirements & Products List */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {filteredReqs.length === 0 ? (
            <div className="text-center py-10 text-slate-500">
              No requirements found for this category.
            </div>
          ) : (
            filteredReqs.map(req => {
              const matchedProduct = getMatchedProduct(req);
              const remaining = Math.max(0, req.quantityNeeded - req.quantityFunded);
              const fundedPct = req.quantityNeeded > 0 
                ? Math.min(100, Math.round((req.quantityFunded / req.quantityNeeded) * 100)) 
                : 0;
              const deliveredPct = req.quantityFunded > 0 
                ? Math.min(100, Math.round((req.quantityDelivered / req.quantityFunded) * 100)) 
                : 0;
              const currentQty = quantities[req.id] || 1;
              const isFulfilled = remaining === 0;

              return (
                <div 
                  key={req.id} 
                  className="border border-slate-200 rounded-2xl p-4 sm:p-5 bg-white hover:border-slate-300 transition shadow-xs"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    {/* Requirement Specs */}
                    <div className="flex-1 space-y-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${
                          req.urgency === 'Critical' 
                            ? 'bg-rose-100 text-rose-800 border border-rose-200' 
                            : req.urgency === 'High' 
                            ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                            : 'bg-blue-100 text-blue-800 border border-blue-200'
                        }`}>
                          {req.urgency} Urgency
                        </span>
                        <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          {req.category}
                        </span>
                        <span className="text-xs text-slate-500 flex items-center gap-1 font-medium">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          Target Date: {req.deadline}
                        </span>
                      </div>

                      <h4 className="text-base font-bold text-slate-900">
                        {req.itemType}
                      </h4>

                      {/* Live Progress Bar on item */}
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-2">
                        <div>
                          <div className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                            <span>Funded: <strong>{req.quantityFunded.toLocaleString()}</strong> of {req.quantityNeeded.toLocaleString()} {req.unit}</span>
                            <span className="font-mono font-bold text-emerald-700">{fundedPct}%</span>
                          </div>
                          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full"
                              style={{ width: `${fundedPct}%` }}
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                            <span>Delivered on Ground: <strong>{req.quantityDelivered.toLocaleString()}</strong> {req.unit}</span>
                            <span className="font-mono font-bold text-teal-700">{deliveredPct}%</span>
                          </div>
                          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-teal-500 rounded-full"
                              style={{ width: `${deliveredPct}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Matched Product Specs */}
                      {matchedProduct && (
                        <div className="text-xs text-slate-600 bg-slate-50/70 p-2.5 rounded-lg border border-slate-100">
                          <div className="flex items-center gap-1.5 font-semibold text-slate-800 mb-1">
                            <Truck className="w-3.5 h-3.5 text-blue-600" />
                            <span>Supplied by: {matchedProduct.supplierName}</span>
                          </div>
                          <p className="text-slate-500 line-clamp-2">
                            {matchedProduct.specifications}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Pricing & Add to Cart Controls */}
                    <div className="lg:w-72 bg-slate-50 rounded-xl p-4 border border-slate-200 flex flex-col justify-between shrink-0">
                      <div>
                        <div className="text-xs text-slate-500 font-medium">Unit Price in PKR</div>
                        <div className="text-2xl font-black text-slate-900 font-mono mt-0.5">
                          PKR {(matchedProduct ? (matchedProduct.price ?? matchedProduct.unitPrice) : (req.estimatedUnitCost ?? req.estimatedUnitPrice ?? 0)).toLocaleString()}
                          <span className="text-xs font-normal text-slate-500 ml-1">/ {req.unit}</span>
                        </div>

                        <div className="mt-2 text-xs font-medium text-slate-600 flex items-center justify-between">
                          <span>Needed to reach target:</span>
                          <span className="font-bold text-slate-900 font-mono">
                            {remaining.toLocaleString()} {req.unit}
                          </span>
                        </div>
                      </div>

                      {isFulfilled ? (
                        <div className="mt-4 py-2 text-center bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>100% Target Funded!</span>
                        </div>
                      ) : (
                        <div className="mt-4 space-y-2">
                          {/* Quantity Selector */}
                          <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg p-1">
                            <button
                              onClick={() => handleQtyChange(req.id, -1, remaining)}
                              disabled={currentQty <= 1}
                              className="w-8 h-8 rounded flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="font-mono font-bold text-sm text-slate-900">
                              {currentQty} {req.unit}
                            </span>
                            <button
                              onClick={() => handleQtyChange(req.id, 1, remaining)}
                              disabled={currentQty >= remaining}
                              className="w-8 h-8 rounded flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Subtotal Calculation */}
                          <div className="text-center text-xs font-mono font-semibold text-slate-700">
                            Subtotal: PKR {(((matchedProduct ? (matchedProduct.price ?? matchedProduct.unitPrice) : (req.estimatedUnitCost ?? req.estimatedUnitPrice ?? 0)) || 0) * currentQty).toLocaleString()}
                          </div>

                          {/* Add Button */}
                          <button
                            onClick={() => matchedProduct && handleAddToCart(req, matchedProduct)}
                            className="w-full py-2.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition"
                          >
                            <ShoppingBag className="w-4 h-4" />
                            <span>Add to Relief Cart</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="text-xs text-slate-600 font-medium">
            Ready to checkout? Open cart to pay via <strong>JazzCash Sandbox</strong>.
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
