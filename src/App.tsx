import React, { useEffect, useState, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Zap, 
  TrendingUp, 
  Shield, 
  Wallet as WalletIcon, 
  Settings, 
  BarChart3, 
  Globe, 
  Lock,
  Flame,
  Clock,
  ArrowRightLeft
} from 'lucide-react';
import { Signal, User } from './types';
import { STRATEGIES, EXCHANGES } from './constants';
import Scanner from './components/Scanner';
import Wallet from './components/Wallet';

const socket: Socket = io();

const App: React.FC = () => {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [prices, setPrices] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'signals' | 'scanner' | 'exchanges' | 'wallet' | 'settings'>('signals');
  const [user, setUser] = useState<User | null>(null);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    socket.on('signals', (data: Signal[]) => {
      setSignals(data);
    });

    socket.on('prices', (data: any[]) => {
      setPrices(data);
    });

    return () => {
      socket.off('signals');
      socket.off('prices');
    };
  }, []);

  const filteredSignals = useMemo(() => {
    if (filter === 'all') return signals;
    if (filter === 'hot') return signals.filter(s => s.hot);
    return signals.filter(s => s.type === filter);
  }, [signals, filter]);

  return (
    <div className="flex flex-col h-screen bg-bg text-text">
      {/* Header */}
      <header className="glass p-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan to-purple flex items-center justify-center shadow-[0_0_15px_rgba(0,207,255,0.4)]">
            <span className="font-bold text-bg text-xl">N</span>
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">NEXARB <span className="text-cyan italic">PRO</span></h1>
            <p className="text-[10px] text-muted font-mono uppercase tracking-widest">v2.0.0-beta</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-bg3/50 px-3 py-1.5 rounded-full border border-border flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green animate-pulse" />
            <span className="text-xs font-mono font-medium">LIVE</span>
          </div>
          <button className="w-10 h-10 rounded-full bg-bg3 flex items-center justify-center border border-border hover:border-cyan/50 transition-colors">
            <Settings size={18} className="text-text2" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-24">
        {activeTab === 'signals' && (
          <div className="p-4 space-y-6">
            {/* Filter Bar */}
            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
              <button 
                onClick={() => setFilter('all')}
                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${filter === 'all' ? 'bg-cyan text-bg' : 'bg-bg2 border border-border text-text2'}`}
              >
                ALL SIGNALS
              </button>
              <button 
                onClick={() => setFilter('hot')}
                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${filter === 'hot' ? 'bg-red text-white' : 'bg-bg2 border border-border text-text2'}`}
              >
                <Flame size={14} /> HOT
              </button>
              {STRATEGIES.map(s => (
                <button 
                  key={s.id}
                  onClick={() => setFilter(s.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${filter === s.id ? 'bg-purple text-white' : 'bg-bg2 border border-border text-text2'}`}
                >
                  {s.label.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Signal List */}
            <div className="space-y-4">
              <AnimatePresence mode="popLayout">
                {filteredSignals.length > 0 ? (
                  filteredSignals.map((sig) => (
                    <motion.div
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      key={sig.id}
                      className={`card relative overflow-hidden ${sig.hot ? 'border-red/30' : ''}`}
                    >
                      {sig.hot && (
                        <div className="absolute top-0 right-0 bg-red text-white text-[8px] font-bold px-2 py-0.5 rounded-bl-lg flex items-center gap-1">
                          <Flame size={8} /> HIGH PROFIT
                        </div>
                      )}
                      
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-bg3 flex items-center justify-center border border-border">
                            <Zap size={24} className="text-cyan" />
                          </div>
                          <div>
                            <h3 className="font-bold text-lg">{sig.sym}</h3>
                            <div className="flex items-center gap-2 text-[10px] text-muted font-mono">
                              <span className="bg-bg3 px-1.5 py-0.5 rounded">{sig.type.toUpperCase()}</span>
                              <span>•</span>
                              <span className="flex items-center gap-1"><Clock size={10} /> {new Date(sig.ts).toLocaleTimeString()}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-2xl font-black ${sig.net > 0.5 ? 'text-green' : 'text-cyan'}`}>
                            +{sig.net}%
                          </div>
                          <div className="text-[10px] text-muted uppercase font-bold tracking-tighter">Net Profit</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="bg-bg3/50 p-3 rounded-xl border border-border/50">
                          <div className="text-[9px] text-muted uppercase font-bold mb-1">Buy Exchange</div>
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm uppercase">{sig.bx}</span>
                            <span className="font-mono text-xs text-text2">${sig.buyPrice.toFixed(2)}</span>
                          </div>
                        </div>
                        <div className="bg-bg3/50 p-3 rounded-xl border border-border/50">
                          <div className="text-[9px] text-muted uppercase font-bold mb-1">Sell Exchange</div>
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm uppercase">{sig.sx}</span>
                            <span className="font-mono text-xs text-text2">${sig.sellPrice.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex justify-between text-[9px] text-muted mb-1">
                            <span>AI SCORE</span>
                            <span>{sig.aiScore}/100</span>
                          </div>
                          <div className="h-1.5 bg-bg3 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-purple to-cyan transition-all duration-1000" 
                              style={{ width: `${sig.aiScore}%` }}
                            />
                          </div>
                        </div>
                        <button className="btn-primary py-2 px-6 text-sm">
                          EXECUTE
                        </button>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-muted">
                    <BarChart3 size={48} className="mb-4 opacity-20" />
                    <p className="text-sm font-medium">Scanning for opportunities...</p>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

        {activeTab === 'scanner' && <Scanner prices={prices} />}

        {activeTab === 'wallet' && <Wallet />}

        {activeTab === 'exchanges' && (
          <div className="p-4 space-y-4">
            <h2 className="text-xl font-bold mb-4">Exchanges</h2>
            {EXCHANGES.map(ex => (
              <div key={ex.id} className="card flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold" style={{ backgroundColor: `${ex.color}20`, color: ex.color }}>
                    {ex.logo}
                  </div>
                  <div>
                    <h3 className="font-bold">{ex.name}</h3>
                    <p className="text-xs text-muted">Vol: {ex.vol} • Taker: {ex.taker}</p>
                  </div>
                </div>
                <button className="btn-secondary py-1.5 px-4 text-xs">CONNECT</button>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="glass fixed bottom-0 left-0 right-0 p-2 flex justify-around items-center border-t border-border z-50">
        <NavButton 
          active={activeTab === 'signals'} 
          onClick={() => setActiveTab('signals')} 
          icon={<Zap size={20} />} 
          label="Signals" 
        />
        <NavButton 
          active={activeTab === 'scanner'} 
          onClick={() => setActiveTab('scanner')} 
          icon={<BarChart3 size={20} />} 
          label="Scanner" 
        />
        <NavButton 
          active={activeTab === 'exchanges'} 
          onClick={() => setActiveTab('exchanges')} 
          icon={<Globe size={20} />} 
          label="Exchanges" 
        />
        <NavButton 
          active={activeTab === 'wallet'} 
          onClick={() => setActiveTab('wallet')} 
          icon={<WalletIcon size={20} />} 
          label="Wallet" 
        />
      </nav>
    </div>
  );
};

const NavButton: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string }> = ({ active, onClick, icon, label }) => (
  <button 
    onClick={onClick}
    className={`flex flex-col items-center gap-1 p-2 transition-all ${active ? 'text-cyan scale-110' : 'text-muted hover:text-text2'}`}
  >
    {icon}
    <span className="text-[10px] font-bold uppercase tracking-tighter">{label}</span>
    {active && <motion.div layoutId="nav-indicator" className="w-1 h-1 rounded-full bg-cyan mt-0.5" />}
  </button>
);

export default App;
