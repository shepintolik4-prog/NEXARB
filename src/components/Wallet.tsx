import React from 'react';
import {
  Wallet as WalletIcon,
  ArrowUpRight,
  ArrowDownLeft,
  ShieldCheck,
  TrendingUp,
  Activity
} from 'lucide-react';

interface WalletProps {
  user: {
    id: string;
    balance: number;
    profit: number;
    trades: number;
    vip: boolean;
    connected_exchanges: string[];
  };
}

const Wallet: React.FC<WalletProps> = ({ user }) => {
  // Simulate portfolio breakdown from total balance
  const usdtAmount = user.balance * 0.82;
  const btcAmount = user.balance * 0.12;
  const ethAmount = user.balance * 0.06;

  const assets = [
    {
      sym: 'USDT',
      name: 'Tether USD',
      amount: usdtAmount.toFixed(2),
      val: `$${usdtAmount.toFixed(2)}`,
      pct: 82,
      color: '#26A17B',
    },
    {
      sym: 'BTC',
      name: 'Bitcoin',
      amount: (btcAmount / 65000).toFixed(6),
      val: `$${btcAmount.toFixed(2)}`,
      pct: 12,
      color: '#F7931A',
    },
    {
      sym: 'ETH',
      name: 'Ethereum',
      amount: (ethAmount / 3500).toFixed(4),
      val: `$${ethAmount.toFixed(2)}`,
      pct: 6,
      color: '#627EEA',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">WALLET</h2>
        </div>
      </div>

      {/* Balance Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-500/10 to-purple-500/10 border border-cyan-500/20 p-5 shadow-[0_0_30px_rgba(0,207,255,0.07)]">
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-cyan-500/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-purple-500/5 rounded-full blur-3xl" />

        <div className="relative z-10">
          <div className="flex justify-between items-start mb-6">
            <div>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Total Balance</p>
              <h2 className="text-3xl font-black tracking-tight font-mono text-white">
                ${user.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h2>
              <p className={`text-xs font-mono mt-1 ${user.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {user.profit >= 0 ? '+' : ''}${user.profit.toFixed(2)} today
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-slate-900/60 backdrop-blur-md flex items-center justify-center border border-white/10">
              <WalletIcon size={20} className="text-cyan-400" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="bg-slate-900/40 rounded-xl p-2.5 border border-white/5 text-center">
              <p className="text-[9px] text-slate-500 uppercase font-bold">Trades</p>
              <p className="text-sm font-mono font-black text-slate-200">{user.trades}</p>
            </div>
            <div className="bg-slate-900/40 rounded-xl p-2.5 border border-white/5 text-center">
              <p className="text-[9px] text-slate-500 uppercase font-bold">Exchanges</p>
              <p className="text-sm font-mono font-black text-slate-200">{user.connected_exchanges.length}</p>
            </div>
            <div className="bg-slate-900/40 rounded-xl p-2.5 border border-white/5 text-center">
              <p className="text-[9px] text-slate-500 uppercase font-bold">Status</p>
              <p className={`text-sm font-mono font-black ${user.vip ? 'text-amber-500' : 'text-slate-400'}`}>
                {user.vip ? 'VIP' : 'FREE'}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs transition-all active:scale-95">
              <ArrowUpRight size={14} /> DEPOSIT
            </button>
            <button className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs border border-white/10 transition-all active:scale-95">
              <ArrowDownLeft size={14} /> WITHDRAW
            </button>
          </div>
        </div>
      </div>

      {/* Allocation bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Portfolio Allocation</p>
        <div className="flex rounded-full overflow-hidden h-2 gap-0.5">
          {assets.map(a => (
            <div
              key={a.sym}
              style={{ width: `${a.pct}%`, backgroundColor: a.color }}
              className="h-full rounded-full"
            />
          ))}
        </div>
        <div className="flex gap-4">
          {assets.map(a => (
            <div key={a.sym} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: a.color }} />
              <span className="text-[10px] text-slate-400 font-mono">{a.sym} {a.pct}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Assets List */}
      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 px-1">Assets</p>
        {assets.map(asset => (
          <div key={asset.sym} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between hover:border-slate-700 transition-colors">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs"
                style={{ backgroundColor: `${asset.color}20`, color: asset.color }}
              >
                {asset.sym.slice(0, 1)}
              </div>
              <div>
                <div className="font-bold text-sm">{asset.sym}</div>
                <div className="text-[10px] text-slate-500">{asset.name}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono font-bold text-sm">{asset.amount}</div>
              <div className="text-[10px] text-slate-500">{asset.val}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Security Info */}
      <div className="bg-slate-900/30 border border-slate-800 rounded-2xl p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
          <ShieldCheck size={18} className="text-emerald-400" />
        </div>
        <div>
          <h4 className="text-xs font-bold">Funds are Secure</h4>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            All assets protected by AES-256 encryption and multi-sig cold storage.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Wallet;
