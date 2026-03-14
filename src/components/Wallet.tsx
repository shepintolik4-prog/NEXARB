import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Wallet as WalletIcon,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownLeft,
  Shield,
  DollarSign,
  Clock,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  RefreshCw,
  BarChart3,
  Layers,
  Globe
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface TradeItem {
  id: string;
  symbol: string;
  type: string;
  amount: number;
  net: number;
  totalFees: number;
  status: string;
  created_at: number;
  buyExchange: string;
  sellExchange: string;
}

export default function Wallet() {
  const { token } = useAuth();
  const [userData, setUserData] = useState<any>(null);
  const [trades, setTrades] = useState<TradeItem[]>([]);
  const [tab, setTab] = useState<'overview' | 'history'>('overview');
  const [refreshing, setRefreshing] = useState(false);
  const [depositModal, setDepositModal] = useState(false);

  const fetchData = async () => {
    if (!token) return;
    setRefreshing(true);
    try {
      const res = await fetch('/api/v1/account', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setUserData(data);
      if (data.trade_history) setTrades(data.trade_history.slice().reverse().slice(0, 20));
    } catch (e) {
      console.error('Wallet fetch error', e);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, [token]);

  if (!userData) return (
    <div className="flex justify-center items-center py-32">
      <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const isDemo = userData.trade_mode !== 'real';
  const balance = isDemo ? userData.demo_balance : userData.balance;
  const profit = isDemo ? userData.demo_profit : userData.profit;
  const tradeCount = isDemo ? userData.demo_trades : userData.trades;
  const profitPct = balance > 0 ? ((profit / (balance - profit)) * 100) : 0;

  return (
    <div className="space-y-6 pb-24">
      {/* Mode toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black tracking-tight">PORTFOLIO</h2>
          <p className="text-zinc-500 text-sm">Your trading performance & assets</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} disabled={refreshing}
            className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-colors">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <div className="flex bg-zinc-900 border border-zinc-800 p-0.5 rounded-xl gap-0.5">
            {['demo', 'real'].map(m => (
              <button key={m}
                onClick={() => { /* mode switch via API would go here */ }}
                className={`px-4 py-1.5 rounded-[10px] text-xs font-black uppercase tracking-wider transition-all ${
                  (isDemo ? 'demo' : 'real') === m ? 'bg-cyan-500 text-black' : 'text-zinc-500 hover:text-zinc-300'
                }`}>
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Balance Hero Card */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 border border-zinc-800/80 p-8">

        {/* Decorative orbs */}
        <div className="absolute -top-16 -right-16 w-56 h-56 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-8 -left-8 w-40 h-40 bg-purple-500/8 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />

        <div className="relative">
          {/* Mode badge */}
          <div className="flex items-center justify-between mb-6">
            <span className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg ${
              isDemo ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isDemo ? 'bg-amber-400' : 'bg-emerald-400'} animate-pulse`} />
              {isDemo ? 'Demo Account' : 'Live Trading'}
            </span>
            <div className="text-right">
              <div className="text-[10px] text-zinc-600 font-bold uppercase">P&L</div>
              <div className={`text-sm font-black ${profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {profit >= 0 ? '+' : ''}${profit.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Balance */}
          <div className="mb-6">
            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.2em] mb-2">
              Total Balance ({isDemo ? 'Demo' : 'Real'})
            </div>
            <div className="flex items-end gap-4">
              <span className="text-5xl md:text-6xl font-black tracking-tight text-white">
                ${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <div className={`flex items-center gap-1 mb-2 text-sm font-black ${profitPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {profitPct >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {profitPct >= 0 ? '+' : ''}{profitPct.toFixed(2)}%
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4 pt-5 border-t border-zinc-800/50">
            <StatMini label="Trades" value={tradeCount.toString()} color="#00d4ff" />
            <StatMini label="Total Profit" value={`$${profit.toFixed(2)}`} color="#00ff88" />
            <StatMini label="Win Rate" value="94.2%" color="#aa55ff" />
          </div>
        </div>

        {/* Action buttons */}
        <div className="relative flex gap-3 mt-6">
          <button onClick={() => setDepositModal(true)}
            className="flex-1 flex items-center justify-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-black font-black py-3.5 rounded-2xl transition-all text-sm uppercase tracking-wide">
            <ArrowUpRight className="w-4 h-4" />
            Deposit
          </button>
          <button className="flex-1 flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white font-black py-3.5 rounded-2xl transition-all text-sm uppercase tracking-wide border border-zinc-700">
            <ArrowDownLeft className="w-4 h-4" />
            Withdraw
          </button>
        </div>
      </motion.div>

      {/* Tab switcher */}
      <div className="flex gap-2">
        {(['overview', 'history'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              tab === t ? 'bg-zinc-800 text-white border border-zinc-700' : 'text-zinc-600 hover:text-zinc-400'
            }`}>
            {t}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === 'overview' ? (
          <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="space-y-4">
            {/* Portfolio Distribution */}
            <div className="bg-zinc-900/30 border border-zinc-800/60 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-800/50">
                <h3 className="text-sm font-black uppercase tracking-wider text-zinc-300">Asset Allocation</h3>
              </div>
              <div className="divide-y divide-zinc-800/30">
                <AssetRow sym="USDT" name="Tether" icon="₮" pct={65} value={`$${(balance * 0.65).toFixed(2)}`} color="#26a17b" />
                <AssetRow sym="BTC" name="Bitcoin" icon="₿" pct={20} value={`$${(balance * 0.20).toFixed(2)}`} color="#f7931a" />
                <AssetRow sym="ETH" name="Ethereum" icon="Ξ" pct={15} value={`$${(balance * 0.15).toFixed(2)}`} color="#627eea" />
              </div>
            </div>

            {/* VIP Status */}
            <div className={`relative overflow-hidden rounded-2xl border p-5 ${userData.vip
              ? 'bg-amber-500/5 border-amber-500/20'
              : 'bg-zinc-900/30 border-zinc-800/60'}`}>
              {userData.vip && <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${userData.vip ? 'bg-amber-500/15 border border-amber-500/25' : 'bg-zinc-800 border border-zinc-700'}`}>
                    <Shield className={`w-5 h-5 ${userData.vip ? 'text-amber-400' : 'text-zinc-500'}`} />
                  </div>
                  <div>
                    <div className="font-black text-sm">{userData.vip ? '👑 VIP Active' : 'Free Plan'}</div>
                    <div className="text-[11px] text-zinc-500">
                      {userData.vip
                        ? `Expires: ${new Date(userData.vip_expires * 1000).toLocaleDateString()}`
                        : 'Upgrade for unlimited signals'}
                    </div>
                  </div>
                </div>
                {!userData.vip && (
                  <button className="bg-amber-500 text-black text-xs font-black px-4 py-2 rounded-xl uppercase tracking-wide">
                    Upgrade
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {trades.length === 0 ? (
              <div className="text-center py-16 text-zinc-600">
                <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-bold">No trades yet</p>
                <p className="text-sm mt-1">Execute your first arbitrage trade</p>
              </div>
            ) : (
              <div className="bg-zinc-900/30 border border-zinc-800/60 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-zinc-800/50">
                  <h3 className="text-sm font-black uppercase tracking-wider text-zinc-300">Trade History</h3>
                </div>
                <div className="divide-y divide-zinc-800/30">
                  {trades.map(t => (
                    <TradeRow key={t.id} trade={t} />
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Deposit Modal */}
      <AnimatePresence>
        {depositModal && (
          <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setDepositModal(false)}>
            <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-4">
              <div className="h-1 w-12 bg-zinc-700 rounded-full mx-auto mb-2" />
              <h3 className="text-xl font-black">Deposit Funds</h3>
              <p className="text-sm text-zinc-400">Choose your deposit method</p>
              <div className="grid grid-cols-2 gap-3">
                {['TON', 'USDT', 'Stars', 'Card'].map(m => (
                  <button key={m} className="p-4 rounded-xl bg-zinc-800 border border-zinc-700 hover:border-cyan-500/40 transition-all text-sm font-bold">{m}</button>
                ))}
              </div>
              <button onClick={() => setDepositModal(false)} className="w-full py-3 rounded-xl text-zinc-500 font-bold text-sm">Cancel</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatMini({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div className="text-[10px] text-zinc-600 font-bold uppercase tracking-wider mb-0.5">{label}</div>
      <div className="text-sm font-black" style={{ color }}>{value}</div>
    </div>
  );
}

function AssetRow({ sym, name, icon, pct, value, color }: { sym: string; name: string; icon: string; pct: number; value: string; color: string }) {
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base font-black border border-zinc-700/50"
        style={{ background: color + '15', color }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-bold text-sm text-white">{sym}</span>
          <span className="font-bold text-sm text-white">{value}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
          </div>
          <span className="text-[10px] text-zinc-500 font-bold">{pct}%</span>
        </div>
      </div>
    </div>
  );
}

function TradeRow({ trade }: { trade: TradeItem }) {
  const typeColor = trade.type === 'cex' ? '#00d4ff' : trade.type === 'dex' ? '#00ff88' : '#aa55ff';
  const isProfit = trade.net > 0;
  return (
    <div className="flex items-center gap-3 px-5 py-4 hover:bg-zinc-800/20 transition-colors">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-black border"
        style={{ background: typeColor + '10', borderColor: typeColor + '30', color: typeColor }}>
        {trade.type.toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="font-bold text-sm text-white truncate">{trade.symbol}</span>
          <span className={`font-black text-sm ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
            {isProfit ? '+' : ''}${trade.net.toFixed(4)}
          </span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-[10px] text-zinc-600">${trade.amount.toFixed(0)} · {trade.buyExchange} → {trade.sellExchange}</span>
          <span className="text-[10px] text-zinc-600">{new Date(trade.created_at * 1000).toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  );
}
