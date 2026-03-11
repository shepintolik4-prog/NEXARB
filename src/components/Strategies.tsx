import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Zap, Globe, RefreshCw, ArrowLeftRight,
  ChevronDown, ChevronUp, Info, CheckCircle2, Lock
} from 'lucide-react';

interface StrategiesProps {
  user: { vip: boolean };
  t: (key: string) => string;
  onUpgrade: () => void;
}

const STRATEGIES = [
  {
    id: 'cex',
    icon: '⚡',
    color: 'cyan',
    borderColor: 'border-cyan-500/30',
    bgColor: 'bg-cyan-500/5',
    glowColor: 'shadow-cyan-500/10',
    labelColor: 'text-cyan-400',
    badgeBg: 'bg-cyan-500/10 border-cyan-500/30',
    title: 'CEX Arbitrage',
    subtitle: 'Cross-exchange · Spot',
    desc: 'Покупка на бирже с низкой ценой, продажа на бирже с высокой. Самый быстрый тип арбитража.',
    exchanges: ['Binance', 'OKX', 'Bybit', 'KuCoin', 'Gate.io', 'MEXC', 'HTX', 'Coinbase', 'Kraken', 'Bitget'],
    risk: 'Низкий',
    riskColor: 'text-emerald-400',
    avgSpread: '0.1–0.8%',
    execTime: '~3–10s',
    vipOnly: false,
  },
  {
    id: 'tri',
    icon: '🔺',
    color: 'purple',
    borderColor: 'border-purple-500/30',
    bgColor: 'bg-purple-500/5',
    glowColor: 'shadow-purple-500/10',
    labelColor: 'text-purple-400',
    badgeBg: 'bg-purple-500/10 border-purple-500/30',
    title: 'Triangular Arbitrage',
    subtitle: 'Внутри одной биржи · 3 пары',
    desc: 'Цикличная конвертация трёх валют внутри одной биржи: BTC → ETH → BNB → BTC. Нет риска вывода.',
    exchanges: ['Binance', 'OKX', 'Bybit', 'KuCoin', 'Gate.io', 'MEXC'],
    risk: 'Низкий',
    riskColor: 'text-emerald-400',
    avgSpread: '0.05–0.3%',
    execTime: '~1–3s',
    vipOnly: true,
  },
  {
    id: 'dex',
    icon: '🌊',
    color: 'emerald',
    borderColor: 'border-emerald-500/30',
    bgColor: 'bg-emerald-500/5',
    glowColor: 'shadow-emerald-500/10',
    labelColor: 'text-emerald-400',
    badgeBg: 'bg-emerald-500/10 border-emerald-500/30',
    title: 'DEX Arbitrage',
    subtitle: 'Decentralized · AMM pools',
    desc: 'Арбитраж между децентрализованными биржами: Uniswap, PancakeSwap, Jupiter. Используем разницу цен пулов.',
    networks: [
      { id: 'eth', name: 'Ethereum', icon: 'Ξ', color: '#627EEA', dexes: ['Uniswap V3', 'Curve', 'Balancer'] },
      { id: 'bsc', name: 'BSC', icon: '◈', color: '#F0B90B', dexes: ['PancakeSwap', 'Biswap', 'ApeSwap'] },
      { id: 'sol', name: 'Solana', icon: '◎', color: '#9945FF', dexes: ['Jupiter', 'Raydium', 'Orca'] },
      { id: 'arb', name: 'Arbitrum', icon: '◆', color: '#2D9CDB', dexes: ['Uniswap V3', 'Camelot', 'GMX'] },
      { id: 'op', name: 'Optimism', icon: '🔴', color: '#FF0420', dexes: ['Velodrome', 'Uniswap V3'] },
      { id: 'ton', name: 'TON', icon: '💎', color: '#0088CC', dexes: ['DeDust', 'STON.fi'] },
      { id: 'tron', name: 'TRON', icon: '⬡', color: '#EF0027', dexes: ['SunSwap', 'JustSwap'] },
    ],
    risk: 'Средний',
    riskColor: 'text-amber-400',
    avgSpread: '0.2–2%',
    execTime: '~15–60s',
    vipOnly: true,
  },
  {
    id: 'cross',
    icon: '🔗',
    color: 'amber',
    borderColor: 'border-amber-500/30',
    bgColor: 'bg-amber-500/5',
    glowColor: 'shadow-amber-500/10',
    labelColor: 'text-amber-400',
    badgeBg: 'bg-amber-500/10 border-amber-500/30',
    title: 'Cross-chain Arbitrage',
    subtitle: 'Multi-network · Bridge',
    desc: 'Использование разницы цен одного токена в разных блокчейн-сетях через мосты. Высокий потенциал профита.',
    routes: [
      { from: 'ETH', to: 'BSC', bridge: 'Stargate', time: '~2 min' },
      { from: 'ETH', to: 'Arbitrum', bridge: 'Hop', time: '~1 min' },
      { from: 'BSC', to: 'SOL', bridge: 'Wormhole', time: '~3 min' },
      { from: 'ETH', to: 'TON', bridge: 'TonBridge', time: '~5 min' },
      { from: 'ETH', to: 'TRON', bridge: 'MultiChain', time: '~4 min' },
      { from: 'SOL', to: 'Arbitrum', bridge: 'Wormhole', time: '~3 min' },
    ],
    risk: 'Высокий',
    riskColor: 'text-red-400',
    avgSpread: '0.5–3%',
    execTime: '1–5 min',
    vipOnly: true,
  },
];

