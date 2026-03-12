import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Zap, 
  TrendingUp, 
  Shield, 
  Cpu, 
  ArrowUpRight, 
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { Signal } from '../types';

interface ScannerProps {
  signals: Signal[];
  loading: boolean;
  onExecute: (signal: Signal) => void;
}

export default function Scanner({ signals, loading, onExecute }: ScannerProps) {
  const [filter, setFilter] = useState<'all' | 'cex' | 'dex' | 'vip'>('all');

  const filteredSignals = signals.filter(s => {
    if (filter === 'all') return true;
    if (filter === 'vip') return s.vip;
    return s.type === filter;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center border border-emerald-500/20">
            <Activity className="text-emerald-400 w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">HFT SCANNER</h2>
            <div className="flex items-center gap-2 text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
              <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Price Feed
            </div>
          </div>
        </div>

        <div className="flex bg-zinc-900/50 p-1 rounded-xl border border-zinc-800">
          {(['all', 'cex', 'dex', 'vip'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all uppercase tracking-wider ${
                filter === f 
                  ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' 
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading && signals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="w-12 h-12 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
          <p className="text-zinc-500 font-medium animate-pulse">Connecting to global price feed...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatePresence mode="popLayout">
            {filteredSignals.map((sig) => (
              <SignalCard key={sig.id} signal={sig} onExecute={() => onExecute(sig)} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

const SignalCard: React.FC<{ signal: Signal, onExecute: () => void }> = ({ signal, onExecute }) => {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="group relative bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-5 hover:border-emerald-500/30 transition-all duration-300 overflow-hidden"
    >
      {/* Background Glow */}
      <div className="absolute -right-10 -top-10 w-32 h-32 bg-emerald-500/5 blur-3xl rounded-full group-hover:bg-emerald-500/10 transition-all" />
      
      <div className="relative flex flex-col h-full">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-zinc-800/50 rounded-xl flex items-center justify-center text-xl border border-zinc-700/50">
              {signal.sym.split('/')[0].slice(0, 1)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg">{signal.sym}</h3>
                {signal.vip && (
                  <span className="bg-amber-500/10 text-amber-400 text-[10px] font-black px-1.5 py-0.5 rounded border border-amber-500/20">VIP</span>
                )}
                {signal.hot && (
                  <span className="bg-red-500/10 text-red-400 text-[10px] font-black px-1.5 py-0.5 rounded border border-red-500/20">HOT</span>
                )}
              </div>
              <div className="text-xs text-zinc-500 font-medium flex items-center gap-1">
                {signal.bx} <ChevronRight className="w-3 h-3" /> {signal.sx}
              </div>
            </div>
          </div>
          
          <div className="text-right">
            <div className="text-emerald-400 font-black text-xl">+{signal.spread}%</div>
            <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-tighter">Spread</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="bg-zinc-950/50 rounded-xl p-3 border border-zinc-800/50">
            <div className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Buy Price</div>
            <div className="font-mono text-sm">${signal.buyPrice.toLocaleString()}</div>
          </div>
          <div className="bg-zinc-950/50 rounded-xl p-3 border border-zinc-800/50">
            <div className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Sell Price</div>
            <div className="font-mono text-sm">${signal.sellPrice.toLocaleString()}</div>
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <span className="text-[10px] text-zinc-500 uppercase font-bold">AI Score</span>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 w-16 bg-zinc-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500" 
                    style={{ width: `${signal.aiScore}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-emerald-400">{signal.aiScore}%</span>
              </div>
            </div>
            
            <div className="flex flex-col">
              <span className="text-[10px] text-zinc-500 uppercase font-bold">Network</span>
              <span className="text-xs font-bold text-zinc-300">ERC-20</span>
            </div>
          </div>

          <button 
            onClick={onExecute}
            className="bg-emerald-500 hover:bg-emerald-400 text-black font-black px-6 py-2.5 rounded-xl transition-all flex items-center gap-2 group/btn"
          >
            EXECUTE
            <Zap className="w-4 h-4 fill-current group-hover/btn:scale-110 transition-transform" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
