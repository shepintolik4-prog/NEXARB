import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Zap,
  Activity,
  ChevronRight,
  TrendingUp,
  Clock,
  Shield,
  Flame,
  Crown,
  ArrowUpRight,
  BarChart2,
  Cpu,
  Globe,
  Repeat,
  Layers
} from 'lucide-react';
import { Signal } from '../types';

interface ScannerProps {
  signals: Signal[];
  loading: boolean;
  onExecute: (signal: Signal) => void;
}

const TYPE_CONFIG = {
  cex: { label: 'CEX', icon: <Layers className="w-3 h-3" />, color: '#00d4ff', bg: 'rgba(0,212,255,0.08)', border: 'rgba(0,212,255,0.25)' },
  dex: { label: 'DEX', icon: <Globe className="w-3 h-3" />, color: '#00ff88', bg: 'rgba(0,255,136,0.08)', border: 'rgba(0,255,136,0.25)' },
  tri: { label: 'TRI', icon: <Repeat className="w-3 h-3" />, color: '#aa55ff', bg: 'rgba(170,85,255,0.08)', border: 'rgba(170,85,255,0.25)' },
  fund: { label: 'FUND', icon: <BarChart2 className="w-3 h-3" />, color: '#ffaa00', bg: 'rgba(255,170,0,0.08)', border: 'rgba(255,170,0,0.25)' },
};

const FILTERS = ['all', 'cex', 'dex', 'tri'] as const;

