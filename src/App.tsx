import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Zap, 
  Shield, 
  History, 
  Settings, 
  User, 
  Crown, 
  Bot, 
  Globe, 
  TrendingUp, 
  ArrowRight,
  Plus,
  X,
  CheckCircle2,
  AlertCircle,
  BarChart3,
  Search
} from 'lucide-react';
import { EXCHS, COINS } from './constants';
import { LANGS } from './i18n';
import Admin from './Admin';

const socket = io();

export default function App() {
  const [page, setPage] = useState('signals');
  const [lang, setLang] = useState('ru');
  const [user, setUser] = useState<any>(null);
  const [signals, setSignals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tradeModal, setTradeModal] = useState<any>(null);
  const [amount, setAmount] = useState(200);
  const [autoTrade, setAutoTrade] = useState(false);
  const [adminPanel, setAdminPanel] = useState(false);

  const t = (key: string) => LANGS[lang]?.[key] || LANGS['ru'][key] || key;

  useEffect(() => {
    fetchAccount();
    
    socket.on('signals', (newSignals: any[]) => {
      setSignals(newSignals);
    });

    return () => {
      socket.off('signals');
    };
  }, []);

  const fetchAccount = async () => {
    try {
      const res = await axios.get('/api/v1/account');
      setUser(res.data);
      setLoading(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleTrade = async () => {
    if (!tradeModal) return;
    try {
      const res = await axios.post('/api/v1/trades', {
        userId: user.id,
        symbol: tradeModal.sym,
        amount,
        spread: tradeModal.spread,
        buyExchange: tradeModal.bx,
        sellExchange: tradeModal.sx,
        type: tradeModal.type
      });
      setUser({ ...user, balance: res.data.newBalance, trades: user.trades + 1 });
      setTradeModal(null);
      alert('Сделка успешно исполнена!');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Ошибка сделки');
    }
  };

  const buyVip = async (plan: string) => {
    try {
      const res = await axios.post('/api/v1/vip/subscribe', { userId: user.id, plan });
      setUser({ ...user, vip: true, vip_expires: res.data.expires_at });
      alert('VIP активирован!');
    } catch (err) {
      alert('Ошибка оплаты');
    }
  };

  if (loading) return <div className="h-screen bg-slate-950 flex items-center justify-center text-cyan-400 font-mono">LOADING NEXARB...</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-cyan-500/30">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800 px-4 py-3">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-purple-500 rounded-lg flex items-center justify-center font-bold text-slate-900">N∞</div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">NEX<span className="text-cyan-400">ARB</span></h1>
              <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">v4.0 HFT Engine</p>
            </div>
          </div>
          <button 
            onClick={() => user.vip ? setPage('profile') : setPage('vip')}
            className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all ${
              user.vip 
                ? 'bg-amber-500/10 border border-amber-500/50 text-amber-500' 
                : 'bg-cyan-500/10 border border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/20'
            }`}
          >
            {user.vip ? '👤 CABINET' : '⚡ FREE → VIP'}
          </button>
        </div>
        
        <div className="max-w-md mx-auto grid grid-cols-3 gap-2 mt-3">
          <div className="bg-slate-800/50 rounded-lg p-2 border border-slate-700/50">
            <p className="text-[8px] text-slate-500 uppercase font-bold">{t('balance')}</p>
            <p className="text-sm font-mono font-bold text-cyan-400">${user.balance.toLocaleString()}</p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-2 border border-slate-700/50">
            <p className="text-[8px] text-slate-500 uppercase font-bold">{t('profit_today')}</p>
            <p className="text-sm font-mono font-bold text-emerald-400">+${user.profit.toFixed(2)}</p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-2 border border-slate-700/50">
            <p className="text-[8px] text-slate-500 uppercase font-bold">{t('signals_count')}</p>
            <p className="text-sm font-mono font-bold text-amber-500">{signals.length}</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-md mx-auto p-4 pb-24">
        {adminPanel ? (
          <Admin onBack={() => setAdminPanel(false)} />
        ) : (
          <AnimatePresence mode="wait">
            {page === 'signals' && (
            <motion.div 
              key="signals"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{t('arb_signals')}</h2>
                </div>
                <span className="text-[10px] font-mono text-slate-500">{signals.length} active</span>
              </div>

              {signals.length > 0 ? signals.map((sig) => (
                <div 
                  key={sig.id}
                  onClick={() => setTradeModal(sig)}
                  className={`relative bg-slate-900 border border-slate-800 rounded-xl overflow-hidden cursor-pointer hover:border-slate-700 transition-all group ${sig.hot ? 'ring-1 ring-emerald-500/30' : ''}`}
                >
                  {sig.hot && <div className="absolute top-2 right-2 bg-emerald-500/10 text-emerald-400 text-[8px] font-bold px-2 py-0.5 rounded border border-emerald-500/30">🔥 HOT</div>}
                  
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-xl border border-slate-700">
                        {COINS.find(c => sig.sym.startsWith(c.sym))?.ico || '◈'}
                      </div>
                      <div>
                        <h3 className="font-bold text-sm">{sig.sym}</h3>
                        <p className="text-[10px] text-slate-500 uppercase font-bold">{sig.type} · {sig.bx} → {sig.sx}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-mono font-bold text-emerald-400">+{sig.spread}%</p>
                      <p className="text-[9px] text-slate-500 font-bold uppercase">Net Profit</p>
                    </div>
                  </div>

                  <div className="px-4 py-2 bg-slate-950/50 border-t border-slate-800/50 flex items-center justify-between text-[10px] font-mono">
                    <div className="flex items-center gap-4">
                      <span className="text-slate-500">Score: <span className="text-cyan-400">{sig.aiScore}</span></span>
                      <span className="text-slate-500">Time: <span className="text-slate-300">~5s</span></span>
                    </div>
                    <button className="text-cyan-400 font-bold hover:underline">EXECUTE ⚡</button>
                  </div>
                </div>
              )) : (
                <div className="py-20 text-center space-y-3">
                  <Search className="w-12 h-12 text-slate-800 mx-auto" />
                  <p className="text-slate-500 text-sm">Scanning market for opportunities...</p>
                </div>
              )}
            </motion.div>
          )}

          {page === 'vip' && (
            <motion.div 
              key="vip"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-6"
            >
              <div className="text-center space-y-2 py-6">
                <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center mx-auto border border-amber-500/20 shadow-2xl shadow-amber-500/20">
                  <Crown className="w-8 h-8 text-amber-500" />
                </div>
                <h2 className="text-2xl font-black tracking-tight text-amber-500">NEXARB VIP</h2>
                <p className="text-xs text-slate-400 max-w-[280px] mx-auto leading-relaxed">Unlock advanced arbitrage strategies, auto-trading, and 0.3% platform fees.</p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'week', name: 'Week', price: '$9' },
                  { id: 'month', name: 'Month', price: '$29', popular: true },
                  { id: 'year', name: 'Year', price: '$149' },
                ].map(p => (
                  <div 
                    key={p.id}
                    onClick={() => buyVip(p.id)}
                    className={`p-4 rounded-xl border text-center cursor-pointer transition-all ${p.popular ? 'bg-amber-500/5 border-amber-500/50' : 'bg-slate-900 border-slate-800 hover:border-slate-700'}`}
                  >
                    {p.popular && <div className="text-[8px] font-bold text-amber-500 mb-1 uppercase">Popular</div>}
                    <p className="text-[10px] font-bold text-slate-500 uppercase">{p.name}</p>
                    <p className="text-lg font-black text-amber-500">{p.price}</p>
                  </div>
                ))}
              </div>

              <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
                <div className="p-4 border-b border-slate-800 bg-slate-800/30">
                  <h3 className="text-xs font-bold uppercase tracking-widest">VIP Features</h3>
                </div>
                <div className="divide-y divide-slate-800">
                  {[
                    { icon: <Zap size={14}/>, name: '1000+ Signals/Day', free: '30', vip: '∞' },
                    { icon: <Bot size={14}/>, name: 'Auto-Trading 24/7', free: '❌', vip: '✅' },
                    { icon: <Shield size={14}/>, name: 'Platform Fee', free: '0.8%', vip: '0.3%' },
                    { icon: <TrendingUp size={14}/>, name: 'Triangular Arb', free: '❌', vip: '✅' },
                  ].map((f, i) => (
                    <div key={i} className="p-3 flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-2 text-slate-400">
                        {f.icon}
                        <span>{f.name}</span>
                      </div>
                      <div className="flex gap-4 font-mono">
                        <span className="text-slate-600">{f.free}</span>
                        <span className="text-emerald-400 font-bold">{f.vip}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {page === 'auto' && (
            <motion.div 
              key="auto"
              className="space-y-6"
            >
              <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${autoTrade ? 'bg-emerald-500/10 text-emerald-500 shadow-lg shadow-emerald-500/20' : 'bg-slate-800 text-slate-500'}`}>
                      <Bot size={24} />
                    </div>
                    <div>
                      <h2 className="font-bold">Auto-Trade Bot</h2>
                      <p className={`text-[10px] font-bold uppercase ${autoTrade ? 'text-emerald-500' : 'text-slate-500'}`}>
                        {autoTrade ? '● Running' : '○ Stopped'}
                      </p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={autoTrade} onChange={(e) => setAutoTrade(e.target.checked)} className="sr-only peer" />
                    <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                  </label>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Amount per trade</label>
                    <div className="relative">
                      <input 
                        type="number" 
                        value={amount} 
                        onChange={(e) => setAmount(Number(e.target.value))}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm font-mono focus:border-cyan-500 outline-none"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-500">USDT</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Min Spread %</label>
                      <input type="number" defaultValue={0.5} step={0.1} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm font-mono outline-none" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Max Risk</label>
                      <select className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm outline-none appearance-none">
                        <option>Low</option>
                        <option>Medium</option>
                        <option>High</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-cyan-500/5 border border-cyan-500/10 rounded-xl">
                  <p className="text-[10px] text-cyan-400 leading-relaxed">
                    <AlertCircle size={10} className="inline mr-1 mb-0.5" />
                    Bot will automatically execute signals matching your criteria. Ensure your connected exchanges have sufficient balance.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {page === 'exchanges' && (
            <motion.div key="exchanges" className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Connected Exchanges</h2>
                <button className="text-[10px] font-bold text-cyan-400 flex items-center gap-1"><Plus size={12}/> ADD NEW</button>
              </div>
              
              <div className="space-y-2">
                {EXCHS.map(ex => {
                  const isConnected = user.connected_exchanges.includes(ex.id);
                  return (
                    <div key={ex.id} className={`p-4 rounded-xl border flex items-center justify-between ${isConnected ? 'bg-slate-900 border-slate-800' : 'bg-slate-900/40 border-slate-800/50 opacity-60'}`}>
                      <div className="flex items-center gap-3">
                        <div className="text-2xl">{ex.logo}</div>
                        <div>
                          <h3 className="font-bold text-sm">{ex.name}</h3>
                          <p className="text-[10px] text-slate-500">Vol: {ex.vol} · Fee: {ex.taker}</p>
                        </div>
                      </div>
                      <div className={`px-2 py-1 rounded text-[8px] font-bold uppercase ${isConnected ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-slate-800 text-slate-500 border border-slate-700'}`}>
                        {isConnected ? 'Active' : 'Offline'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {page === 'profile' && (
            <motion.div key="profile" className="space-y-6">
              <div className="bg-gradient-to-br from-slate-900 to-slate-950 p-6 rounded-2xl border border-slate-800 text-center space-y-4">
                <div className="w-20 h-20 bg-gradient-to-br from-cyan-400 to-purple-500 rounded-2xl flex items-center justify-center mx-auto text-3xl shadow-xl shadow-cyan-500/20">👤</div>
                <div>
                  <h2 className="text-xl font-black tracking-tight">{user.id.slice(0, 8)}</h2>
                  <p className="text-[10px] text-slate-500 font-mono">ID: {user.id}</p>
                </div>
                <div className="flex justify-center gap-2">
                  {user.vip && <span className="bg-amber-500/10 text-amber-500 text-[9px] font-bold px-3 py-1 rounded-full border border-amber-500/20">👑 VIP ACTIVE</span>}
                  <span className="bg-cyan-500/10 text-cyan-400 text-[9px] font-bold px-3 py-1 rounded-full border border-cyan-500/20">📊 {user.trades} TRADES</span>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 px-2">Account Settings</h3>
                <div className="bg-slate-900 rounded-xl border border-slate-800 divide-y divide-slate-800">
                  <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-800/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <Globe size={18} className="text-slate-400" />
                      <span className="text-sm font-medium">Language</span>
                    </div>
                    <div className="flex gap-2">
                      {['ru', 'en'].map(l => (
                        <button 
                          key={l}
                          onClick={() => setLang(l)}
                          className={`w-8 h-8 rounded-lg text-[10px] font-bold uppercase border transition-all ${lang === l ? 'bg-cyan-500 border-cyan-400 text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-800/30 transition-colors" onClick={() => setAdminPanel(!adminPanel)}>
                    <div className="flex items-center gap-3">
                      <Settings size={18} className="text-slate-400" />
                      <span className="text-sm font-medium">Admin Panel</span>
                    </div>
                    <ArrowRight size={14} className="text-slate-600" />
                  </div>
                </div>
              </div>

              {adminPanel && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 space-y-4">
                  <h3 className="text-xs font-bold text-red-400 uppercase tracking-widest">Admin Controls</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <button className="bg-slate-800 p-2 rounded text-[10px] font-bold hover:bg-slate-700 transition-colors">Reset Database</button>
                    <button className="bg-slate-800 p-2 rounded text-[10px] font-bold hover:bg-slate-700 transition-colors">Export Logs</button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        )}
      </main>

      {/* Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900/90 backdrop-blur-xl border-t border-slate-800 px-4 pb-safe">
        <div className="max-w-md mx-auto flex items-center justify-between py-2">
          {[
            { id: 'signals', icon: <Zap size={20}/>, label: t('nav_signals') },
            { id: 'auto', icon: <Bot size={20}/>, label: t('auto_nav') },
            { id: 'exchanges', icon: <Shield size={20}/>, label: t('nav_exchanges') },
            { id: 'history', icon: <History size={20}/>, label: t('nav_history') },
            { id: 'profile', icon: <User size={20}/>, label: 'Profile' },
          ].map(item => (
            <button 
              key={item.id}
              onClick={() => setPage(item.id)}
              className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-all ${page === item.id ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {item.icon}
              <span className="text-[8px] font-bold uppercase tracking-tighter">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Trade Modal */}
      <AnimatePresence>
        {tradeModal && (
          <div className="fixed inset-0 z-[60] flex items-end justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setTradeModal(null)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl p-6 space-y-6 shadow-2xl"
            >
              <div className="w-12 h-1.5 bg-slate-800 rounded-full mx-auto mb-2" />
              
              <div className="space-y-1">
                <h3 className="text-xl font-black tracking-tight">Execute Arbitrage</h3>
                <p className="text-xs text-slate-500 font-medium">{tradeModal.sym} · {tradeModal.bx} → {tradeModal.sx}</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Trade Amount</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      value={amount} 
                      onChange={(e) => setAmount(Number(e.target.value))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-4 text-xl font-mono font-bold focus:border-cyan-500 outline-none"
                    />
                    <button 
                      onClick={() => setAmount(user.balance)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 bg-cyan-500/10 text-cyan-400 text-[10px] font-black px-3 py-1.5 rounded-lg border border-cyan-500/20"
                    >
                      MAX
                    </button>
                  </div>
                </div>

                <div className="bg-slate-950 rounded-2xl p-4 space-y-3 border border-slate-800/50">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Gross Profit (+{tradeModal.spread}%)</span>
                    <span className="text-emerald-400 font-mono font-bold">+${(amount * tradeModal.spread / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Platform Fee ({user.vip ? '0.3%' : '0.8%'})</span>
                    <span className="text-red-400 font-mono font-bold">-${(amount * (user.vip ? 0.003 : 0.008)).toFixed(2)}</span>
                  </div>
                  <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
                    <span className="text-sm font-bold">Estimated Net Profit</span>
                    <span className="text-lg font-mono font-black text-emerald-400">+${((amount * tradeModal.spread / 100) - (amount * (user.vip ? 0.003 : 0.008))).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <button 
                onClick={handleTrade}
                disabled={amount > user.balance}
                className="w-full bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 text-slate-900 font-black py-4 rounded-2xl shadow-xl shadow-cyan-500/20 transition-all transform active:scale-[0.98]"
              >
                {amount > user.balance ? 'INSUFFICIENT BALANCE' : 'CONFIRM ARBITRAGE ⚡'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
