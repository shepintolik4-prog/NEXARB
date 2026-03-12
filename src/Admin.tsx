import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Users, 
  ShieldCheck, 
  BarChart3, 
  Wallet, 
  Settings, 
  Search, 
  Ban, 
  CheckCircle2, 
  AlertCircle,
  TrendingUp,
  DollarSign
} from 'lucide-react';

interface Stats {
  total_users: number;
  vip_users: number;
  total_volume: number;
  platform_fees: number;
}

export default function Admin() {
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [adminSecret, setAdminSecret] = useState(localStorage.getItem('admin_secret') || '');
  const [isAuthorized, setIsAuthorized] = useState(false);

  const fetchAdminData = async () => {
    try {
      const statsRes = await fetch('/api/admin/stats', { headers: { 'x-admin-secret': adminSecret } });
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
        setIsAuthorized(true);
        localStorage.setItem('admin_secret', adminSecret);
      } else {
        setIsAuthorized(false);
      }

      const usersRes = await fetch('/api/admin/users', { headers: { 'x-admin-secret': adminSecret } });
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setUsers(usersData.items);
      }
    } catch (e) {
      console.error('Admin fetch error', e);
    }
  };

  useEffect(() => {
    if (adminSecret) fetchAdminData();
  }, [adminSecret]);

  if (!isAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <ShieldCheck className="w-16 h-16 text-zinc-700 mb-4" />
        <h2 className="text-2xl font-bold mb-6">Admin Authorization</h2>
        <div className="w-full max-w-md space-y-4">
          <input 
            type="password" 
            placeholder="Enter Admin Secret"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 px-4 focus:outline-none focus:border-emerald-500"
            value={adminSecret}
            onChange={(e) => setAdminSecret(e.target.value)}
          />
          <button 
            onClick={fetchAdminData}
            className="w-full bg-emerald-500 text-black font-bold py-3 rounded-xl"
          >
            Authorize
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <ShieldCheck className="text-emerald-400" />
              NEXARB CONTROL PANEL
            </h1>
            <p className="text-zinc-500 mt-1">System administration and user management</p>
          </div>
          
          <div className="flex items-center gap-4">
            <button onClick={() => { localStorage.removeItem('admin_secret'); setIsAuthorized(false); }} className="text-xs text-zinc-500 hover:text-white">Logout</button>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard 
            title="Total Users" 
            value={stats?.total_users?.toLocaleString() || '0'} 
            icon={<Users className="text-blue-400" />}
            trend={`${stats?.online_users || 0} online now`}
          />
          <StatCard 
            title="VIP Users" 
            value={stats?.vip_users?.toLocaleString() || '0'} 
            icon={<ShieldCheck className="text-emerald-400" />}
            trend={`${((stats?.vip_users / stats?.total_users) * 100 || 0).toFixed(1)}% conversion`}
          />
          <StatCard 
            title="Total Volume" 
            value={`$${(stats?.total_volume / 1000000 || 0).toFixed(1)}M`} 
            icon={<TrendingUp className="text-purple-400" />}
            trend={`$${(stats?.volume_24h || 0).toLocaleString()} last 24h`}
          />
          <StatCard 
            title="Platform Fees" 
            value={`$${(stats?.platform_fees_total || 0).toLocaleString()}`} 
            icon={<DollarSign className="text-amber-400" />}
            trend={`+$${(stats?.platform_fees_24h || 0).toLocaleString()} today`}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content Area */}
          <div className="lg:col-span-2 space-y-8">
            <section className="bg-zinc-900/30 border border-zinc-800 rounded-2xl overflow-hidden">
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Users className="w-5 h-5 text-zinc-400" />
                  Recent Users
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-zinc-500 text-xs uppercase tracking-wider">
                      <th className="px-6 py-4 font-medium">User</th>
                      <th className="px-6 py-4 font-medium">Status</th>
                      <th className="px-6 py-4 font-medium">Balance</th>
                      <th className="px-6 py-4 font-medium">Joined</th>
                      <th className="px-6 py-4 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {users.map((u) => (
                      <UserRow 
                        key={u.id}
                        name={u.tg_first_name || 'User'} 
                        tg={u.tg_username ? `@${u.tg_username}` : u.id} 
                        status={u.blocked ? 'BANNED' : (u.vip ? 'VIP' : 'FREE')} 
                        balance={`$${u.balance.toFixed(2)}`} 
                        joined={new Date(u.created_at * 1000).toLocaleDateString()}
                        isBanned={u.blocked}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, trend }: { title: string, value: string, icon: React.ReactNode, trend: string }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-zinc-900/30 border border-zinc-800 p-6 rounded-2xl"
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-zinc-500 text-sm font-medium">{title}</span>
        <div className="p-2 bg-zinc-800/50 rounded-lg">{icon}</div>
      </div>
      <div className="text-2xl font-bold mb-1">{value}</div>
      <div className="text-xs text-zinc-500">{trend}</div>
    </motion.div>
  );
}

const UserRow: React.FC<{ name: string, tg: string, status: string, balance: string, joined: string, isBanned?: boolean }> = ({ name, tg, status, balance, joined, isBanned }) => {
  return (
    <tr className="hover:bg-zinc-800/20 transition-colors">
      <td className="px-6 py-4">
        <div className="font-medium">{name}</div>
        <div className="text-xs text-zinc-500">{tg}</div>
      </td>
      <td className="px-6 py-4">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
          status === 'VIP' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
          status === 'BANNED' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
          'bg-zinc-800 text-zinc-400'
        }`}>
          {status}
        </span>
      </td>
      <td className="px-6 py-4 text-sm font-mono">{balance}</td>
      <td className="px-6 py-4 text-sm text-zinc-500">{joined}</td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <button className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 transition-colors">
            <Settings className="w-4 h-4" />
          </button>
          <button className={`p-1.5 hover:bg-zinc-800 rounded-lg transition-colors ${isBanned ? 'text-emerald-400' : 'text-red-400'}`}>
            <Ban className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function ConfigItem({ label, active }: { label: string, active: boolean }) {
  return (
    <div className="flex items-center justify-between p-3 bg-zinc-800/30 rounded-xl border border-zinc-800/50">
      <span className="text-sm text-zinc-300">{label}</span>
      <div className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors ${active ? 'bg-emerald-500' : 'bg-zinc-700'}`}>
        <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${active ? 'left-6' : 'left-1'}`} />
      </div>
    </div>
  );
}

function AlertItem({ type, text }: { type: 'warning' | 'info' | 'error', text: string }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <div className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${
        type === 'warning' ? 'bg-amber-400' :
        type === 'info' ? 'bg-blue-400' :
        'bg-red-400'
      }`} />
      <span className="text-zinc-400">{text}</span>
    </div>
  );
}
