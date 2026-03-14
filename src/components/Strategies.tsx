import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Layers,
  Globe,
  Repeat,
  ArrowRightLeft,
  TrendingUp,
  Shield,
  Zap,
  ChevronRight,
  BarChart2,
  Clock,
  CheckCircle2,
  Info
} from 'lucide-react';

const STRATEGIES = [
  {
    id: 'cex',
    title: 'CEX Arbitrage',
    subtitle: 'Inter-exchange price gaps',
    icon: <Layers className="w-6 h-6" />,
    color: '#00d4ff',
    bg: 'rgba(0,212,255,0.08)',
    border: 'rgba(0,212,255,0.2)',
    avgSpread: '1.2% – 4.5%',
    risk: 'Low',
    riskColor: '#00ff88',
    execTime: '< 50ms',
    successRate: '99.8%',
    totalTrades: '1.2M+',
    desc: 'Exploits price discrepancies between centralized exchanges. Low risk due to simultaneous buy/sell execution across Binance, OKX, Bybit and 30+ other venues.',
    exchanges: ['Binance', 'OKX', 'Bybit', 'KuCoin', 'Gate.io', 'MEXC'],
    steps: ['Scan price differences', 'Validate liquidity depth', 'Execute simultaneous orders', 'Collect net profit'],
    vipOnly: false,
  },
  {
    id: 'tri',
    title: 'Triangular',
    subtitle: 'Intra-exchange 3-leg cycles',
    icon: <Repeat className="w-6 h-6" />,
    color: '#aa55ff',
    bg: 'rgba(170,85,255,0.08)',
    border: 'rgba(170,85,255,0.2)',
    avgSpread: '0.4% – 1.8%',
    risk: 'None',
    riskColor: '#00ff88',
    execTime: '< 10ms',
    successRate: '100%',
    totalTrades: '5.8M+',
    desc: 'Risk-free arbitrage within a single exchange using three trading pairs (BTC/USDT → ETH/BTC → ETH/USDT). No withdrawal required, zero counterparty risk.',
    exchanges: ['Binance', 'OKX', 'Bybit', 'KuCoin'],
    steps: ['Find mispriced triangles', 'Calculate optimal path', 'Execute 3 trades atomically', 'Book pure profit'],
    vipOnly: false,
  },
  {
    id: 'dex',
    title: 'DEX-CEX Hybrid',
    subtitle: 'Cross-platform DeFi arbitrage',
    icon: <Globe className="w-6 h-6" />,
    color: '#00ff88',
    bg: 'rgba(0,255,136,0.08)',
    border: 'rgba(0,255,136,0.2)',
    avgSpread: '3.0% – 12%',
    risk: 'Medium',
    riskColor: '#ffaa00',
    execTime: '< 1 block',
    successRate: '94.2%',
    totalTrades: '450K+',
    desc: 'Advanced strategy capturing price gaps between DEXs (Uniswap, Jupiter, PancakeSwap) and CEXs. Requires gas optimization and deep liquidity analysis.',
    exchanges: ['Uniswap', 'Jupiter', 'PancakeSwap', 'Binance'],
    steps: ['Monitor on-chain prices', 'Optimize gas costs', 'Flash-execute cross-platform', 'Bridge & settle profit'],
    vipOnly: true,
  },
  {
    id: 'cross',
    title: 'Cross-Chain',
    subtitle: 'Multi-network bridge arbitrage',
    icon: <ArrowRightLeft className="w-6 h-6" />,
    color: '#ffaa00',
    bg: 'rgba(255,170,0,0.08)',
    border: 'rgba(255,170,0,0.2)',
    avgSpread: '5.0% – 20%',
    risk: 'High',
    riskColor: '#ff3355',
    execTime: '2–10 min',
    successRate: '88.4%',
    totalTrades: '82K+',
    desc: 'Captures persistent price gaps across different blockchain networks. Leverages Stargate, Hop, Wormhole bridges to move assets between Ethereum, Solana, BSC and more.',
    exchanges: ['Ethereum', 'Solana', 'BSC', 'Arbitrum', 'TON'],
    steps: ['Detect cross-chain gaps', 'Calculate bridge costs', 'Transfer & re-position', 'Extract net profit'],
    vipOnly: true,
  },
];

