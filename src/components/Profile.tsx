import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  User, Shield, Key, Settings, LogOut, Copy, Check,
  Plus, Trash2, Globe, Lock, Zap, ChevronRight, Crown,
  Bell, Eye, EyeOff, AlertTriangle, ExternalLink
} from 'lucide-react';
import { EXCHS } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { logout } from '../firebase';

export default function Profile() {
  const { user, token } = useAuth();
  const [userData, setUserData] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [showAddExchange, setShowAddExchange] = useState(false);
  const [newExchange, setNewExchange] = useState({ id: 'binance', key: '', secret: '' });
  const [connecting, setConnecting] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [activeSection, setActiveSection] = useState<'api' | 'referral' | 'settings'>('api');

  useEffect(() => {
    if (!token) return;
    fetch('/api/v1/account', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(setUserData)
      .catch(console.error);
  }, [token]);

  const connectExchange = async () => {
    if (!token || !newExchange.key || !newExchange.secret) return;
    setConnecting(true);
    try {
      const res = await fetch('/api/v1/exchange/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ exchange: newExchange.id, apiKey: newExchange.key, apiSecret: newExchange.secret }),
      });
      if (res.ok) {
        setShowAddExchange(false);
        setNewExchange({ id: 'binance', key: '', secret: '' });
        const fresh = await fetch('/api/v1/account', { headers: { Authorization: `Bearer ${token}` } });
        setUserData(await fresh.json());
      } else {
        const err = await res.json();
        alert(`Error: ${err.error}`);
      }
    } finally {
      setConnecting(false);
    }
  };

  const disconnectExchange = async (exchange: string) => {
    if (!token || !confirm(`Disconnect ${exchange}?`)) return;
    const res = await fetch('/api/v1/exchange/connect', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ exchange }),
    });
    if (res.ok) {
      const fresh = await fetch('/api/v1/account', { headers: { Authorization: `Bearer ${token}` } });
      setUserData(await fresh.json());
    }
  };

  const copyRef = () => {
    if (!userData?.ref_code) return;
    navigator.clipboard.writeText(`https://nexarb.app/ref/${userData.ref_code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!userData) return (
    <div className="flex justify-center items-center py-32">
      <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const initials = (user?.displayName || 'U').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-24">
      {/* Add Exchange Modal */}
      <AnimatePresence>
        {showAddExchange && (
          <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowAddExchange(false)}>
            <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
              <div className="p-6 border-b border-zinc-800">
                <div className="h-1 w-10 bg-zinc-700 rounded-full mx-auto mb-5" />
                <h3 className="text-xl font-black">Connect Exchange</h3>
                <p className="text-sm text-zinc-500 mt-1">API keys are AES-256 encrypted</p>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-[11px] font-black text-zinc-500 uppercase tracking-wider block mb-2">Exchange</label>
                  <select
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-cyan-500/50 transition-colors"
                    value={newExchange.id}
                    onChange={e => setNewExchange({ ...newExchange, id: e.target.value })}>
                    {EXCHS.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-black text-zinc-500 uppercase tracking-wider block mb-2">API Key</label>
                  <input type="text" placeholder="Enter API key"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-cyan-500/50 transition-colors placeholder:text-zinc-700"
                    value={newExchange.key}
                    onChange={e => setNewExchange({ ...newExchange, key: e.target.value })} />
                </div>
                <div>
                  <label className="text-[11px] font-black text-zinc-500 uppercase tracking-wider block mb-2">API Secret</label>
                  <input type="password" placeholder="Enter API secret"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-cyan-500/50 transition-colors placeholder:text-zinc-700"
                    value={newExchange.secret}
                    onChange={e => setNewExchange({ ...newExchange, secret: e.target.value })} />
                </div>
                <div className="flex items-start gap-2 p-3 bg-amber-500/5 border border-amber-500/15 rounded-xl">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-400/80 leading-relaxed">
                    Use read-only API keys when possible. Never enable withdrawal permissions.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 p-6 pt-0">
                <button onClick={() => setShowAddExchange(false)}
                  className="flex-1 py-3.5 rounded-xl bg-zinc-800 font-black text-sm text-zinc-400">
                  Cancel
                </button>
                <button onClick={connectExchange} disabled={connecting || !newExchange.key || !newExchange.secret}
                  className="flex-1 py-3.5 rounded-xl bg-cyan-500 text-black font-black text-sm disabled:opacity-40 transition-opacity">
                  {connecting ? 'Connecting…' : 'Connect'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Profile Header */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl bg-zinc-900/50 border border-zinc-800 p-6 md:p-8">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl" />

        <div className="relative flex flex-col md:flex-row md:items-center gap-6">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="w-20 h-20 rounded-2xl border-2 border-zinc-700 overflow-hidden">
              {user?.photoURL
                ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                : <div className="w-full h-full bg-gradient-to-br from-cyan-500/30 to-purple-500/30 flex items-center justify-center text-2xl font-black text-cyan-400">{initials}</div>
              }
            </div>
            {userData.vip && (
              <div className="absolute -bottom-1.5 -right-1.5 w-7 h-7 bg-amber-500 rounded-lg flex items-center justify-center">
                <Crown className="w-3.5 h-3.5 text-black" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <h2 className="text-2xl font-black text-white">{user?.displayName || 'User'}</h2>
              {userData.vip && (
                <span className="bg-amber-500/10 border border-amber-500/25 text-amber-400 text-[10px] font-black px-2 py-0.5 rounded-lg uppercase tracking-wider">VIP</span>
              )}
            </div>
            <p className="text-zinc-500 text-sm mb-3">{user?.email}</p>
            <div className="flex flex-wrap gap-3 text-[11px]">
              <span className="text-zinc-600">ID: <span className="text-zinc-400 font-mono">{user?.uid.slice(0, 12)}…</span></span>
              <span className="text-zinc-600">Ref: <span className="text-cyan-400 font-bold">{userData.ref_code}</span></span>
              <span className="text-zinc-600">Joined: <span className="text-zinc-400">{new Date(userData.created_at * 1000).toLocaleDateString()}</span></span>
            </div>
          </div>

          <button className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 hover:border-zinc-600 text-sm font-bold transition-colors">
            <Settings className="w-4 h-4" />
            Edit
          </button>
        </div>
      </motion.div>

      {/* Section Tabs */}
      <div className="grid grid-cols-3 gap-2">
        {(['api', 'referral', 'settings'] as const).map(s => (
          <button key={s} onClick={() => setActiveSection(s)}
            className={`py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              activeSection === s ? 'bg-zinc-800 text-white border border-zinc-700' : 'text-zinc-600 hover:text-zinc-400'
            }`}>
            {s === 'api' ? 'API Keys' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeSection === 'api' && (
          <motion.div key="api" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black text-white">Exchange API Keys</h3>
                <p className="text-xs text-zinc-500 mt-0.5">{userData.api_keys?.length || 0} of {userData.limits?.exchanges_max || 2} slots used</p>
              </div>
              <button onClick={() => setShowAddExchange(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 text-xs font-black hover:bg-cyan-500/20 transition-colors">
                <Plus className="w-3.5 h-3.5" />
                Add Key
              </button>
            </div>

            {userData.api_keys?.length > 0 ? (
              userData.api_keys.map((k: any) => {
                const exch = EXCHS.find(e => e.id === k.exchange);
                return (
                  <div key={k.exchange} className="flex items-center gap-4 p-4 bg-zinc-900/40 border border-zinc-800/60 rounded-2xl hover:border-zinc-700 transition-colors group">
                    <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-lg font-black">
                      {exch?.logo || k.exchange[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white">{exch?.name || k.exchange}</span>
                        <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-bold uppercase">Live</span>
                      </div>
                      <div className="text-[11px] text-zinc-600 font-mono mt-0.5">Connected {new Date(k.ts * 1000).toLocaleDateString()}</div>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 transition-opacity">
                      <button className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center transition-colors">
                        <Settings className="w-3.5 h-3.5 text-zinc-400" />
                      </button>
                      <button onClick={() => disconnectExchange(k.exchange)}
                        className="w-8 h-8 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center transition-colors">
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12 bg-zinc-900/20 border border-zinc-800/40 border-dashed rounded-2xl">
                <Key className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
                <p className="text-sm font-bold text-zinc-500">No exchanges connected</p>
                <p className="text-xs text-zinc-600 mt-1">Connect your exchange API keys to enable live trading</p>
              </div>
            )}
          </motion.div>
        )}

        {activeSection === 'referral' && (
          <motion.div key="ref" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="bg-zinc-900/30 border border-zinc-800/60 rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-zinc-800/50">
              <h3 className="font-black text-white">Referral Program</h3>
              <p className="text-xs text-zinc-500 mt-1">Earn 10% of fees from invited users</p>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-zinc-950/60 border border-zinc-800/40 rounded-xl p-4 text-center">
                  <div className="text-2xl font-black text-white">0</div>
                  <div className="text-[10px] text-zinc-500 font-bold uppercase mt-1">Invited</div>
                </div>
                <div className="bg-zinc-950/60 border border-zinc-800/40 rounded-xl p-4 text-center">
                  <div className="text-2xl font-black text-emerald-400">${(userData.ref_earned || 0).toFixed(2)}</div>
                  <div className="text-[10px] text-zinc-500 font-bold uppercase mt-1">Earned</div>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-black text-zinc-500 uppercase tracking-wider block mb-2">Your referral link</label>
                <div className="flex gap-2">
                  <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs font-mono text-zinc-400 truncate">
                    nexarb.app/ref/{userData.ref_code}
                  </div>
                  <button onClick={copyRef}
                    className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${copied ? 'bg-emerald-500 text-black' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}>
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 bg-zinc-800/30 rounded-xl">
                <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full" />
                <p className="text-[11px] text-zinc-400">Referral bonuses paid instantly in USDT</p>
              </div>
            </div>
          </motion.div>
        )}

        {activeSection === 'settings' && (
          <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="space-y-2">
            {[
              { icon: <Globe />, label: 'Language', value: 'Russian (RU)', action: true },
              { icon: <Lock />, label: '2-Factor Auth', value: 'Enabled', action: true },
              { icon: <Zap />, label: 'Execution Speed', value: 'Turbo (10ms)', action: true },
              { icon: <Bell />, label: 'Notifications', value: 'All', action: true },
              { icon: <Shield />, label: 'Privacy Mode', value: 'On', action: true },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4 bg-zinc-900/30 border border-zinc-800/50 rounded-2xl hover:border-zinc-700 transition-colors cursor-pointer group">
                <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-400 [&>svg]:w-4 [&>svg]:h-4">
                  {item.icon}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-bold text-zinc-300">{item.label}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500 font-bold">{item.value}</span>
                  <ChevronRight className="w-4 h-4 text-zinc-700 group-hover:text-zinc-500 transition-colors" />
                </div>
              </div>
            ))}

            <div className="pt-4">
              <button onClick={logout}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border border-red-500/20 text-red-400 hover:bg-red-500/5 font-black text-sm transition-all uppercase tracking-wide">
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
