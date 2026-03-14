import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { io } from 'socket.io-client';
import {
  Zap, Activity, Wallet as WalletIcon, Cpu,
  Settings, ShieldCheck, Menu, X, ChevronRight
} from 'lucide-react';

import Scanner from './components/Scanner';
import Wallet from './components/Wallet';
import Strategies from './components/Strategies';
import Profile from './components/Profile';
import Admin from './Admin';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Signal } from './types';

const socket = io();

function AppContent() {
  const { user, loading, token, uid } = useAuth();
  const [activeTab, setActiveTab] = useState<'signals'|'wallet'|'strategies'|'profile'|'admin'>('signals');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [signalsLoading, setSignalsLoading] = useState(true);
  const [signalFlash, setSignalFlash] = useState(false);

  useEffect(() => {
    if (!uid || !token) return;
    socket.io.opts.query = { userId: uid };
    socket.connect();
    socket.on('signals', (newSignals: Signal[]) => {
      setSignals(newSignals);
      setSignalsLoading(false);
      setSignalFlash(true);
      setTimeout(() => setSignalFlash(false), 600);
    });
    fetch('/api/v1/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ user }),
    }).catch(console.error);
    return () => { socket.off('signals'); socket.disconnect(); };
  }, [uid, token]);

  const handleExecuteTrade = async (signal: Signal) => {
    if (!token) return;
    try {
      const res = await fetch('/api/v1/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          symbol: signal.sym, amount: 100, spread: signal.spread,
          buyExchange: signal.bx, sellExchange: signal.sx,
          type: signal.type, mode: 'demo',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Исполнено! Прибыль: $${data.net?.toFixed(4)}\nБаланс: $${data.newBalance?.toFixed(2)}`);
      } else {
        alert(`Ошибка: ${data.error}`);
      }
    } catch { alert('Ошибка сети'); }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#030407] flex items-center justify-center">
      <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
        <Zap className="w-6 h-6 text-cyan-400 animate-pulse fill-current" />
      </div>
    </div>
  );

  if (!user && process.env.NODE_ENV === 'production') return (
    <div className="min-h-screen bg-[#030407] flex items-center justify-center p-6">
      <div className="text-center max-w-xs">
        <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
          <Zap className="w-10 h-10 text-cyan-400 fill-current" />
        </div>
        <h1 className="text-3xl font-black tracking-tighter text-white mb-3">NEXARB</h1>
        <p className="text-zinc-500 text-sm mb-6">Откройте приложение через Telegram</p>
        <a href="https://t.me/your_bot_username"
          className="inline-flex items-center gap-2 bg-cyan-500 text-black font-black px-6 py-3 rounded-2xl text-sm uppercase tracking-wide">
          Открыть в Telegram
        </a>
      </div>
    </div>
  );

  const NAV = [
    { id: 'signals',    icon: <Activity className="w-4 h-4" />,    label: 'Сканер' },
    { id: 'wallet',     icon: <WalletIcon className="w-4 h-4" />,  label: 'Портфель' },
    { id: 'strategies', icon: <Cpu className="w-4 h-4" />,         label: 'Стратегии' },
    { id: 'profile',    icon: <Settings className="w-4 h-4" />,    label: 'Профиль' },
    { id: 'admin',      icon: <ShieldCheck className="w-4 h-4" />, label: 'Админ' },
  ] as const;

  return (
    <div className="min-h-screen bg-[#030407] text-white selection:bg-cyan-500/20">
      <nav className="fixed top-0 left-0 right-0 z-50"
        style={{ background: 'rgba(3,4,7,0.88)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setActiveTab('signals')} className="flex items-center gap-2 group">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors">
                <Zap className="w-3.5 h-3.5 text-cyan-400 fill-current" />
              </div>
              <span className="text-base font-black tracking-tighter">NEXARB</span>
            </button>
            <div className={`hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors ${signalFlash ? 'text-emerald-400' : 'text-zinc-700'}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {signals.length} live
            </div>
          </div>

          <div className="hidden md:flex items-center gap-0.5">
            {NAV.map(item => (
              <button key={item.id} onClick={() => setActiveTab(item.id as any)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${
                  activeTab === item.id ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/60'
                }`}>
                {item.icon}{item.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => setActiveTab('profile')} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              {user?.photo_url
                ? <img src={user.photo_url} alt="" className="w-7 h-7 rounded-lg object-cover border border-zinc-700" />
                : <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[11px] font-black text-zinc-400">
                    {user?.first_name?.[0] || 'U'}
                  </div>
              }
              <span className="hidden sm:block text-xs font-bold text-zinc-400 max-w-[80px] truncate">{user?.first_name}</span>
            </button>
            <button className="md:hidden w-8 h-8 flex items-center justify-center rounded-xl bg-zinc-900 border border-zinc-800"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </nav>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 md:hidden pt-14"
            style={{ background: 'rgba(3,4,7,0.97)', backdropFilter: 'blur(20px)' }}>
            <div className="p-4 space-y-2">
              {NAV.map((item, i) => (
                <motion.button key={item.id}
                  initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                  onClick={() => { setActiveTab(item.id as any); setMobileMenuOpen(false); }}
                  className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all ${
                    activeTab === item.id ? 'bg-cyan-500 text-black' : 'bg-zinc-900/80 text-zinc-400 border border-zinc-800'
                  }`}>
                  <div className="flex items-center gap-3 font-black text-sm uppercase tracking-wide">{item.icon}{item.label}</div>
                  <ChevronRight className="w-4 h-4 opacity-40" />
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="pt-20 pb-12 px-4 md:px-8 max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          <motion.div key={activeTab}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}>
            {activeTab === 'signals'    && <Scanner signals={signals} loading={signalsLoading} onExecute={handleExecuteTrade} />}
            {activeTab === 'wallet'     && <Wallet />}
            {activeTab === 'strategies' && <Strategies />}
            {activeTab === 'profile'    && <Profile />}
            {activeTab === 'admin'      && <Admin />}
          </motion.div>
        </AnimatePresence>
      </main>

      <div className="fixed bottom-0 left-0 right-0 hidden md:flex items-center justify-between px-8 py-2 text-[10px] font-bold uppercase tracking-[0.15em]"
        style={{ background: 'rgba(3,4,7,0.92)', backdropFilter: 'blur(12px)', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="flex items-center gap-6 text-zinc-600">
          <span>Сигналов: <span className="text-cyan-400">{signals.length}</span></span>
          <span>Ср. спред: <span className="text-emerald-400">{signals.length > 0 ? (signals.reduce((a,b) => a+b.spread,0)/signals.length).toFixed(2) : '0.00'}%</span></span>
        </div>
        <div className="flex items-center gap-2 text-zinc-700">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />NEXARB HFT v2.5
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return <AuthProvider><AppContent /></AuthProvider>;
}