const NETWORKS = [
  { id: 'eth', name: 'Ethereum', icon: 'Ξ', color: '#627EEA', tvl: '$45B' },
  { id: 'bsc', name: 'BSC', icon: '◈', color: '#F0B90B', tvl: '$8B' },
  { id: 'sol', name: 'Solana', icon: '◎', color: '#9945FF', tvl: '$6B' },
  { id: 'arb', name: 'Arbitrum', icon: '◆', color: '#2D9CDB', tvl: '$3B' },
  { id: 'op', name: 'Optimism', icon: '🔴', color: '#FF0420', tvl: '$1.2B' },
  { id: 'ton', name: 'TON', icon: '💎', color: '#0088CC', tvl: '$800M' },
  { id: 'tron', name: 'TRON', icon: '⬡', color: '#EF0027', tvl: '$9B' },
];

export default function Strategies({ user, t, onUpgrade }: StrategiesProps) {
  const [expanded, setExpanded] = useState<string | null>('cex');

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">СТРАТЕГИИ АРБИТРАЖА</h2>
        </div>
        <span className="text-[10px] font-mono text-slate-500">{STRATEGIES.length} active</span>
      </div>

      {/* Network badges */}
      <div className="space-y-2">
        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 px-0.5">Поддерживаемые сети</p>
        <div className="flex flex-wrap gap-1.5">
          {NETWORKS.map(net => (
            <div key={net.id}
              className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-700/60 bg-slate-800/40"
            >
              <span className="text-sm" style={{ color: net.color }}>{net.icon}</span>
              <span className="text-[9px] font-bold text-slate-400">{net.name}</span>
              <span className="text-[8px] text-slate-600 font-mono">{net.tvl}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Strategy cards */}
      {STRATEGIES.map((s) => {
        const isOpen = expanded === s.id;
        const locked = s.vipOnly && !user.vip;

        return (
          <motion.div
            key={s.id}
            layout
            className={`rounded-2xl border overflow-hidden transition-all ${
              locked ? 'opacity-75' : ''
            } ${s.borderColor} ${isOpen ? `shadow-lg ${s.glowColor}` : 'border-slate-800'}`}
          >
            {/* Card header */}
            <button
              onClick={() => setExpanded(isOpen ? null : s.id)}
              className={`w-full p-4 flex items-center justify-between transition-colors ${
                isOpen ? s.bgColor : 'bg-slate-900 hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl border ${
                  isOpen ? `${s.borderColor} ${s.bgColor}` : 'border-slate-700 bg-slate-800'
                }`}>
                  {s.icon}
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm">{s.title}</h3>
                    {s.vipOnly && (
                      <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border ${s.badgeBg} ${s.labelColor}`}>
                        VIP
                      </span>
                    )}
                    {locked && <Lock size={10} className="text-slate-600" />}
                  </div>
                  <p className="text-[10px] text-slate-500 font-mono">{s.subtitle}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <p className={`text-sm font-black font-mono ${s.labelColor}`}>{s.avgSpread}</p>
                  <p className="text-[9px] text-slate-600">avg spread</p>
                </div>
                {isOpen ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
              </div>
            </button>

            {/* Expanded content */}
            <AnimatePresence>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 space-y-4 bg-slate-900/80 border-t border-slate-800/60">

                    {/* Description */}
                    <p className="text-xs text-slate-400 leading-relaxed pt-3">{s.desc}</p>

                    {/* Stats row */}
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Спред', value: s.avgSpread, color: s.labelColor },
                        { label: 'Время', value: s.execTime, color: 'text-slate-300' },
                        { label: 'Риск', value: s.risk, color: s.riskColor },
                      ].map((stat, i) => (
                        <div key={i} className="bg-slate-800/50 rounded-xl p-2.5 border border-slate-700/40 text-center">
                          <p className="text-[8px] font-bold text-slate-600 uppercase">{stat.label}</p>
                          <p className={`text-xs font-black font-mono mt-0.5 ${stat.color}`}>{stat.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* CEX: exchanges list */}
                    {s.id === 'cex' && s.exchanges && (
                      <div className="space-y-1.5">
                        <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">Биржи</p>
                        <div className="flex flex-wrap gap-1.5">
                          {s.exchanges.map(ex => (
                            <span key={ex} className="text-[10px] font-bold bg-slate-800 border border-slate-700 px-2 py-1 rounded-lg text-slate-300">
                              {ex}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Triangular: exchanges */}
                    {s.id === 'tri' && s.exchanges && (
                      <div className="space-y-1.5">
                        <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">Поддерживаемые биржи</p>
                        <div className="flex flex-wrap gap-1.5">
                          {s.exchanges.map(ex => (
                            <span key={ex} className="text-[10px] font-bold bg-slate-800 border border-slate-700 px-2 py-1 rounded-lg text-slate-300">
                              {ex}
                            </span>
                          ))}
                        </div>
                        <div className="mt-2 bg-purple-500/5 border border-purple-500/20 rounded-xl p-3">
                          <p className="text-[10px] text-purple-300 leading-relaxed">
                            Пример: <span className="font-mono font-bold">BTC/USDT → ETH/BTC → ETH/USDT</span> — 3 ордера, 0 переводов между биржами
                          </p>
                        </div>
                      </div>
                    )}

                    {/* DEX: networks & dexes */}
                    {s.id === 'dex' && s.networks && (
                      <div className="space-y-2">
                        <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">Сети и DEX-протоколы</p>
                        {s.networks.map(net => (
                          <div key={net.id} className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/40">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-base font-bold" style={{ color: net.color }}>{net.icon}</span>
                              <span className="text-xs font-bold text-slate-200">{net.name}</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {net.dexes.map(dex => (
                                <span key={dex} className="text-[9px] font-bold px-2 py-0.5 rounded-md border border-slate-700 bg-slate-800 text-slate-400">
                                  {dex}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Cross-chain: routes */}
                    {s.id === 'cross' && s.routes && (
                      <div className="space-y-2">
                        <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">Маршруты</p>
                        {s.routes.map((route, i) => (
                          <div key={i} className="flex items-center justify-between bg-slate-800/40 rounded-xl px-3 py-2.5 border border-slate-700/40">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-slate-200 font-mono">{route.from}</span>
                              <ArrowLeftRight size={10} className="text-amber-400" />
                              <span className="text-xs font-black text-slate-200 font-mono">{route.to}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] text-slate-500 border border-slate-700 bg-slate-800 px-2 py-0.5 rounded-md font-bold">
                                {route.bridge}
                              </span>
                              <span className="text-[9px] font-mono text-amber-400">{route.time}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Locked CTA */}
                    {locked && (
                      <button
                        onClick={onUpgrade}
                        className="w-full py-3 rounded-xl font-black text-sm text-slate-900 transition-all active:scale-[0.98]"
                        style={{ background: 'linear-gradient(90deg,#f5a623,#e8890c)' }}
                      >
                        👑 Разблокировать в VIP
                      </button>
                    )}

                    {/* Active badge */}
                    {!locked && (
                      <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${s.badgeBg}`}>
                        <CheckCircle2 size={12} className={s.labelColor} />
                        <span className={`text-[10px] font-bold ${s.labelColor}`}>Стратегия активна · сигналы генерируются</span>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}
