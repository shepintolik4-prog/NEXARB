import React from 'react';
import { motion } from 'motion/react';
import { 
  Zap, 
  Layers, 
  Repeat, 
  Globe, 
  Shield, 
  Cpu, 
  ArrowRightLeft,
  ChevronRight
} from 'lucide-react';

const STRATEGIES = [
  {
    id: 'cex',
    title: 'CEX Arbitrage',
    subtitle: 'Inter-exchange',
    avgSpread: '1.2% - 4.5%',
    desc: 'Classic arbitrage between centralized exchanges like Binance, OKX, and Bybit. Uses high-speed API connections for millisecond execution.',
    stats: { trades: '1.2M+', success: '99.8%' },
    exchanges: ['Binance', 'OKX', 'Bybit', 'KuCoin', 'Gate.io', 'MEXC']
  },
  {
    id: 'dex',
    title: 'DEX-CEX Hybrid',
    subtitle: 'Cross-platform',
    avgSpread: '3.0% - 12.0%',
    desc: 'Advanced strategy exploiting price gaps between DEXs (Uniswap, PancakeSwap) and CEXs. Requires deep liquidity analysis and gas optimization.',
    stats: { trades: '450k+', success: '94.2%' },
    exchanges: ['Uniswap', 'PancakeSwap', 'Binance', 'Bybit']
  },
  {
    id: 'tri',
    title: 'Triangular',
    subtitle: 'Intra-exchange',
    avgSpread: '0.4% - 1.8%',
    desc: 'Risk-free strategy within a single exchange using three currency pairs (e.g., BTC/USDT -> ETH/BTC -> ETH/USDT). No withdrawal fees.',
    stats: { trades: '5.8M+', success: '100%' },
    exchanges: ['Binance', 'OKX', 'KuCoin']
  }
];

export default function Strategies() {
  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">ARBITRAGE STRATEGIES</h2>
          <p className="text-zinc-500 mt-1">Multi-algorithm HFT execution engine</p>
        </div>
        <div className="flex items-center gap-2 bg-zinc-900/50 border border-zinc-800 px-4 py-2 rounded-xl">
          <div className="flex -space-x-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="w-6 h-6 rounded-full border-2 border-zinc-900 bg-zinc-800 flex items-center justify-center text-[8px] font-bold">
                {['B', 'O', 'K', 'G'][i-1]}
              </div>
            ))}
          </div>
          <span className="text-xs font-bold text-zinc-400">40+ Exchanges</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {STRATEGIES.map((s, idx) => (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="bg-zinc-900/30 border border-zinc-800 rounded-3xl p-8 flex flex-col hover:border-emerald-500/30 transition-all group"
          >
            <div className="flex items-start justify-between mb-6">
              <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20 group-hover:scale-110 transition-transform">
                {s.id === 'cex' ? <Layers className="text-emerald-400" /> : s.id === 'dex' ? <Globe className="text-blue-400" /> : <Repeat className="text-purple-400" />}
              </div>
              <div className="text-right">
                <div className="text-emerald-400 font-black text-2xl">{s.avgSpread}</div>
                <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Avg Spread</div>
              </div>
            </div>

            <h3 className="text-2xl font-bold mb-1">{s.title}</h3>
            <p className="text-sm text-zinc-500 font-medium mb-6">{s.subtitle}</p>
            
            <p className="text-zinc-400 text-sm leading-relaxed mb-8 flex-grow">
              {s.desc}
            </p>

            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-zinc-950/50 p-4 rounded-2xl border border-zinc-800/50">
                <div className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Total Trades</div>
                <div className="text-lg font-bold">{s.stats.trades}</div>
              </div>
              <div className="bg-zinc-950/50 p-4 rounded-2xl border border-zinc-800/50">
                <div className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Success Rate</div>
                <div className="text-lg font-bold text-emerald-400">{s.stats.success}</div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs font-bold text-zinc-500 uppercase tracking-wider">
                <span>Supported Exchanges</span>
                <ChevronRight className="w-3 h-3" />
              </div>
              <div className="flex flex-wrap gap-2">
                {s.exchanges.map(ex => (
                  <span key={ex} className="bg-zinc-800/50 text-zinc-400 text-[10px] font-bold px-2 py-1 rounded-lg border border-zinc-700/30">
                    {ex}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
