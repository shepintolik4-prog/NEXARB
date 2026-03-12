import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User, 
  Shield, 
  Key, 
  Settings, 
  LogOut, 
  Copy, 
  Check, 
  Plus, 
  Trash2, 
  Globe,
  Lock,
  Zap,
  ChevronRight
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

  const connectExchange = async () => {
    if (!token) return;
    setConnecting(true);
    try {
      const res = await fetch('/api/v1/exchange/connect', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          exchange: newExchange.id,
          apiKey: newExchange.key,
          apiSecret: newExchange.secret
        })
      });
      if (res.ok) {
        setShowAddExchange(false);
        // Refresh data
        const fresh = await fetch('/api/v1/account', { headers: { 'Authorization': `Bearer ${token}` } });
        setUserData(await fresh.json());
      } else {
        const err = await res.json();
        alert(`Error: ${err.error}`);
      }
    } catch (e) {
      alert('Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const disconnectExchange = async (exchange: string) => {
    if (!token) return;
    if (!confirm(`Disconnect ${exchange}?`)) return;
    
    try {
      const res = await fetch('/api/v1/exchange/connect', {
        method: 'DELETE',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ exchange })
      });
      if (res.ok) {
        const fresh = await fetch('/api/v1/account', { headers: { 'Authorization': `Bearer ${token}` } });
        setUserData(await fresh.json());
      }
    } catch (e) {
      console.error('Disconnect failed', e);
    }
  };

  const copyRef = () => {
    if (!userData?.ref_code) return;
    navigator.clipboard.writeText(`https://nexarb.app/ref/${userData.ref_code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!userData) return <div className="flex justify-center p-20"><div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      {/* Add Exchange Modal */}
      <AnimatePresence>
        {showAddExchange && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-zinc-900 border border-zinc-800 p-8 rounded-3xl w-full max-w-md space-y-6"
            >
              <h3 className="text-2xl font-bold">Connect Exchange</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-zinc-500 uppercase">Exchange</label>
                  <select 
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 mt-1"
                    value={newExchange.id}
                    onChange={(e) => setNewExchange({ ...newExchange, id: e.target.value })}
                  >
                    {EXCHS.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-zinc-500 uppercase">API Key</label>
                  <input 
                    type="text" 
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 mt-1"
                    value={newExchange.key}
                    onChange={(e) => setNewExchange({ ...newExchange, key: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-zinc-500 uppercase">API Secret</label>
                  <input 
                    type="password" 
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 mt-1"
                    value={newExchange.secret}
                    onChange={(e) => setNewExchange({ ...newExchange, secret: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowAddExchange(false)}
                  className="flex-1 py-3 rounded-xl bg-zinc-800 font-bold"
                >
                  Cancel
                </button>
                <button 
                  onClick={connectExchange}
                  disabled={connecting}
                  className="flex-1 py-3 rounded-xl bg-emerald-500 text-black font-bold disabled:opacity-50"
                >
                  {connecting ? 'Connecting...' : 'Connect'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* User Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-zinc-900/30 border border-zinc-800 p-8 rounded-3xl">
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-blue-600 rounded-2xl flex items-center justify-center text-3xl font-bold border border-white/10 shadow-2xl overflow-hidden">
            {user?.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" /> : (user?.displayName?.[0] || 'U')}
          </div>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">{user?.displayName || 'User'}</h2>
            <div className="flex items-center gap-2 text-zinc-500 mt-1">
              <span className="text-sm">{user?.email}</span>
              <span className="w-1 h-1 bg-zinc-700 rounded-full" />
              <span className="text-sm">ID: {user?.uid.slice(0, 8)}...</span>
            </div>
            <div className="flex items-center gap-2 mt-3">
              {userData.vip ? (
                <span className="bg-emerald-500/10 text-emerald-400 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-500/20 uppercase tracking-wider">VIP Active</span>
              ) : (
                <span className="bg-zinc-500/10 text-zinc-500 text-[10px] font-black px-2 py-0.5 rounded-full border border-zinc-500/20 uppercase tracking-wider">Free Plan</span>
              )}
              <span className="bg-blue-500/10 text-blue-400 text-[10px] font-black px-2 py-0.5 rounded-full border border-blue-500/20 uppercase tracking-wider">Verified</span>
            </div>
          </div>
        </div>
        
        <button className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-3 rounded-2xl font-bold transition-all flex items-center gap-2">
          <Settings className="w-4 h-4" />
          Edit Profile
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* API Keys Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Key className="text-emerald-400 w-5 h-5" />
              Exchange API Keys
            </h3>
            <button 
              onClick={() => setShowAddExchange(true)}
              className="text-emerald-400 hover:text-emerald-300 text-sm font-bold flex items-center gap-1"
            >
              <Plus className="w-4 h-4" /> Add New
            </button>
          </div>
          
          <div className="space-y-3">
            {userData.api_keys?.length > 0 ? (
              userData.api_keys.map((k: any) => (
                <ExchangeCard 
                  key={k.exchange} 
                  name={k.exchange.toUpperCase()} 
                  logo={k.exchange[0].toUpperCase()} 
                  status="connected" 
                  onDelete={() => disconnectExchange(k.exchange)}
                />
              ))
            ) : (
              <div className="p-8 text-center bg-zinc-900/20 border border-zinc-800/50 rounded-2xl text-zinc-500 text-sm font-bold">
                No exchanges connected
              </div>
            )}
          </div>
        </div>

        {/* Referral Section */}
        <div className="space-y-4">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <Globe className="text-blue-400 w-5 h-5" />
            Referral Program
          </h3>
          <div className="bg-zinc-900/30 border border-zinc-800 p-6 rounded-3xl space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-zinc-950/50 p-4 rounded-2xl border border-zinc-800/50">
                <div className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Invited</div>
                <div className="text-xl font-bold">0 Users</div>
              </div>
              <div className="bg-zinc-950/50 p-4 rounded-2xl border border-zinc-800/50">
                <div className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Earned</div>
                <div className="text-xl font-bold text-emerald-400">${userData.ref_earned?.toFixed(2) || '0.00'}</div>
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Your Referral Link</label>
              <div className="flex gap-2">
                <div className="flex-1 bg-zinc-950/50 border border-zinc-800 rounded-xl px-4 py-3 text-sm font-mono text-zinc-400 truncate">
                  nexarb.app/ref/{userData.ref_code}
                </div>
                <button 
                  onClick={copyRef}
                  className="bg-emerald-500 hover:bg-emerald-400 text-black p-3 rounded-xl transition-all"
                >
                  {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Settings Section */}
      <div className="space-y-4">
        <h3 className="text-xl font-bold flex items-center gap-2">
          <Settings className="text-zinc-400 w-5 h-5" />
          Account Settings
        </h3>
        <div className="bg-zinc-900/30 border border-zinc-800 rounded-3xl divide-y divide-zinc-800">
          <SettingsItem icon={<Globe className="w-4 h-4" />} label="Interface Language" value="Russian (RU)" />
          <SettingsItem icon={<Lock className="w-4 h-4" />} label="Two-Factor Authentication" value="Enabled" />
          <SettingsItem icon={<Zap className="w-4 h-4" />} label="HFT Execution Speed" value="Turbo (10ms)" />
          <SettingsItem icon={<Shield className="w-4 h-4" />} label="Privacy Mode" value="Active" />
        </div>
      </div>

      <button 
        onClick={logout}
        className="w-full py-4 text-red-500 font-bold hover:bg-red-500/5 rounded-2xl transition-all flex items-center justify-center gap-2"
      >
        <LogOut className="w-5 h-5" />
        Logout Session
      </button>
    </div>
  );
}

function ExchangeCard({ name, logo, status, onDelete }: { name: string, logo: string, status: 'connected' | 'disconnected', onDelete?: () => any, key?: any }) {
  return (
    <div className="flex items-center justify-between p-4 bg-zinc-900/30 border border-zinc-800 rounded-2xl hover:border-zinc-700 transition-all group">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center text-xl font-bold">
          {logo}
        </div>
        <div>
          <div className="font-bold">{name}</div>
          <div className={`text-[10px] font-bold uppercase tracking-wider ${status === 'connected' ? 'text-emerald-400' : 'text-zinc-500'}`}>
            {status === 'connected' ? '● Connected' : '○ Disconnected'}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400">
          <Settings className="w-4 h-4" />
        </button>
        <button 
          onClick={onDelete}
          className="p-2 hover:bg-zinc-800 rounded-lg text-red-400"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function SettingsItem({ icon, label, value }: { icon: React.ReactNode, label: string, value: string }) {
  return (
    <div className="flex items-center justify-between p-6 hover:bg-zinc-800/20 transition-all cursor-pointer group">
      <div className="flex items-center gap-4">
        <div className="text-zinc-500 group-hover:text-emerald-400 transition-colors">{icon}</div>
        <span className="font-medium text-zinc-300">{label}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-zinc-500 font-bold">{value}</span>
        <ChevronRight className="w-4 h-4 text-zinc-700 group-hover:text-zinc-500" />
      </div>
    </div>
  );
}