export default function Scanner({ signals, loading, onExecute }: ScannerProps) {
  const [filter, setFilter] = useState<'all' | 'cex' | 'dex' | 'tri'>('all');
  const [sortBy, setSortBy] = useState<'spread' | 'ai' | 'net'>('spread');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tickCount, setTickCount] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTickCount(c => c + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const filtered = signals
    .filter(s => filter === 'all' ? true : s.type === filter)
    .sort((a, b) => {
      if (sortBy === 'spread') return b.spread - a.spread;
      if (sortBy === 'ai') return b.aiScore - a.aiScore;
      return b.net - a.net;
    });

  const topSpread = filtered.length > 0 ? Math.max(...filtered.map(s => s.spread)) : 0;
  const avgAI = filtered.length > 0 ? Math.round(filtered.reduce((a, b) => a + b.aiScore, 0) / filtered.length) : 0;

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500/20 to-cyan-500/5 border border-cyan-500/20 flex items-center justify-center">
                <Activity className="w-5 h-5 text-cyan-400" />
              </div>
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#050505] animate-pulse" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight text-white">HFT ARBITRAGE SCANNER</h2>
              <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-bold uppercase tracking-[0.15em]">
                <span className="text-emerald-400">{signals.length}</span> signals live
                <span className="opacity-40">•</span>
                <Clock className="w-3 h-3" />
                <span>updated {tickCount}s ago</span>
              </div>
            </div>
          </div>

          {/* Sort */}
          <div className="hidden md:flex items-center gap-2 text-xs">
            <span className="text-zinc-600 font-bold uppercase tracking-wider">Sort:</span>
            {(['spread', 'ai', 'net'] as const).map(s => (
              <button key={s}
                onClick={() => setSortBy(s)}
                className={`px-3 py-1.5 rounded-lg font-bold uppercase tracking-wide transition-all ${sortBy === s
                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                  : 'text-zinc-600 hover:text-zinc-400'}`}
              >
                {s === 'ai' ? 'AI Score' : s}
              </button>
            ))}
          </div>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="text-[10px] text-zinc-500 font-bold uppercase">Top Spread</div>
              <div className="text-sm font-black text-emerald-400">+{topSpread.toFixed(2)}%</div>
            </div>
          </div>
          <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
              <Cpu className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <div className="text-[10px] text-zinc-500 font-bold uppercase">Avg AI</div>
              <div className="text-sm font-black text-cyan-400">{avgAI}%</div>
            </div>
          </div>
          <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <BarChart2 className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <div className="text-[10px] text-zinc-500 font-bold uppercase">Signals</div>
              <div className="text-sm font-black text-purple-400">{filtered.length}</div>
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {FILTERS.map(f => {
            const cfg = f !== 'all' ? TYPE_CONFIG[f as keyof typeof TYPE_CONFIG] : null;
            const count = f === 'all' ? signals.length : signals.filter(s => s.type === f).length;
            return (
              <button key={f}
                onClick={() => setFilter(f)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all ${filter === f
                  ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/25'
                  : 'bg-zinc-900/50 border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
                }`}
              >
                {cfg?.icon}
                {f === 'all' ? 'All' : cfg?.label}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-black ${filter === f ? 'bg-black/20' : 'bg-zinc-800'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Signals Grid */}
      {loading && signals.length === 0 ? (
        <LoadingSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {filtered.map((sig, idx) => (
              <SignalCard
                key={sig.id}
                signal={sig}
                idx={idx}
                isHovered={hoveredId === sig.id}
                onHover={() => setHoveredId(sig.id)}
                onLeave={() => setHoveredId(null)}
                onExecute={() => onExecute(sig)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

const SignalCard: React.FC<{
  signal: Signal;
  idx: number;
  isHovered: boolean;
  onHover: () => void;
  onLeave: () => void;
  onExecute: () => void;
}> = ({ signal, idx, isHovered, onHover, onLeave, onExecute }) => {
  const cfg = TYPE_CONFIG[signal.type as keyof typeof TYPE_CONFIG] || TYPE_CONFIG.cex;
  const sym = signal.sym.split('/')[0];
  const profitColor = signal.net > 0.5 ? '#00ff88' : signal.net > 0.2 ? '#00d4ff' : '#ffaa00';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.3, delay: idx * 0.04 }}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className="relative group cursor-default"
    >
      <div className={`relative overflow-hidden rounded-2xl border transition-all duration-300 ${isHovered
        ? 'border-cyan-500/40 shadow-xl shadow-cyan-500/10'
        : 'border-zinc-800/60 hover:border-zinc-700/80'
      } bg-zinc-900/30`}>

        {/* Top glow on hover */}
        <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-500 to-transparent transition-opacity duration-300 ${isHovered ? 'opacity-60' : 'opacity-0'}`} />

        {/* Ambient glow */}
        <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full blur-3xl transition-opacity duration-500"
          style={{ background: cfg.color + '10', opacity: isHovered ? 1 : 0 }} />

        <div className="relative p-5">
          {/* Header Row */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              {/* Symbol Icon */}
              <div className="relative w-11 h-11 rounded-xl border flex items-center justify-center text-base font-black"
                style={{ background: cfg.bg, borderColor: cfg.border, color: cfg.color }}>
                {sym.slice(0, 2)}
                {signal.hot && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                    <Flame className="w-2.5 h-2.5 text-white" />
                  </span>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-black text-base text-white">{signal.sym}</span>
                  {signal.vip && (
                    <span className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/25 text-amber-400 text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                      <Crown className="w-2.5 h-2.5" /> VIP
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-bold mt-0.5">
                  <span>{signal.bx}</span>
                  <ChevronRight className="w-2.5 h-2.5" />
                  <span>{signal.sx}</span>
                </div>
              </div>
            </div>

            {/* Type Badge */}
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider"
              style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
              {cfg.icon}
              {cfg.label}
            </div>
          </div>

          {/* Spread Display */}
          <div className="flex items-end justify-between mb-4">
            <div>
              <div className="text-[10px] text-zinc-600 font-bold uppercase tracking-wider mb-0.5">Gross Spread</div>
              <div className="text-3xl font-black tracking-tight" style={{ color: cfg.color }}>
                +{signal.spread.toFixed(3)}%
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-zinc-600 font-bold uppercase tracking-wider mb-0.5">Net Profit</div>
              <div className="text-lg font-black" style={{ color: profitColor }}>
                +{signal.net.toFixed(3)}%
              </div>
            </div>
          </div>

          {/* Price Row */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="bg-zinc-950/60 rounded-xl p-3 border border-zinc-800/40">
              <div className="text-[9px] text-zinc-600 font-bold uppercase tracking-wider mb-1">Buy @ {signal.bx}</div>
              <div className="font-mono text-xs font-bold text-zinc-300">
                ${signal.buyPrice > 0 ? signal.buyPrice.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '—'}
              </div>
            </div>
            <div className="bg-zinc-950/60 rounded-xl p-3 border border-zinc-800/40">
              <div className="text-[9px] text-zinc-600 font-bold uppercase tracking-wider mb-1">Sell @ {signal.sx}</div>
              <div className="font-mono text-xs font-bold text-zinc-300">
                ${signal.sellPrice > 0 ? signal.sellPrice.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '—'}
              </div>
            </div>
          </div>

          {/* AI Score + Execute */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] text-zinc-600 font-bold uppercase tracking-wider">AI Score</span>
                <span className="text-[10px] font-black" style={{ color: signal.aiScore >= 80 ? '#00ff88' : signal.aiScore >= 65 ? '#00d4ff' : '#ffaa00' }}>
                  {signal.aiScore}%
                </span>
              </div>
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${signal.aiScore}%` }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                  style={{ background: signal.aiScore >= 80 ? '#00ff88' : signal.aiScore >= 65 ? '#00d4ff' : '#ffaa00' }}
                />
              </div>
            </div>

            <button onClick={onExecute}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider text-black transition-all active:scale-95"
              style={{ background: `linear-gradient(135deg, ${cfg.color}, ${cfg.color}bb)` }}>
              <Zap className="w-3.5 h-3.5 fill-current" />
              Execute
            </button>
          </div>

          {/* Hot indicator */}
          {signal.hot && (
            <div className="mt-3 pt-3 border-t border-red-500/10 flex items-center gap-1.5 text-[10px] text-red-400 font-bold">
              <Flame className="w-3 h-3" />
              High-velocity opportunity — act fast
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-5 animate-pulse">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-xl bg-zinc-800" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-zinc-800 rounded w-24" />
              <div className="h-3 bg-zinc-800/60 rounded w-32" />
            </div>
          </div>
          <div className="h-8 bg-zinc-800 rounded-lg mb-3 w-28" />
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="h-14 bg-zinc-800/60 rounded-xl" />
            <div className="h-14 bg-zinc-800/60 rounded-xl" />
          </div>
          <div className="h-9 bg-zinc-800 rounded-xl" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">
        <Activity className="w-7 h-7 text-zinc-600" />
      </div>
      <h3 className="text-lg font-bold text-zinc-400 mb-2">No signals found</h3>
      <p className="text-sm text-zinc-600 max-w-xs">The scanner is searching for arbitrage opportunities. New signals appear every few seconds.</p>
    </div>
  );
}