export default function Strategies() {
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const selectedStrat = STRATEGIES.find(s => s.id === selected);

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black tracking-tight">ARBITRAGE STRATEGIES</h2>
          <p className="text-sm text-zinc-500 mt-0.5">4 algorithms · 40+ exchanges · Real-time execution</p>
        </div>
        <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          All systems operational
        </div>
      </div>

      {/* Strategy Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {STRATEGIES.map((s, idx) => (
          <motion.button key={s.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.08 }}
            onClick={() => setSelected(selected === s.id ? null : s.id)}
            onMouseEnter={() => setHovered(s.id)}
            onMouseLeave={() => setHovered(null)}
            className={`relative text-left overflow-hidden rounded-2xl border transition-all duration-300 p-5 ${
              selected === s.id
                ? 'border-opacity-60 shadow-lg'
                : 'border-zinc-800/60 hover:border-zinc-700'
            }`}
            style={selected === s.id ? { borderColor: s.color + '50', background: s.bg } : { background: 'rgba(24,24,27,0.3)' }}>

            {/* Top line on selected/hover */}
            <div className="absolute inset-x-0 top-0 h-px transition-opacity duration-300"
              style={{ background: `linear-gradient(90deg, transparent, ${s.color}, transparent)`, opacity: selected === s.id || hovered === s.id ? 0.5 : 0 }} />

            {/* Ambient glow */}
            <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl pointer-events-none transition-opacity duration-500"
              style={{ background: s.color + '15', opacity: selected === s.id ? 1 : 0 }} />

            <div className="relative">
              {/* Title row */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center border"
                    style={{ background: s.bg, borderColor: s.border, color: s.color }}>
                    {s.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-white text-base">{s.title}</span>
                      {s.vipOnly && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded uppercase bg-amber-500/10 border border-amber-500/20 text-amber-400">VIP</span>
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-500 font-bold mt-0.5">{s.subtitle}</div>
                  </div>
                </div>

                <div className="text-right">
                  <div style={{ color: s.color }} className="text-xl font-black">{s.avgSpread}</div>
                  <div className="text-[10px] text-zinc-600 font-bold uppercase">avg spread</div>
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <MiniStat label="Trades" value={s.totalTrades} color={s.color} />
                <MiniStat label="Success" value={s.successRate} color={s.riskColor} />
                <MiniStat label="Speed" value={s.execTime} color={s.color} />
              </div>

              {/* Risk + arrow */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-600 font-bold uppercase">Risk:</span>
                  <span className="text-[11px] font-black uppercase" style={{ color: s.riskColor }}>{s.risk}</span>
                </div>
                <ChevronRight className={`w-4 h-4 transition-transform duration-300 ${selected === s.id ? 'rotate-90' : 'text-zinc-700'}`}
                  style={{ color: selected === s.id ? s.color : undefined }} />
              </div>
            </div>
          </motion.button>
        ))}
      </div>

      {/* Expanded Strategy Detail */}
      <AnimatePresence>
        {selectedStrat && (
          <motion.div key={selectedStrat.id}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden">
            <div className="rounded-2xl border p-6 space-y-5" style={{ borderColor: selectedStrat.color + '30', background: selectedStrat.bg }}>
              <div>
                <h3 className="font-black text-lg text-white mb-2">{selectedStrat.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{selectedStrat.desc}</p>
              </div>

              {/* Execution Steps */}
              <div>
                <div className="text-[11px] text-zinc-500 font-black uppercase tracking-wider mb-3">Execution Flow</div>
                <div className="flex flex-wrap gap-2">
                  {selectedStrat.steps.map((step, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-950/60 border border-zinc-800/50 text-xs font-bold text-zinc-300">
                        <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black text-black"
                          style={{ background: selectedStrat.color }}>
                          {i + 1}
                        </span>
                        {step}
                      </div>
                      {i < selectedStrat.steps.length - 1 && <ChevronRight className="w-3 h-3 text-zinc-700 shrink-0" />}
                    </div>
                  ))}
                </div>
              </div>

              {/* Exchanges */}
              <div>
                <div className="text-[11px] text-zinc-500 font-black uppercase tracking-wider mb-3">Supported Platforms</div>
                <div className="flex flex-wrap gap-2">
                  {selectedStrat.exchanges.map(ex => (
                    <span key={ex} className="px-3 py-1.5 rounded-xl bg-zinc-900/60 border border-zinc-800/40 text-xs font-bold text-zinc-400">
                      {ex}
                    </span>
                  ))}
                </div>
              </div>

              {selectedStrat.vipOnly && (
                <div className="flex items-center gap-3 p-4 bg-amber-500/5 border border-amber-500/15 rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                    <Shield className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <div className="text-sm font-black text-amber-400">VIP Required</div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">This strategy requires an active VIP subscription</div>
                  </div>
                  <button className="ml-auto shrink-0 px-4 py-2 bg-amber-500 text-black text-xs font-black rounded-xl">Upgrade</button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-zinc-950/50 rounded-xl px-3 py-2 border border-zinc-800/30">
      <div className="text-[9px] text-zinc-600 font-bold uppercase mb-0.5">{label}</div>
      <div className="text-xs font-black" style={{ color }}>{value}</div>
    </div>
  );
}
