import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { useCart } from './context/CartContext';
import { Navbar, AppPage } from './components/Navbar';
import { WelcomePage } from './components/WelcomePage';
import { DisastersPage } from './components/DisastersPage';
import { HowItWorksPage } from './components/HowItWorksPage';
import { OrderTrackerPage } from './components/OrderTrackerPage';
import { PortalsPage } from './components/PortalsPage';
import { CampaignDetailModal } from './components/CampaignDetailModal';
import { CartDrawer } from './components/CartDrawer';
import { JazzCashModal } from './components/JazzCashModal';
import { OrderReceiptModal } from './components/OrderReceiptModal';
import { AuthModal } from './components/AuthModal';
import { DonorDashboard } from './components/DonorDashboard';
import { NgoDashboard } from './components/NgoDashboard';
import { SupplierDashboard } from './components/SupplierDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import api from './lib/api';
import { Campaign, Product, Order, UserRole } from './types';
import { ShieldCheck, ArrowRight, ArrowLeft, HeartHandshake } from 'lucide-react';

export function App() {
  const { user, role } = useAuth();
  const { setIsCartOpen } = useCart();

  // Multi-page navigation state
  const [currentPage, setCurrentPage] = useState<AppPage>('welcome');

  // Application Data state
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Modals
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authRole, setAuthRole] = useState<UserRole>('donor');
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);

  // Fetch all live data
  const fetchData = async () => {
    try {
      const [campRes, prodRes, ordRes, statsRes] = await Promise.all([
        api.get('/campaigns'),
        api.get('/products'),
        api.get('/orders'),
        api.get('/stats')
      ]);

      setCampaigns(campRes.data.campaigns || (Array.isArray(campRes.data) ? campRes.data : []));
      setProducts(prodRes.data.products || (Array.isArray(prodRes.data) ? prodRes.data : []));
      setOrders(ordRes.data.orders || (Array.isArray(ordRes.data) ? ordRes.data : []));
      setStats(statsRes.data.stats || statsRes.data || null);
    } catch (err) {
      console.error('Failed to load PakRelief data', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Handle successful checkout
  const handlePaymentSuccess = (createdOrders: Order[], gatewayRef: string) => {
    fetchData();
    if (createdOrders.length > 0) {
      setReceiptOrder(createdOrders[0]);
    }
  };

  // Open Auth with specific config
  const openAuthWithConfig = (roleToSelect: UserRole = 'donor', mode: 'login' | 'register' = 'login') => {
    setAuthRole(roleToSelect);
    setAuthMode(mode);
    setIsAuthOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-emerald-100 selection:text-emerald-900">
      {/* Top Clean Navbar */}
      <Navbar
        currentPage={currentPage}
        onNavigate={(page) => setCurrentPage(page)}
        onOpenAuth={() => openAuthWithConfig('donor', 'login')}
      />

      {/* Main Pages Container */}
      <main className="flex-1">
        {/* PAGE 1: WELCOME & INTRO ("Pak Relief") */}
        {currentPage === 'welcome' && (
          <WelcomePage
            stats={stats}
            featuredCampaign={campaigns[0]}
            onNavigate={(page) => setCurrentPage(page as AppPage)}
            onSelectCampaign={(c) => setSelectedCampaign(c)}
            onOpenAuth={() => openAuthWithConfig('donor', 'login')}
          />
        )}

        {/* PAGE 2: DISASTER RELIEF OPERATIONS */}
        {currentPage === 'disasters' && (
          <DisastersPage
            campaigns={campaigns}
            onSelectCampaign={(c) => setSelectedCampaign(c)}
            onNavigate={(page) => setCurrentPage(page as AppPage)}
          />
        )}

        {/* PAGE 3: HOW IT WORKS STEP-BY-STEP */}
        {currentPage === 'how-it-works' && (
          <HowItWorksPage
            onNavigate={(page) => setCurrentPage(page as AppPage)}
          />
        )}

        {/* PAGE 4: PUBLIC ORDER TRACEABILITY TRACKER */}
        {currentPage === 'tracker' && (
          <OrderTrackerPage
            orders={orders}
            onViewReceipt={(ord) => setReceiptOrder(ord)}
            onNavigate={(page) => setCurrentPage(page as AppPage)}
          />
        )}

        {/* PAGE 5: STAKEHOLDER PORTALS DIRECTORY */}
        {currentPage === 'portals' && (
          <PortalsPage
            onOpenAuth={(r, mode) => openAuthWithConfig(r, mode)}
            onNavigateToDashboard={() => setCurrentPage('dashboard')}
          />
        )}

        {/* PAGE 6: ROLE-SPECIFIC DASHBOARD */}
        {currentPage === 'dashboard' && (
          <div className="py-6">
            {!user ? (
              <div className="max-w-md mx-auto my-12 bg-white p-8 rounded-3xl border border-slate-200 text-center shadow-lg space-y-4">
                <ShieldCheck className="w-12 h-12 text-emerald-600 mx-auto" />
                <h3 className="text-xl font-bold text-slate-900">Sign In to Open Your Portal</h3>
                <p className="text-xs text-slate-500">
                  Please log in with your verified identifier or register a new verified account.
                </p>
                <div className="flex flex-col gap-2 pt-2">
                  <button
                    onClick={() => openAuthWithConfig('donor', 'login')}
                    className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
                  >
                    Sign In with Credentials
                  </button>
                  <button
                    onClick={() => openAuthWithConfig('donor', 'register')}
                    className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Register New Account with Real OTP
                  </button>
                </div>
              </div>
            ) : role === 'donor' ? (
              <DonorDashboard
                orders={orders}
                onViewReceipt={(o) => setReceiptOrder(o)}
                onExploreCampaigns={() => setCurrentPage('disasters')}
              />
            ) : role === 'ngo' ? (
              <NgoDashboard
                campaigns={campaigns}
                orders={orders}
                onRefresh={fetchData}
              />
            ) : role === 'supplier' ? (
              <SupplierDashboard
                products={products}
                orders={orders}
                onRefresh={fetchData}
              />
            ) : role === 'admin' ? (
              <AdminDashboard
                campaigns={campaigns}
                orders={orders}
                onRefresh={fetchData}
              />
            ) : null}
          </div>
        )}
      </main>

      {/* Clean Global Footer */}
      <footer className="bg-slate-950 text-slate-400 py-10 px-4 sm:px-6 lg:px-8 border-t border-slate-900 text-xs">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-white font-black text-base">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <span>PakRelief</span>
            </div>
            <p className="text-slate-500 mt-1 max-w-sm">
              Pakistan's itemized, end-to-end traceable disaster relief e-commerce platform.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-slate-300">
            <button 
              onClick={() => setCurrentPage('welcome')} 
              className="hover:text-white cursor-pointer"
            >
              Welcome
            </button>
            <span>&bull;</span>
            <button 
              onClick={() => setCurrentPage('disasters')} 
              className="hover:text-white cursor-pointer"
            >
              Operations
            </button>
            <span>&bull;</span>
            <button 
              onClick={() => setCurrentPage('how-it-works')} 
              className="hover:text-white cursor-pointer"
            >
              How It Works
            </button>
            <span>&bull;</span>
            <button 
              onClick={() => setCurrentPage('tracker')} 
              className="hover:text-white cursor-pointer"
            >
              Track Orders
            </button>
            <span>&bull;</span>
            <button 
              onClick={() => setCurrentPage('portals')} 
              className="hover:text-white cursor-pointer"
            >
              Portals
            </button>
          </div>
        </div>
      </footer>

      {/* Global Relief Cart Drawer */}
      <CartDrawer
        onProceedToCheckout={() => setIsCheckoutOpen(true)}
        onOpenAuth={() => openAuthWithConfig('donor', 'login')}
      />

      {/* Campaign Detail Modal (Product Picker & Itemized Breakdown) */}
      {selectedCampaign && (
        <CampaignDetailModal
          campaign={selectedCampaign}
          products={products}
          onClose={() => setSelectedCampaign(null)}
        />
      )}

      {/* JazzCash Sandbox Checkout Modal */}
      <JazzCashModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        onSuccess={handlePaymentSuccess}
      />

      {/* Verifiable Order Receipt Modal */}
      <OrderReceiptModal
        order={receiptOrder}
        onClose={() => setReceiptOrder(null)}
      />

      {/* Multi-Role Auth Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        initialMode={authMode}
        initialRole={authRole}
      />
    </div>
  );
}

export default App;
