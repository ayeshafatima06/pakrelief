import React, { useState, useEffect } from 'react';
import { 
  X, 
  Mail, 
  Lock, 
  ShieldCheck, 
  Building2, 
  Truck, 
  HeartHandshake, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  ArrowRight, 
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { UserRole } from '../types';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'register';
  initialRole?: UserRole;
}

export const AuthModal: React.FC<AuthModalProps> = ({ 
  isOpen, 
  onClose, 
  initialMode = 'login',
  initialRole = 'donor'
}) => {
  const { loginWithIdentifier, registerUser } = useAuth();

  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [selectedRole, setSelectedRole] = useState<UserRole>(initialRole);

  // Login States
  const [ngoIdType, setNgoIdType] = useState<'SECP' | 'Other'>('SECP');
  const [supplierIdType, setSupplierIdType] = useState<'CUIN' | 'CNIC'>('CUIN');
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Registration States
  const [regStep, setRegStep] = useState<'email' | 'otp' | 'details'>('email');
  const [regEmail, setRegEmail] = useState('');
  const [regOtp, setRegOtp] = useState('');
  const [regName, setRegName] = useState('');
  const [regContact, setRegContact] = useState('');
  const [regPassword, setRegPassword] = useState('');
  
  // Donor Registration
  const [regCnic, setRegCnic] = useState('');

  // NGO Registration
  const [regNgoType, setRegNgoType] = useState<'SECP' | 'Society' | 'Trust' | 'VSWA'>('SECP');
  const [regNgoNumber, setRegNgoNumber] = useState('');
  const [regNgoFocal, setRegNgoFocal] = useState('');
  const [regNgoAddress, setRegNgoAddress] = useState('');

  // Supplier Registration
  const [regSupplierType, setRegSupplierType] = useState<'Business' | 'Sole Proprietor'>('Business');
  const [regSupplierCuinOrCnic, setRegSupplierCuinOrCnic] = useState('');
  const [regSupplierCity, setRegSupplierCity] = useState('');

  // OTP Countdown (Strict 60 seconds)
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(60);
  const [otpExpiresAt, setOtpExpiresAt] = useState<number | null>(null);
  const [otpPreviewUrl, setOtpPreviewUrl] = useState<string | null>(null);
  const [devOtpPreview, setDevOtpPreview] = useState<string | null>(null);
  const [isSimulator, setIsSimulator] = useState<boolean>(false);
  const [smtpProvider, setSmtpProvider] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    let timer: any;
    if (regStep === 'otp' && otpExpiresAt) {
      timer = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((otpExpiresAt - Date.now()) / 1000));
        setOtpSecondsLeft(remaining);
        if (remaining === 0) {
          clearInterval(timer);
        }
      }, 500);
    }
    return () => clearInterval(timer);
  }, [regStep, otpExpiresAt]);

  useEffect(() => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoginIdentifier('');
  }, [selectedRole, ngoIdType, supplierIdType]);

  if (!isOpen) return null;

  // -------------------------
  // LOGIN SUBMIT
  // -------------------------
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!loginIdentifier.trim()) {
      setErrorMsg('Please provide your registered identifier.');
      return;
    }
    if (!loginPassword) {
      setErrorMsg('Please provide your password.');
      return;
    }

    setIsLoading(true);
    const result = await loginWithIdentifier(loginIdentifier.trim(), selectedRole, loginPassword);
    setIsLoading(false);

    if (result.success) {
      onClose();
    } else {
      setErrorMsg(result.error || 'Authentication failed. Please verify your credentials.');
    }
  };

  // -------------------------
  // REGISTRATION STEP 1: SEND REAL OTP
  // -------------------------
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!regEmail || !regEmail.includes('@')) {
      setErrorMsg('Please enter a valid, working email address.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.post('/otp/send', { email: regEmail.trim() });
      if (res.data.success) {
        setOtpExpiresAt(res.data.expiresAt);
        setOtpSecondsLeft(60);
        setOtpPreviewUrl(res.data.previewUrl || null);
        setDevOtpPreview(res.data.devOtpPreview || null);
        setIsSimulator(Boolean(res.data.isSimulator));
        setSmtpProvider(res.data.provider || null);
        setRegStep('otp');
        setSuccessMsg(res.data.message || 'OTP dispatched to your email address.');
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Failed to dispatch verification OTP. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // -------------------------
  // REGISTRATION STEP 2: VERIFY REAL OTP
  // -------------------------
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!regOtp || regOtp.trim().length !== 6) {
      setErrorMsg('Please enter the 6-digit OTP received in your email.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.post('/otp/verify', {
        email: regEmail.trim(),
        code: regOtp.trim()
      });

      if (res.data.success) {
        setSuccessMsg('Email verified successfully! Please enter your account information.');
        setRegStep('details');
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Failed to verify OTP.');
    } finally {
      setIsLoading(false);
    }
  };

  // -------------------------
  // REGISTRATION STEP 3: SUBMIT GENUINE PROFILE
  // -------------------------
  const handleCompleteRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    let identifier = '';
    if (selectedRole === 'donor') {
      identifier = regCnic.trim();
      if (!identifier) {
        setErrorMsg('Please provide your CNIC number.');
        return;
      }
    } else if (selectedRole === 'ngo') {
      identifier = regNgoNumber.trim();
      if (!identifier) {
        setErrorMsg('Please provide your official NGO registration number.');
        return;
      }
    } else if (selectedRole === 'supplier') {
      identifier = regSupplierCuinOrCnic.trim();
      if (!identifier) {
        setErrorMsg('Please provide your CUIN or CNIC number.');
        return;
      }
    }

    if (!regPassword || regPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    setIsLoading(true);
    const result = await registerUser({
      email: regEmail.trim(),
      password: regPassword,
      name: regName.trim(),
      role: selectedRole,
      identifier,
      contact: regContact.trim(),
      focalPerson: regNgoFocal.trim(),
      registrationType: regNgoType,
      businessType: regSupplierType,
      warehouseCity: regSupplierCity.trim(),
      address: regNgoAddress.trim()
    });
    setIsLoading(false);

    if (result.success) {
      onClose();
    } else {
      setErrorMsg(result.error || 'Registration failed.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-200 my-8">
        {/* Header */}
        <div className="bg-slate-900 text-white p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-[11px] font-mono text-emerald-400 font-bold uppercase tracking-wider">
              Statutory Disaster Relief Authentication
            </span>
          </div>

          <h3 className="text-xl font-black tracking-tight">
            {mode === 'login' ? 'Sign In to PakRelief' : 'Register Real Account'}
          </h3>

          <p className="text-xs text-slate-300 mt-0.5">
            Role-based portal access for Donors, NGOs, Suppliers, and NDMA Regulators.
          </p>

          {/* Mode Switcher Tabs */}
          <div className="flex bg-slate-800 p-1 rounded-xl mt-4">
            <button
              onClick={() => { setMode('login'); setErrorMsg(null); }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                mode === 'login' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setMode('register'); setRegStep('email'); setErrorMsg(null); }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                mode === 'register' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
              }`}
            >
              Sign Up with Real OTP
            </button>
          </div>
        </div>

        {/* Role Selector Tabs */}
        <div className="p-4 bg-slate-50 border-b border-slate-200">
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
            Select Your Role:
          </label>
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => setSelectedRole('donor')}
              className={`p-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1 border transition cursor-pointer ${
                selectedRole === 'donor'
                  ? 'bg-white border-emerald-600 text-emerald-800 shadow-xs'
                  : 'bg-slate-100 border-transparent text-slate-600 hover:bg-white'
              }`}
            >
              <HeartHandshake className="w-4 h-4 text-emerald-600" />
              <span>Donor</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedRole('ngo')}
              className={`p-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1 border transition cursor-pointer ${
                selectedRole === 'ngo'
                  ? 'bg-white border-teal-600 text-teal-800 shadow-xs'
                  : 'bg-slate-100 border-transparent text-slate-600 hover:bg-white'
              }`}
            >
              <Building2 className="w-4 h-4 text-teal-600" />
              <span>NGO</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedRole('supplier')}
              className={`p-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1 border transition cursor-pointer ${
                selectedRole === 'supplier'
                  ? 'bg-white border-blue-600 text-blue-800 shadow-xs'
                  : 'bg-slate-100 border-transparent text-slate-600 hover:bg-white'
              }`}
            >
              <Truck className="w-4 h-4 text-blue-600" />
              <span>Supplier</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedRole('admin');
                setMode('login');
              }}
              className={`p-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1 border transition cursor-pointer ${
                selectedRole === 'admin'
                  ? 'bg-white border-purple-600 text-purple-800 shadow-xs'
                  : 'bg-slate-100 border-transparent text-slate-600 hover:bg-white'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-purple-600" />
              <span>Admin</span>
            </button>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-6">
          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* ======================================================== */}
          {/* MODE: LOGIN                                              */}
          {/* ======================================================== */}
          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              {/* Role-Specific Identifier Toggles */}
              {selectedRole === 'donor' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Donor CNIC
                  </label>
                  <input
                    type="text"
                    value={loginIdentifier}
                    onChange={e => setLoginIdentifier(e.target.value)}
                    placeholder="e.g. 35201-1234567-1"
                    required
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Enter the CNIC associated with your donor registration.
                  </span>
                </div>
              )}

              {selectedRole === 'ngo' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      NGO Registration Identifier
                    </label>
                    <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[11px] font-semibold">
                      <button
                        type="button"
                        onClick={() => setNgoIdType('SECP')}
                        className={`px-2 py-0.5 rounded transition cursor-pointer ${ngoIdType === 'SECP' ? 'bg-white shadow-xs text-slate-900 font-bold' : 'text-slate-500'}`}
                      >
                        SECP Number
                      </button>
                      <button
                        type="button"
                        onClick={() => setNgoIdType('Other')}
                        className={`px-2 py-0.5 rounded transition cursor-pointer ${ngoIdType === 'Other' ? 'bg-white shadow-xs text-slate-900 font-bold' : 'text-slate-500'}`}
                      >
                        Other Reg No.
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={loginIdentifier}
                    onChange={e => setLoginIdentifier(e.target.value)}
                    placeholder={ngoIdType === 'SECP' ? 'e.g. SECP-10492' : 'e.g. Trust-4012 or Society-8891'}
                    required
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              )}

              {selectedRole === 'supplier' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Supplier Identifier
                    </label>
                    <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[11px] font-semibold">
                      <button
                        type="button"
                        onClick={() => setSupplierIdType('CUIN')}
                        className={`px-2 py-0.5 rounded transition cursor-pointer ${supplierIdType === 'CUIN' ? 'bg-white shadow-xs text-slate-900 font-bold' : 'text-slate-500'}`}
                      >
                        CUIN (Corporate)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSupplierIdType('CNIC')}
                        className={`px-2 py-0.5 rounded transition cursor-pointer ${supplierIdType === 'CNIC' ? 'bg-white shadow-xs text-slate-900 font-bold' : 'text-slate-500'}`}
                      >
                        CNIC (Sole Prop)
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={loginIdentifier}
                    onChange={e => setLoginIdentifier(e.target.value)}
                    placeholder={supplierIdType === 'CUIN' ? 'e.g. CUIN-004921' : 'e.g. 17301-8492019-3'}
                    required
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {selectedRole === 'admin' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    NDMA Admin Email
                  </label>
                  <input
                    type="email"
                    value={loginIdentifier}
                    onChange={e => setLoginIdentifier(e.target.value)}
                    placeholder="admin@pakrelief.gov.pk"
                    required
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              )}

              {/* Password */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Account Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
                    placeholder="Enter your account password"
                    required
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-md cursor-pointer"
              >
                {isLoading ? 'Verifying with Firebase...' : 'Sign In with Firebase'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* ======================================================== */}
          {/* MODE: REGISTER                                           */}
          {/* ======================================================== */}
          {mode === 'register' && (
            <div>
              {/* Step indicator */}
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 text-xs font-semibold text-slate-500">
                <span className={regStep === 'email' ? 'text-emerald-700 font-bold' : ''}>
                  1. Real Email
                </span>
                <span>&rarr;</span>
                <span className={regStep === 'otp' ? 'text-emerald-700 font-bold' : ''}>
                  2. Verify OTP (60s)
                </span>
                <span>&rarr;</span>
                <span className={regStep === 'details' ? 'text-emerald-700 font-bold' : ''}>
                  3. Details & Password
                </span>
              </div>

              {/* STEP 1: Enter Email to receive 1-min OTP */}
              {regStep === 'email' && (
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Official Verification Email
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <input
                        type="email"
                        value={regEmail}
                        onChange={e => setRegEmail(e.target.value)}
                        placeholder="e.g. yourname@domain.com"
                        required
                        className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <span className="text-[11px] text-slate-500 mt-1 block">
                      A real 6-digit OTP will be dispatched via Nodemailer. It expires strictly in 1 minute.
                    </span>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer shadow-md"
                  >
                    {isLoading ? 'Dispatching Real OTP...' : 'Send Verification OTP'}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}

              {/* STEP 2: Enter OTP with live 60s countdown */}
              {regStep === 'otp' && (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  {/* Countdown Warning Bar */}
                  <div className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                    otpSecondsLeft > 15 
                      ? 'bg-amber-50 border-amber-200 text-amber-900' 
                      : 'bg-rose-50 border-rose-200 text-rose-900 animate-pulse'
                  }`}>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 shrink-0" />
                      <span>Code expires in:</span>
                    </div>
                    <span className="font-mono font-bold text-sm">
                      {otpSecondsLeft}s
                    </span>
                  </div>

                  {/* Delivery Info & Simulator Helper */}
                  {isSimulator ? (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-2 text-xs text-blue-950">
                      <div className="flex items-start gap-2">
                        <Mail className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold block">Test SMTP Mailer Active</span>
                          <span className="text-[11px] text-blue-800">
                            Because live Gmail SMTP credentials are not yet saved in server .env, Nodemailer generated your real email via Ethereal test inbox.
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {otpPreviewUrl && (
                          <a
                            href={otpPreviewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-[11px] transition shadow-xs"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>View Dispatched Email</span>
                          </a>
                        )}

                        {devOtpPreview && (
                          <button
                            type="button"
                            onClick={() => setRegOtp(devOtpPreview)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-blue-300 text-blue-900 hover:bg-blue-100 rounded-lg font-mono font-bold text-[11px] transition cursor-pointer"
                          >
                            <span>Fill Code: {devOtpPreview}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>OTP dispatched to your personal inbox via {smtpProvider || 'Live SMTP'}!</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Enter 6-Digit OTP Code
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      value={regOtp}
                      onChange={e => setRegOtp(e.target.value)}
                      placeholder="Enter code received in email"
                      required
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-center font-mono text-lg tracking-widest focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSendOtp}
                      disabled={otpSecondsLeft > 0 || isLoading}
                      className="px-3 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-40 transition cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Resend OTP</span>
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading || otpSecondsLeft === 0}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer shadow-md"
                    >
                      {isLoading ? 'Verifying...' : 'Verify OTP'}
                    </button>
                  </div>
                </form>
              )}

              {/* STEP 3: Complete Details based on Role */}
              {regStep === 'details' && (
                <form onSubmit={handleCompleteRegistration} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      {selectedRole === 'ngo' 
                        ? 'Organization Legal Name' 
                        : selectedRole === 'supplier' 
                        ? 'Company / Manufacturer Name' 
                        : 'Full Legal Name'}
                    </label>
                    <input
                      type="text"
                      value={regName}
                      onChange={e => setRegName(e.target.value)}
                      placeholder={selectedRole === 'ngo' ? 'e.g. Edhi Foundation' : 'e.g. Fatima Ali'}
                      required
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  {/* Donor CNIC */}
                  {selectedRole === 'donor' && (
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                        National Identity Card (CNIC)
                      </label>
                      <input
                        type="text"
                        value={regCnic}
                        onChange={e => setRegCnic(e.target.value)}
                        placeholder="e.g. 35201-1234567-1"
                        required
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  )}

                  {/* NGO Details */}
                  {selectedRole === 'ngo' && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                            Registration Type
                          </label>
                          <select
                            value={regNgoType}
                            onChange={e => setRegNgoType(e.target.value as any)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold"
                          >
                            <option value="SECP">SECP (Sec 42)</option>
                            <option value="Society">Societies Act</option>
                            <option value="Trust">Trust Act</option>
                            <option value="VSWA">VSWA Act</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                            Registration Number
                          </label>
                          <input
                            type="text"
                            value={regNgoNumber}
                            onChange={e => setRegNgoNumber(e.target.value)}
                            placeholder="e.g. SECP-90214"
                            required
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                          Focal Person Name
                        </label>
                        <input
                          type="text"
                          value={regNgoFocal}
                          onChange={e => setRegNgoFocal(e.target.value)}
                          placeholder="Head of Disaster Response"
                          required
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                        />
                      </div>

                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900">
                        <span className="font-bold block">Statutory Audit Queue:</span>
                        NGOs are audited and approved by the NDMA Admin before published campaigns appear publicly.
                      </div>
                    </>
                  )}

                  {/* Supplier Details */}
                  {selectedRole === 'supplier' && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                            Business Type
                          </label>
                          <select
                            value={regSupplierType}
                            onChange={e => setRegSupplierType(e.target.value as any)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold"
                          >
                            <option value="Business">Registered Corporate</option>
                            <option value="Sole Proprietor">Sole Proprietor</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                            CUIN or CNIC
                          </label>
                          <input
                            type="text"
                            value={regSupplierCuinOrCnic}
                            onChange={e => setRegSupplierCuinOrCnic(e.target.value)}
                            placeholder="e.g. CUIN-007192"
                            required
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                          Primary Warehouse Hub City
                        </label>
                        <input
                          type="text"
                          value={regSupplierCity}
                          onChange={e => setRegSupplierCity(e.target.value)}
                          placeholder="e.g. Sukkur, Karachi, Lahore"
                          required
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                        />
                      </div>
                    </>
                  )}

                  {/* Contact Number */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Official Contact / Phone
                    </label>
                    <input
                      type="text"
                      value={regContact}
                      onChange={e => setRegContact(e.target.value)}
                      placeholder="+92 300 1234567"
                      required
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                    />
                  </div>

                  {/* Password */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Create Password (min 6 characters)
                    </label>
                    <input
                      type="password"
                      value={regPassword}
                      onChange={e => setRegPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      required
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full mt-2 py-3 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-md cursor-pointer"
                  >
                    {isLoading ? 'Creating Firebase Account...' : 'Complete Real Registration'}
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
