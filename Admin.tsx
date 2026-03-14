import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  ShieldCheck, Users, TrendingUp, DollarSign,
  AlertCircle, Settings, Ban, CheckCircle2,
  RefreshCw, Activity, BarChart3, Crown
} from 'lucide-react';
import { useAuth } from './contexts/AuthContext';

export default function Admin() {
  const { token } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [adminSecret, setAdminSecret] = useState(localStorage.getItem('admin_secret') || '');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'users'>('overview');
  const [searchQ, setSearchQ] = useState('');

  const fetchData = async () => {
    setError(null);
    setLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (adminSecret) headers['x-admin-secret'] = adminSecret;
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const [statsRes, usersRes] = await Promise.all([
        fetch('/api/admin/stats', { headers }),
        fetch('/api/admin/users?limit=50', { headers }),
      ]);

      if (statsRes.ok) {
        setStats(await statsRes.json());
        setIsAuthorized(true);
        if (adminSecret) localStorage.setItem('admin_secret', adminSecret);
      } else {
        const err = await statsRes.json().catch(() => ({ error: `HTTP ${statsRes.status}` }));
        setError(err.error || 'Access denied');
        setIsAuthorized(false);
      }

      if (usersRes.ok) {
        const d = await usersRes.json();
        setUsers(d.items || []);
      }
    } catch (e) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (token) fetchData(); }, [token]);

  const filteredUsers = users.filter(u =>
    !searchQ || u.id.toLowerCase().includes(searchQ.toLowerCase()) ||
    u.tg_username?.toLowerCase().includes(searchQ.toLowerCase())
  );

  if (!isAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center py-20 max-w-sm mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-6">
          <ShieldCheck className="w-7 h-7 text-zinc-600" />
        </div>
        <h2 className="text-2xl font-black mb-2">Admin Access</h2>
        <p className="text-sm text-zinc-500 mb-8 text-center">Enter your admin secret or use an authorized Google account</p>

        {error && (
          <div className="w-full mb-4 p-3.5 bg-red-500/8 border border-red-500/20 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        <input type="password" placeholder="Admin secret key"
          className="w-full mb-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:border-cyan-500/50 transition-colors"
          value={adminSecret}
          onChange={e => setAdminSecret(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && fetchData()} />

        <button onClick={fetchData} disabled={loading}
          className="w-full bg-cyan-500 text-black font-black py-3.5 rounded-xl text-sm uppercase tracking-wide disabled:opacity-50 transition-opacity">
          {loading ? 'Authenticating…' : 'Access Panel'}
        </button>
      </div>
    );
  }

  const STAT_CARDS = [
    { label: 'Total Users', value: stats?.total_users?.toLocaleString() || '0', sub: `${stats?.online_users || 0} online`, icon: <Users className="w-5 h-5" />, color: '#00d4ff' },
    { label: 'VIP Users', value: stats?.vip_users?.toLocaleString() || '0', sub: `${((stats?.vip_users / Math.max(stats?.total_users, 1)) * 100).toFixed(1)}% rate`, icon: <Crown className="w-5 h-5" />, color: '#ffaa00' },
    { label: 'Volume 24h', value: `$${((stats?.volume_24h || 0) / 1000).toFixed(1)}K`, sub: `Total: $${((stats?.total_volume || 0) / 1000000).toFixed(2)}M`, icon: <TrendingUp className="w-5 h-5" />, color: '#aa55ff' },
    { label: 'Fees 24h', value: `$${(stats?.platform_fees_24h || 0).toFixed(2)}`, sub: `Total: $${(stats?.platform_fees_total || 0).toFixed(2)}`, icon: <DollarSign className="w-5 h-5" />, color: '#00ff88' },
  ];

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xl font-black">ADMIN PANEL</h2>
            <p className="text-[11px] text-zinc-500 font-bold">v2.1 · Authorized</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-bold text-zinc-400 hover:text-white transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button onClick={() => { localStorage.removeItem('admin_secret'); setIsAuthorized(false); setStats(null); }}
            className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-bold text-zinc-500 hover:text-red-400 transition-colors">
            Logout
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {STAT_CARDS.map((card, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
            className="relative overflow-hidden bg-zinc-900/30 border border-zinc-800/60 rounded-2xl p-4">
            <div className="absolute inset-x-0 top-0 h-px"
              style={{ background: `linear-gradient(90deg, transparent, ${card.color}40, transparent)` }} />
            <div className="flex items-start justify-between mb-3">
              <div className="text-[10px] text-zinc-500 font-black uppercase tracking-wider">{card.label}</div>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center border"
                style={{ background: card.color + '10', borderColor: card.color + '25', color: card.color }}>
                {card.icon}
              </div>
            </div>
            <div className="text-2xl font-black text-white mb-0.5">{card.value}</div>
            <div className="text-[10px] text-zinc-600 font-bold">{card.sub}</div>
          </motion.div>
        ))}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2">
        {(['overview', 'users'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              activeTab === t ? 'bg-zinc-800 text-white border border-zinc-700' : 'text-zinc-600 hover:text-zinc-400'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && stats && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-zinc-900/30 border border-zinc-800/60 rounded-2xl p-5">
            <h4 className="text-[11px] text-zinc-500 font-black uppercase tracking-wider mb-4">System Status</h4>
            <div className="space-y-3">
              {[
                { label: 'API Server', status: true },
                { label: 'Database', status: true },
                { label: 'Market Scanner', status: true },
                { label: 'WebSocket', status: true },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400 font-bold">{item.label}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] text-emerald-400 font-bold uppercase">Online</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-zinc-900/30 border border-zinc-800/60 rounded-2xl p-5">
            <h4 className="text-[11px] text-zinc-500 font-black uppercase tracking-wider mb-4">Trade Stats</h4>
            <div className="space-y-3">
              {[
                { label: 'Total Trades', value: stats.total_trades?.toLocaleString() || '0' },
                { label: 'Blocked Users', value: stats.blocked_users || '0' },
                { label: 'Free Users', value: stats.free_users?.toLocaleString() || '0' },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400 font-bold">{item.label}</span>
                  <span className="text-sm font-black text-white">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="space-y-4">
          <input type="text" placeholder="Search by ID or username…"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-cyan-500/50 transition-colors"
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)} />

          <div className="bg-zinc-900/30 border border-zinc-800/60 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800/50 grid grid-cols-5 gap-4 text-[10px] font-black text-zinc-600 uppercase tracking-wider">
              <span className="col-span-2">User</span>
              <span>Balance</span>
              <span>Status</span>
              <span>Trades</span>
            </div>
            <div className="divide-y divide-zinc-800/30">
              {filteredUsers.slice(0, 20).map((u, i) => (
                <div key={u.id} className="px-4 py-3 grid grid-cols-5 gap-4 items-center hover:bg-zinc-800/20 transition-colors">
                  <div className="col-span-2 min-w-0">
                    <div className="text-sm font-bold text-white truncate">{u.tg_username ? `@${u.tg_username}` : u.tg_first_name || 'User'}</div>
                    <div className="text-[10px] text-zinc-600 font-mono truncate">{u.id.slice(0, 16)}…</div>
                  </div>
                  <div className="text-sm font-bold text-white">${(u.balance || 0).toFixed(0)}</div>
                  <div>
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${
                      u.blocked ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                      u.vip ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                      'bg-zinc-800 text-zinc-500 border border-zinc-700'
                    }`}>
                      {u.blocked ? 'Banned' : u.vip ? 'VIP' : 'Free'}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-zinc-400">{u.trades || 0}</div>
                </div>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-zinc-600 text-center">{filteredUsers.length} users found</p>
        </div>
      )}
    </div>
  );
}
