import React, { useState } from 'react';
import { 
  Building2, 
  Package, 
  CreditCard, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft, 
  ShieldCheck, 
  FileCheck, 
  Truck, 
  ExternalLink,
  ChevronRight,
  Eye
} from 'lucide-react';

interface HowItWorksPageProps {
  onNavigate: (page: string) => void;
}

export const HowItWorksPage: React.FC<HowItWorksPageProps> = ({ onNavigate }) => {
  const [currentStep, setCurrentStep] = useState<number>(1);

  const steps = [
    {
      id: 1,
      title: "Step 1: NGO Need Assessment & Request",
      tag: "Ground Zero Demand",
      icon: Building2,
      color: "rose",
      description: "Instead of asking for general money, accredited NGOs on the ground (registered with SECP, Societies Act, or Directorate of Social Welfare) publish itemized relief requests with exact specifications.",
      details: [
        "Identifies specific quantities (e.g. 2,500 ration packs, 1,500 tents).",
        "Sets target camp coordinates and arrival deadlines.",
        "NDMA and donors can inspect exactly what items are required before funding."
      ],
      previewTitle: "Live Example from Sindh Flood Zone",
      previewData: {
        item: "15-Day Family Ration Pack",
        category: "Food Rations",
        quantity: "2,500 Packs Needed",
        urgency: "Critical (Deadline: 15 Oct 2026)",
        specs: "20kg Flour, 5kg Rice, 5kg Daal, 3L Cooking Oil, Tea, Iodized Salt, Matchboxes in waterproof triple-ply seal."
      }
    },
    {
      id: 2,
      title: "Step 2: Vetted Supplier Item Catalog",
      tag: "Wholesale Fulfillment",
      icon: Package,
      color: "blue",
      description: "Local verified Pakistani suppliers and manufacturers (verified via CUIN Corporate Registry or CNIC) list standard goods at fixed, transparent PKR rates.",
      details: [
        "Eliminates price gouging during emergency floods and earthquakes.",
        "Suppliers provide warehouse locations and live inventory stock.",
        "Products match exact NGO emergency specifications."
      ],
      previewTitle: "Supplier Listing: PakAgro Emergency Food",
      previewData: {
        item: "Standard 15-Day Family Food Ration Pack",
        price: "PKR 6,500 / Pack (Fixed wholesale rate)",
        stock: "4,500 Units Available in Sukkur Warehouse Hub",
        cuin: "Verified CUIN-004921 (SECP Registered Supplier)"
      }
    },
    {
      id: 3,
      title: "Step 3: Donor Cart & JazzCash Sandbox Checkout",
      tag: "Independent Payment Verification",
      icon: CreditCard,
      color: "emerald",
      description: "Donors select exact relief goods to sponsor (e.g., 2 family ration packs for Dadu, Sindh). Payment is processed via JazzCash Sandbox with independent backend verification.",
      details: [
        "Donor sees 100% itemized breakdown of what their money buys.",
        "JazzCash Sandbox requires 03xx mobile, CNIC, and 4-digit MPIN.",
        "Backend independently validates order amount against gateway before creating the order."
      ],
      previewTitle: "Verifiable Transaction Record",
      previewData: {
        orderId: "PKR-ORD-2026-246891",
        gatewayRef: "JC-SBX-061689-467",
        amount: "PKR 13,000 (2 Family Ration Packs)",
        status: "Payment Confirmed via Independent JazzCash Gateway Audit"
      }
    },
    {
      id: 4,
      title: "Step 4: Dispatch, Camp Arrival & NGO Confirmation",
      tag: "Certified Physical Proof",
      icon: FileCheck,
      color: "teal",
      description: "The supplier dispatches the goods with courier tracking and vehicle registration numbers. When the truck arrives at the camp, an NGO field logistics officer independently inspects the items and signs a digital verification certificate.",
      details: [
        "Tracks courier name, vehicle registration number, and driver contact.",
        "NGO ground logistics officer submits inspection confirmation note.",
        "Requirement funded and delivered counters increment atomically upon sign-off."
      ],
      previewTitle: "Digital Delivery Confirmation",
      previewData: {
        courier: "TCS Overland Disaster Fleet (Truck LES-26-4412)",
        officer: "Munir Hussain (Field Logistics Coordinator, Al-Khidmat Base Camp)",
        status: "NGO Confirmed — 100% Traceability Chain Complete",
        note: "Relief goods inspected, confirmed in sealed packaging, and distributed to 10 displaced families in Tent Camp 4."
      }
    }
  ];

  const activeStep = steps[currentStep - 1];
  const StepIcon = activeStep.icon;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto">
        <span className="text-xs font-bold uppercase tracking-widest text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
          Traceability Blueprint
        </span>
        <h1 className="text-3xl sm:text-4xl font-black text-slate-900 mt-2">
          How PakRelief Works
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 mt-1">
          Follow the 4-step chain from disaster notification to on-ground distribution.
        </p>
      </div>

      {/* Step Navigation Bar */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-2">
        {steps.map((s) => {
          const Icon = s.icon;
          const isActive = currentStep === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setCurrentStep(s.id)}
              className={`flex-1 py-3 px-4 rounded-xl text-left transition flex items-center gap-3 cursor-pointer ${
                isActive
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'hover:bg-slate-100 text-slate-600'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                isActive ? 'bg-emerald-500 text-slate-950' : 'bg-slate-200 text-slate-700'
              }`}>
                0{s.id}
              </div>
              <div className="truncate">
                <span className="text-[10px] uppercase font-bold block opacity-70">Step 0{s.id}</span>
                <span className="text-xs font-bold truncate block">{s.tag}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Active Step Detailed Card */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-10 shadow-sm space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-md shrink-0">
              <StepIcon className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 font-mono">
                Stage 0{activeStep.id} of 04
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                {activeStep.title}
              </h2>
            </div>
          </div>

          <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 self-start md:self-auto">
            {activeStep.tag}
          </span>
        </div>

        {/* Step Explanation & Live Preview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Explanation */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Mechanism & Governance
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              {activeStep.description}
            </p>

            <div className="space-y-2.5 pt-2">
              {activeStep.details.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Live Data Simulation Preview */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
              <span className="text-xs font-bold text-slate-800">{activeStep.previewTitle}</span>
              <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">
                AUDIT VERIFIED
              </span>
            </div>

            <div className="space-y-2 text-xs">
              {Object.entries(activeStep.previewData).map(([key, val]) => (
                <div key={key} className="bg-white p-2.5 rounded-xl border border-slate-200/60 flex justify-between gap-2">
                  <span className="text-slate-400 capitalize font-medium">{key}:</span>
                  <span className="font-bold text-slate-800 text-right font-mono text-[11px]">{val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Step-by-Step Navigation Buttons */}
        <div className="flex items-center justify-between pt-6 border-t border-slate-100">
          <button
            onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
            disabled={currentStep === 1}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
              currentStep === 1
                ? 'opacity-40 cursor-not-allowed text-slate-400 bg-slate-100'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
            }`}
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Previous Step</span>
          </button>

          <div className="flex items-center gap-2">
            {currentStep < 4 ? (
              <button
                onClick={() => setCurrentStep(currentStep + 1)}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition cursor-pointer"
              >
                <span>Next: Step 0{currentStep + 1}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => onNavigate('disasters')}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition cursor-pointer"
              >
                <span>Browse Live Relief Operations</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
