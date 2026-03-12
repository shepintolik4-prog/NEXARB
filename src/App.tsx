import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { io } from 'socket.io-client';
import { 
  Zap, 
  TrendingUp, 
  Shield, 
  Cpu, 
  Wallet as WalletIcon, 
  Activity, 
  Menu, 
  X, 
  ChevronRight, 
  Globe, 
  History, 
  LayoutDashboard,
  ShieldCheck,
  Settings
} from 'lucide-react';

// Components
import Scanner from './components/Scanner';
import Wallet from './components/Wallet';
import Strategies from './components/Strategies';
import Profile from './components/Profile';
import Admin from './Admin';

// Types & Constants
import { Signal, User } from './types';
import { LANGS } from './i18n';

const socket = io();

export default function App() {
  const [activeTab, setActiveTab] = useState<'signals' | 'wallet' | 'strategies' | 'profile' | 'admin'>('signals');
  const [lang, setLang] = useState<'ru' | 'en'>('ru');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signals, setSignals] = useState<Signal[]>([]);

  const t = (key: string) => LANGS[lang][key] || key;

  useEffect(() => {
    socket.on('signals', (newSignals: Signal[]) => {
      setSignals(newSignals);
      setLoading(false);
    });

    return () => {
      socket.off('signals');
    };
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'signals': return <Scanner signals={signals} loading={loading} onExecute={(s) => console.log('Executing', s)} />;
      case 'wallet': return <Wallet />;
      case 'strategies': return <Strategies />;
      case 'profile': return <Profile />;
      case 'admin': return <Admin />;
      default: return <Scanner signals={signals} loading={loading} onExecute={(s) => console.log('Executing', s)} />;
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-emerald-500/30">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/50 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setActiveTab('signals')}>
              <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:scale-110 transition-transform">
                <Zap className="text-black w-6 h-6 fill-current" />
              </div>
              <span className="text-2xl font-black tracking-tighter">NEXARB</span>
            </div>

            {/* Desktop Menu */}
            <div className="hidden md:flex items-center gap-1">
              <NavButton active={activeTab === 'signals'} onClick={() => setActiveTab('signals')} icon={<Activity className="w-4 h-4" />} label={t('nav_signals')} />
              <NavButton active={activeTab === 'wallet'} onClick={() => setActiveTab('wallet')} icon={<WalletIcon className="w-4 h-4" />} label={t('cabinet')} />
              <NavButton active={activeTab === 'strategies'} onClick={() => setActiveTab('strategies')} icon={<Cpu className="w-4 h-4" />} label={t('strategy') || 'Strategies'} />
              <NavButton active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} icon={<Settings className="w-4 h-4" />} label={t('profile_title') || 'Profile'} />
              <NavButton active={activeTab === 'admin'} onClick={() => setActiveTab('admin')} icon={<ShieldCheck className="w-4 h-4" />} label="Admin" />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 bg-zinc-900/50 px-3 py-1.5 rounded-full border border-zinc-800">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">System Online</span>
            </div>
            
            <button 
              onClick={() => setLang(lang === 'ru' ? 'en' : 'ru')}
              className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-zinc-900 transition-colors border border-transparent hover:border-zinc-800"
            >
              <Globe className="w-5 h-5 text-zinc-400" />
            </button>

            <button 
              className="md:hidden w-10 h-10 flex items-center justify-center rounded-xl bg-zinc-900"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-0 z-40 bg-black pt-24 px-4 md:hidden"
          >
            <div className="space-y-2">
              <MobileNavButton active={activeTab === 'signals'} onClick={() => { setActiveTab('signals'); setIsMobileMenuOpen(false); }} icon={<Activity />} label={t('nav_signals')} />
              <MobileNavButton active={activeTab === 'wallet'} onClick={() => { setActiveTab('wallet'); setIsMobileMenuOpen(false); }} icon={<WalletIcon />} label={t('cabinet')} />
              <MobileNavButton active={activeTab === 'strategies'} onClick={() => { setActiveTab('strategies'); setIsMobileMenuOpen(false); }} icon={<Cpu />} label={t('strategy') || 'Strategies'} />
              <MobileNavButton active={activeTab === 'profile'} onClick={() => { setActiveTab('profile'); setIsMobileMenuOpen(false); }} icon={<Settings />} label={t('profile_title') || 'Profile'} />
              <MobileNavButton active={activeTab === 'admin'} onClick={() => { setActiveTab('admin'); setIsMobileMenuOpen(false); }} icon={<ShieldCheck />} label="Admin" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="pt-32 pb-12 px-4 md:px-8 max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Footer Stats (Desktop) */}
      <div className="fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-md border-t border-white/5 py-3 hidden md:block">
        <div className="max-w-7xl mx-auto px-8 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <span className="text-zinc-600">Active Signals:</span>
              <span className="text-emerald-400">{signals.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-zinc-600">Avg Spread:</span>
              <span className="text-blue-400">2.45%</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-zinc-600">Global Vol (24h):</span>
              <span className="text-white">$14.2B</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            NEXARB HFT ENGINE V2.5.0
          </div>
        </div>
      </div>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-all font-bold text-sm ${
        active 
          ? 'bg-white/5 text-emerald-400' 
          : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function MobileNavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full p-4 rounded-2xl flex items-center justify-between transition-all ${
        active 
          ? 'bg-emerald-500 text-black' 
          : 'bg-zinc-900 text-zinc-400'
      }`}
    >
      <div className="flex items-center gap-3 font-bold">
        {icon}
        {label}
      </div>
      <ChevronRight className="w-5 h-5" />
    </button>
  );
}
