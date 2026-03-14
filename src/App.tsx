import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { io } from 'socket.io-client';
import {
  Zap,
  Activity,
  Wallet as WalletIcon,
  Cpu,
  Settings,
  ShieldCheck,
  Globe,
  Menu,
  X,
  AlertCircle,
  LogIn,
  ChevronRight
} from 'lucide-react';

import Scanner from './components/Scanner';
import Wallet from './components/Wallet';
import Strategies from './components/Strategies';
import Profile from './components/Profile';
import Admin from './Admin';
import { signInWithGoogle } from './firebase';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Signal } from './types';

const socket = io();

function AppContent() {
  const { user, loading: authLoading, token } = useAuth();
  const [activeTab, setActiveTab] = useState<'signals' | 'wallet' | 'strategies' | 'profile' | 'admin'>('signals');
  const [lang, setLang] = useState<'ru' | 'en'>('ru');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signalFlash, setSignalFlash] = useState(false);

  const handleSignIn = async () => {
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (error: any) {
      setAuthError(error.message || 'Authentication failed. Please try again.');
    }
  };

  useEffect(() => {
    if (!user || !token) return;
    socket.io.opts.query = { userId: user.uid };
    socket.connect();
    socket.on('signals', (newSignals: Signal[]) => {
      setSignals(newSignals);
      setLoading(false);
      setSignalFlash(true);
      setTimeout(() => setSignalFlash(false), 600);
    });
    return () => { socket.off('signals'); };
  }, [user, token]);

  const handleExecuteTrade = async (signal: Signal) => {
    if (!token) return;
    try {
      const res = await fetch('/api/v1/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          symbol: signal.sym, amount: 100, spread: signal.spread,
          buyExchange: signal.bx, sellExchange: signal.sx, type: signal.type, mode: 'demo'
        }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(`✅ Trade executed! Net profit: $${data.net?.toFixed(4)}\nNew balance: $${data.newBalance?.toFixed(2)}`);
      } else {
        alert(`❌ Failed: ${data.error}`);
      }
    } catch {
      alert('Network error');
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
            <Zap className="w-6 h-6 text-cyan-400 animate-pulse" />
          </div>
          <div className="text-xs text-zinc-600 font-bold uppercase tracking-widest">Loading…</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4" style={{
        background: 'radial-gradient(ellipse 60% 50% at 50% -10%, rgba(0,212,255,0.07), transparent), #050505'
      }}>
        <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}
          className="w-full max-w-sm">

          {/* Logo */}
          <div className="text-center mb-10">
            <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-cyan-500/5 border border-cyan-500/20 flex items-center justify-center relative">
              <Zap className="w-8 h-8 text-cyan-400 fill-current" />
              <div className="absolute inset-0 rounded-2xl bg-cyan-500/10 blur-xl" />
            </div>
            <h1 className="text-4xl font-black tracking-tighter text-white mb-1">NEXARB</h1>
            <p className="text-zinc-500 text-sm">Professional HFT Arbitrage Platform</p>
          </div>

          {/* Features */}
          <div className="grid grid-cols-3 gap-3 mb-8">
            {[
              { icon: '⚡', label: 'Real-time\nSignals' },
              { icon: '🔒', label: 'Bank-grade\nSecurity' },
              { icon: '📈', label: 'Multi-exchange\nTrading' },
            ].map((f, i) => (
              <div key={i} className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-3 text-center">
                <div className="text-xl mb-1">{f.icon}</div>
                <div className="text-[10px] text-zinc-500 font-bold leading-tight whitespace-pre-line">{f.label}</div>
              </div>
            ))}
          </div>

          {/* Auth Error */}
          {authError && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3.5 bg-red-500/8 border border-red-500/20 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-400 leading-relaxed">{authError}</p>
            </motion.div>
          )}

          {/* Sign in button */}
          <button onClick={handleSignIn}
            className="w-full flex items-center justify-center gap-3 bg-white text-black font-black py-4 rounded-2xl hover:bg-zinc-100 transition-all text-sm uppercase tracking-wide shadow-lg shadow-white/5">
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <p className="text-center text-[11px] text-zinc-600 mt-5">
            By signing in, you agree to our Terms of Service
          </p>
        </motion.div>
      </div>
    );
  }

  const NAV_ITEMS = [
    { id: 'signals', icon: <Activity className="w-4 h-4" />, label: 'Scanner' },
    { id: 'wallet', icon: <WalletIcon className="w-4 h-4" />, label: 'Portfolio' },
    { id: 'strategies', icon: <Cpu className="w-4 h-4" />, label: 'Strategies' },
    { id: 'profile', icon: <Settings className="w-4 h-4" />, label: 'Profile' },
    { id: 'admin', icon: <ShieldCheck className="w-4 h-4" />, label: 'Admin' },
  ] as const;

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-cyan-500/20">

      {/* Top Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50" style={{
        background: 'rgba(5,4,8,0.85)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.05)'
      }}>
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <button onClick={() => setActiveTab('signals')} className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors">
                <Zap className="w-4 h-4 text-cyan-400 fill-current" />
              </div>
              <span className="text-lg font-black tracking-tighter">NEXARB</span>
            </button>

            {/* Signal indicator */}
            <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors ${signalFlash ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-zinc-900/50 border border-zinc-800'}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{signals.length} live</span>
            </div>
          </div>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map(item => (
              <button key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                  activeTab === item.id
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
                }`}>
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>

          {/* Right */}
          <div className="flex items-center gap-2">
            <button onClick={() => setLang(lang === 'ru' ? 'en' : 'ru')}
              className="hidden sm:flex w-8 h-8 items-center justify-center rounded-xl text-zinc-600 hover:text-zinc-400 transition-colors">
              <Globe className="w-4 h-4" />
            </button>

            {/* User avatar */}
            <button onClick={() => setActiveTab('profile')}
              className="w-8 h-8 rounded-xl overflow-hidden border-2 border-zinc-800 hover:border-cyan-500/40 transition-colors">
              {user.photoURL
                ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                : <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-[10px] font-black text-zinc-400">
                    {(user.displayName || 'U')[0]}
                  </div>
              }
            </button>

            {/* Mobile menu toggle */}
            <button className="md:hidden w-8 h-8 flex items-center justify-center rounded-xl bg-zinc-900 border border-zinc-800"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 md:hidden pt-16"
            style={{ background: 'rgba(5,4,8,0.97)', backdropFilter: 'blur(20px)' }}>
            <div className="p-4 space-y-2">
              {NAV_ITEMS.map((item, i) => (
                <motion.button key={item.id}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => { setActiveTab(item.id as any); setMobileMenuOpen(false); }}
                  className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all ${
                    activeTab === item.id ? 'bg-cyan-500 text-black' : 'bg-zinc-900 text-zinc-400'
                  }`}>
                  <div className="flex items-center gap-3 font-black text-sm uppercase tracking-wide">
                    {item.icon}
                    {item.label}
                  </div>
                  <ChevronRight className="w-4 h-4 opacity-50" />
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="pt-24 pb-12 px-4 md:px-8 max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          <motion.div key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}>
            {activeTab === 'signals' && <Scanner signals={signals} loading={loading} onExecute={handleExecuteTrade} />}
            {activeTab === 'wallet' && <Wallet />}
            {activeTab === 'strategies' && <Strategies />}
            {activeTab === 'profile' && <Profile />}
            {activeTab === 'admin' && <Admin />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom Status Bar */}
      <div className="fixed bottom-0 left-0 right-0 hidden md:flex items-center justify-between px-8 py-2.5 text-[10px] font-bold uppercase tracking-[0.15em]"
        style={{ background: 'rgba(5,4,8,0.9)', backdropFilter: 'blur(12px)', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="flex items-center gap-6 text-zinc-600">
          <span>Signals: <span className="text-cyan-400">{signals.length}</span></span>
          <span>Avg Spread: <span className="text-emerald-400">
            {signals.length > 0 ? (signals.reduce((a, b) => a + b.spread, 0) / signals.length).toFixed(2) : '0.00'}%
          </span></span>
          <span>Vol 24h: <span className="text-white">$14.2B</span></span>
        </div>
        <div className="flex items-center gap-2 text-zinc-600">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          NEXARB HFT ENGINE v2.5
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
