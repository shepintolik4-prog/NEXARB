import React from 'react';
import { motion } from 'motion/react';
import { Wallet as WalletIcon, ArrowUpRight, ArrowDownLeft, History, CreditCard, ShieldCheck } from 'lucide-react';

const Wallet: React.FC = () => {
  return (
    <div className="p-4 space-y-6">
      {/* Balance Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-cyan/20 to-purple/20 border border-cyan/30 p-6 shadow-[0_0_30px_rgba(0,207,255,0.1)]">
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-cyan/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-purple/10 rounded-full blur-3xl" />
        
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-8">
            <div>
              <p className="text-xs text-muted font-bold uppercase tracking-widest mb-1">Total Balance</p>
              <h2 className="text-4xl font-black tracking-tighter">$12,450.00</h2>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-bg/50 backdrop-blur-md flex items-center justify-center border border-white/10">
              <WalletIcon size={24} className="text-cyan" />
            </div>
          </div>
          
          <div className="flex gap-3">
            <button className="flex-1 btn-primary py-2.5 flex items-center justify-center gap-2 text-sm">
              <ArrowUpRight size={18} /> DEPOSIT
            </button>
            <button className="flex-1 btn-secondary py-2.5 flex items-center justify-center gap-2 text-sm">
              <ArrowDownLeft size={18} /> WITHDRAW
            </button>
          </div>
        </div>
      </div>

      {/* Assets */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-widest text-muted">Assets</h3>
        <div className="space-y-2">
          {[
            { sym: 'USDT', name: 'Tether USD', amount: '10,200.00', val: '$10,200.00', color: '#26A17B' },
            { sym: 'BTC', name: 'Bitcoin', amount: '0.034', val: '$2,210.00', color: '#F7931A' },
            { sym: 'ETH', name: 'Ethereum', amount: '0.012', val: '$40.00', color: '#627EEA' },
          ].map(asset => (
            <div key={asset.sym} className="card flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs" style={{ backgroundColor: `${asset.color}20`, color: asset.color }}>
                  {asset.sym[0]}
                </div>
                <div>
                  <div className="font-bold text-sm">{asset.sym}</div>
                  <div className="text-[10px] text-muted">{asset.name}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono font-bold text-sm">{asset.amount}</div>
                <div className="text-[10px] text-muted">{asset.val}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Security Info */}
      <div className="bg-bg3/30 border border-border rounded-2xl p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-green/10 flex items-center justify-center">
          <ShieldCheck size={20} className="text-green" />
        </div>
        <div>
          <h4 className="text-xs font-bold">Funds are Secure</h4>
          <p className="text-[10px] text-muted">All assets are protected by AES-256 encryption and multi-sig cold storage.</p>
        </div>
      </div>
    </div>
  );
};

export default Wallet;
