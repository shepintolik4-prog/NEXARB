import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Wallet as WalletIcon, 
  TrendingUp, 
  ArrowUpRight, 
  ArrowDownLeft, 
  History, 
  ShieldCheck,
  DollarSign,
  PieChart,
  ChevronRight
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Wallet() {
  const { token } = useAuth();
  const [userData, setUserData] = useState<any>(null);

  useEffect(() => {
    if (token) {
      fetch('/api/v1/account', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => setUserData(data))
      .catch(err => console.error('Error fetching account:', err));
    }
  }, [token]);

  if (!userData) return <div className="flex justify-center p-20"><div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>;

  const totalBalance = userData.balance + userData.demo_balance;

  return (
    <div className="space-y-8 pb-20">
      {/* Balance Hero */}
      <div className="relative bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 p-8 md:p-12 rounded-[2.5rem] overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 blur-[100px] rounded-full -mr-48 -mt-48" />
        
        <div className="relative flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-zinc-500 font-bold uppercase tracking-[0.2em] text-xs">
              <WalletIcon className="w-4 h-4" />
              Total Portfolio Balance
            </div>
            <div className="flex items-baseline gap-4">
              <h2 className="text-5xl md:text-7xl font-black tracking-tighter">${totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h2>
              <div className="flex items-center gap-1 text-emerald-400 font-bold text-lg">
                <TrendingUp className="w-5 h-5" />
                +{(userData.profit / (userData.balance || 1) * 100).toFixed(1)}%
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-sm font-bold text-zinc-400">Real: ${userData.balance.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-sm font-bold text-zinc-400">Demo: ${userData.demo_balance.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <button className="flex-1 md:flex-none bg-emerald-500 hover:bg-emerald-400 text-black font-black px-8 py-4 rounded-2xl transition-all flex items-center justify-center gap-2">
              <ArrowUpRight className="w-5 h-5" />
              Deposit
            </button>
            <button className="flex-1 md:flex-none bg-zinc-800 hover:bg-zinc-700 text-white font-black px-8 py-4 rounded-2xl transition-all flex items-center justify-center gap-2">
              <ArrowDownLeft className="w-5 h-5" />
              Withdraw
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Assets List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <PieChart className="text-blue-400 w-5 h-5" />
              Asset Allocation
            </h3>
            <button className="text-sm text-zinc-500 font-bold hover:text-zinc-300">Manage Assets</button>
          </div>
          
          <div className="bg-zinc-900/30 border border-zinc-800 rounded-3xl overflow-hidden">
            <AssetRow sym="BTC" name="Bitcoin" amount="0.42" value="$28,450.12" change="+2.4%" />
            <AssetRow sym="ETH" name="Ethereum" amount="4.5" value="$11,240.40" change="-1.2%" />
            <AssetRow sym="USDT" name="Tether" amount="2,450" value="$2,450.00" change="0.0%" />
            <AssetRow sym="SOL" name="Solana" amount="12.4" value="$709.72" change="+8.5%" />
          </div>
        </div>

        {/* Security / Info */}
        <div className="space-y-6">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <ShieldCheck className="text-emerald-400 w-5 h-5" />
            Security Status
          </h3>
          <div className="bg-zinc-900/30 border border-zinc-800 p-8 rounded-3xl space-y-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20">
                <ShieldCheck className="text-emerald-400" />
              </div>
              <div>
                <div className="font-bold">Cold Storage Active</div>
                <div className="text-xs text-zinc-500">98% of assets in multi-sig</div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Recent Activity</div>
              <ActivityItem icon={<ArrowUpRight className="text-emerald-400" />} title="Deposit Confirmed" time="2h ago" amount="+$1,200" />
              <ActivityItem icon={<History className="text-blue-400" />} title="Trade Executed" time="5h ago" amount="-$450" />
              <ActivityItem icon={<ArrowDownLeft className="text-red-400" />} title="Withdrawal Pending" time="1d ago" amount="-$2,000" />
            </div>

            <div className="pt-4 border-t border-zinc-800">
              <p className="text-[10px] text-zinc-500 font-medium leading-relaxed">
                All transactions are encrypted with AES-256 and verified on-chain. 
                NEXARB uses institutional-grade security protocols.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AssetRow({ sym, name, amount, value, change }: { sym: string, name: string, amount: string, value: string, change: string }) {
  const isPositive = change.startsWith('+');
  return (
    <div className="flex items-center justify-between p-6 hover:bg-zinc-800/20 transition-all border-b border-zinc-800/50 last:border-0 group cursor-pointer">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-zinc-800 rounded-2xl flex items-center justify-center font-bold text-lg border border-zinc-700/50 group-hover:border-emerald-500/30 transition-all">
          {sym.slice(0, 1)}
        </div>
        <div>
          <div className="font-bold">{name}</div>
          <div className="text-xs text-zinc-500 font-medium">{amount} {sym}</div>
        </div>
      </div>
      <div className="text-right">
        <div className="font-bold">{value}</div>
        <div className={`text-xs font-bold ${isPositive ? 'text-emerald-400' : change === '0.0%' ? 'text-zinc-500' : 'text-red-400'}`}>
          {change}
        </div>
      </div>
    </div>
  );
}

function ActivityItem({ icon, title, time, amount }: { icon: React.ReactNode, title: string, time: string, amount: string }) {
  return (
    <div className="flex items-center justify-between group cursor-pointer">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-zinc-800 rounded-lg flex items-center justify-center group-hover:bg-zinc-700 transition-colors">
          {icon}
        </div>
        <div>
          <div className="text-sm font-bold">{title}</div>
          <div className="text-[10px] text-zinc-500 font-medium">{time}</div>
        </div>
      </div>
      <div className="text-sm font-mono font-bold">{amount}</div>
    </div>
  );
}
