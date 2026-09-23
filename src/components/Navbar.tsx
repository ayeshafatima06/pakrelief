import React from 'react';
import { 
  ShieldCheck, 
  ShoppingBag, 
  User, 
  LogOut, 
  Building2, 
  Truck, 
  HeartHandshake, 
  LayoutDashboard, 
  Compass, 
  HelpCircle,
  Search
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

export type AppPage = 'welcome' | 'disasters' | 'how-it-works' | 'tracker' | 'portals' | 'dashboard';

interface NavbarProps {
  currentPage: AppPage;
  onNavigate: (page: AppPage) => void;
  onOpenAuth: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentPage, onNavigate, onOpenAuth }) => {
  const { user, role, verificationStatus, logout } = useAuth();
  const { totalItemsCount, setIsCartOpen } = useCart();

  const getRoleBadge = () => {
    if (!user) return null;
    switch (user.role) {
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-purple-100 text-purple-800 border border-purple-200">
            <ShieldCheck className="w-3 h-3" />
            NDMA Admin
          </span>
        );
      case 'ngo':
        return (
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-bold rounded-full ${
            verificationStatus === 'approved' 
              ? 'bg-teal-100 text-teal-800 border border-teal-200' 
              : 'bg-amber-100 text-amber-800 border border-amber-200'
          }`}>
            <Building2 className="w-3 h-3" />
            NGO {verificationStatus === 'pending' && '(Pending Approval)'}
          </span>
        );
      case 'supplier':
        return (
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-bold rounded-full ${
            verificationStatus === 'approved' 
              ? 'bg-blue-100 text-blue-800 border border-blue-200' 
              : 'bg-amber-100 text-amber-800 border border-amber-200'
          }`}>
            <Truck className="w-3 h-3" />
            Supplier {verificationStatus === 'pending' && '(Pending Approval)'}
          </span>
        );
      case 'donor':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
            <HeartHandshake className="w-3 h-3" />
            Verified Donor
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
      {/* Top utility strip */}
      <div className="bg-slate-900 text-slate-300 text-xs px-4 sm:px-8 py-1.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span className="font-semibold text-white">Government-Regulated Disaster Relief Network</span>
          <span className="text-slate-400 hidden sm:inline">&bull; 100% Itemized & Audited Traceability</span>
        </div>

        <div className="text-[11px] text-slate-300 flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Statutory Authority: NDMA Pakistan</span>
        </div>
      </div>

      {/* Main App Navigation Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo / Home Button */}
          <div 
            className="flex items-center gap-3 cursor-pointer" 
            onClick={() => onNavigate('welcome')}
          >
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-800 flex items-center justify-center text-white shadow-md shadow-emerald-700/20">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-black tracking-tight text-slate-900">PakRelief</span>
                <span className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded">
                  Official
                </span>
              </div>
              <p className="text-[10px] text-slate-500 font-medium hidden sm:block">
                Transparent Relief E-Commerce Network
              </p>
            </div>
          </div>

          {/* Clean Navigation Pages */}
          <nav className="hidden lg:flex items-center gap-1">
            <button
              onClick={() => onNavigate('welcome')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                currentPage === 'welcome'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Welcome
            </button>

            <button
              onClick={() => onNavigate('disasters')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                currentPage === 'disasters'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Relief Operations</span>
            </button>

            <button
              onClick={() => onNavigate('how-it-works')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                currentPage === 'how-it-works'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>How It Works</span>
            </button>

            <button
              onClick={() => onNavigate('tracker')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                currentPage === 'tracker'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>Track Orders</span>
            </button>

            <button
              onClick={() => onNavigate('portals')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                currentPage === 'portals'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Portals</span>
            </button>

            {user && (
              <button
                onClick={() => onNavigate('dashboard')}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  currentPage === 'dashboard'
                    ? 'bg-emerald-700 text-white'
                    : 'text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>My Dashboard</span>
              </button>
            )}
          </nav>

          {/* Right Action Tools: Cart + Auth */}
          <div className="flex items-center gap-3">
            {/* Relief Cart */}
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 transition cursor-pointer flex items-center gap-1.5"
              title="View Relief Cart"
            >
              <ShoppingBag className="w-4 h-4 text-emerald-700" />
              <span className="text-xs font-bold hidden sm:inline">Cart</span>
              {totalItemsCount > 0 && (
                <span className="w-5 h-5 bg-emerald-600 text-white text-[11px] font-black rounded-full flex items-center justify-center">
                  {totalItemsCount}
                </span>
              )}
            </button>

            {/* User Session Profile or Sign In */}
            {user ? (
              <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                <div className="hidden md:flex flex-col text-right">
                  <span className="text-xs font-bold text-slate-900 truncate max-w-[130px]">
                    {user.name}
                  </span>
                  <div className="mt-0.5">{getRoleBadge()}</div>
                </div>

                <button
                  onClick={logout}
                  title="Sign Out"
                  className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={onOpenAuth}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 shadow-sm transition cursor-pointer"
              >
                <User className="w-3.5 h-3.5" />
                <span>Sign In / Register</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Page Navigation Links */}
        <div className="flex lg:hidden overflow-x-auto gap-1 pb-2 pt-1 border-t border-slate-100 text-xs">
          <button
            onClick={() => onNavigate('welcome')}
            className={`px-3 py-1.5 rounded-lg shrink-0 font-bold ${
              currentPage === 'welcome' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            Welcome
          </button>
          <button
            onClick={() => onNavigate('disasters')}
            className={`px-3 py-1.5 rounded-lg shrink-0 font-bold ${
              currentPage === 'disasters' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            Operations
          </button>
          <button
            onClick={() => onNavigate('how-it-works')}
            className={`px-3 py-1.5 rounded-lg shrink-0 font-bold ${
              currentPage === 'how-it-works' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            How It Works
          </button>
          <button
            onClick={() => onNavigate('tracker')}
            className={`px-3 py-1.5 rounded-lg shrink-0 font-bold ${
              currentPage === 'tracker' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            Track
          </button>
          <button
            onClick={() => onNavigate('portals')}
            className={`px-3 py-1.5 rounded-lg shrink-0 font-bold ${
              currentPage === 'portals' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            Portals
          </button>
          {user && (
            <button
              onClick={() => onNavigate('dashboard')}
              className={`px-3 py-1.5 rounded-lg shrink-0 font-bold ${
                currentPage === 'dashboard' ? 'bg-emerald-700 text-white' : 'text-emerald-700'
              }`}
            >
              Dashboard
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
