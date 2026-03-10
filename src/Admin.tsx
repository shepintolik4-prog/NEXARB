import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  BarChart3, 
  Users, 
  Zap, 
  Settings, 
  Crown, 
  DollarSign, 
  ArrowLeft,
  RefreshCw,
  Save
} from 'lucide-react';

export default function Admin({ onBack }: { onBack: () => void }) {
  const [stats, setStats] = useState<any>(null);
  const [config, setConfig] = useState({
    fee_free: 0.008,
    fee_vip: 0.003,
    free_trades_max: 5
  });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await axios.get('/api/admin/stats');
      setStats(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const saveConfig = async () => {
    try {
      await axios.post('/api/admin/config', config);
      alert('Конфигурация сохранена!');
    } catch (err) {
      alert('Ошибка сохранения');
    }
  };

  if (!stats) return <div className="p-10 text-center text-slate-500">Loading Admin Data...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={16} />
          <span className="text-sm font-bold uppercase tracking-widest">Back to App</span>
        </button>
        <h2 className="text-xs font-black text-red-500 uppercase tracking-[0.2em]">NEXARB CONTROL PANEL</h2>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Total Users</p>
          <p className="text-2xl font-mono font-black text-white">{stats.total_users}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">VIP Users</p>
          <p className="text-2xl font-mono font-black text-amber-500">{stats.vip_users}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Total Volume</p>
          <p className="text-2xl font-mono font-black text-cyan-400">${stats.total_volume.toLocaleString()}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Platform Fees</p>
          <p className="text-2xl font-mono font-black text-emerald-400">${stats.platform_fees.toFixed(2)}</p>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 bg-slate-800/30 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-widest">System Configuration</h3>
          <button onClick={saveConfig} className="text-cyan-400 hover:text-cyan-300 transition-colors">
            <Save size={18} />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase">Free User Fee (%)</label>
            <input 
              type="number" 
              value={config.fee_free * 100} 
              onChange={(e) => setConfig({...config, fee_free: Number(e.target.value) / 100})}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm font-mono"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase">VIP User Fee (%)</label>
            <input 
              type="number" 
              value={config.fee_vip * 100} 
              onChange={(e) => setConfig({...config, fee_vip: Number(e.target.value) / 100})}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm font-mono"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase">Max Free Trades/Day</label>
            <input 
              type="number" 
              value={config.free_trades_max} 
              onChange={(e) => setConfig({...config, free_trades_max: Number(e.target.value)})}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm font-mono"
            />
          </div>
        </div>
      </div>

      <button 
        onClick={fetchStats}
        className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all"
      >
        <RefreshCw size={16} />
        <span>Refresh Stats</span>
      </button>
    </div>
  );
}
