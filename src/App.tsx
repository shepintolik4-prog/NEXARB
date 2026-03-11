import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { motion, AnimatePresence } from 'motion/react';
import {
  Zap, Bot, User, BarChart3, Layers, Crown,
  Shield, TrendingUp, Search, AlertCircle, X,
  ArrowRight, Info, CheckCircle2, ChevronDown, ChevronUp
} from 'lucide-react';
import { COINS } from './constants';
import { LANGS } from './i18n';
import Admin from './Admin';
import Scanner from './components/Scanner';
import Strategies from './components/Strategies';
import Profile from './components/Profile';

const socket = io();

const TYPE_META: Record<string, { label: string; color: string; bg: string; border: string; icon: string; fees: string[] }> = {
  cex:   { label:'CEX',        color:'text-cyan-400',   bg:'bg-cyan-500/8',    border:'border-cyan-500/25',   icon:'⚡', fees:['exchange_a','exchange_b'] },
  tri:   { label:'TRIANGULAR', color:'text-purple-400', bg:'bg-purple-500/8',  border:'border-purple-500/25', icon:'🔺', fees:['exchange_a','exchange_b'] },
  dex:   { label:'DEX',        color:'text-emerald-400',bg:'bg-emerald-500/8', border:'border-emerald-500/25',icon:'🌊', fees:['exchange_a','network','slippage'] },
  cross: { label:'CROSS-CHAIN',color:'text-amber-400',  bg:'bg-amber-500/8',   border:'border-amber-500/25',  icon:'🔗', fees:['exchange_a','network'] },
};

const COIN_ICONS: Record<string, string> = {
  BTC:'₿', ETH:'Ξ', SOL:'◎', BNB:'◈', XRP:'✕', DOGE:'Ð',
  ADA:'₳', AVAX:'🔺', MATIC:'⬡', DOT:'●', TON:'💎', TRX:'⬡',
};

interface TradeSignal {
  id: string; type: string; sym: string; bx: string; sx: string;
  spread: number; net: number; buyPrice: number; sellPrice: number;
  aiScore: number; hot?: boolean; vipOnly?: boolean; network?: string; bridge?: string;
}

export default function App() {
  const [page, setPage] = useState('signals');
  const [lang, setLang] = useState('ru');
  const [user, setUser] = useState<any>(null);
  const [signals, setSignals] = useState<TradeSignal[]>([]);
  const [prices, setPrices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tradeModal, setTradeModal] = useState<TradeSignal | null>(null);
  const [amount, setAmount] = useState(200);
  const [autoTrade, setAutoTrade] = useState(false);
  const [adminPanel, setAdminPanel] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [notification, setNotification] = useState<string|null>(null);
  const [feeExpanded, setFeeExpanded] = useState(false);

  const t = (key: string) => LANGS[lang]?.[key] || LANGS['ru'][key] || key;

  useEffect(() => {
    fetchAccount();
    socket.on('signals', (s: TradeSignal[]) => setSignals(s));
    socket.on('prices',  (p: any[]) => setPrices(p));
    socket.on('broadcast', (n: any) => setNotification(n.message));
    return () => { socket.off('signals'); socket.off('prices'); socket.off('broadcast'); };
  }, []);

  const fetchAccount = async () => {
    try {
      const tg = (window as any).Telegram?.WebApp;
      const tgUser = tg?.initDataUnsafe?.user;
      const userId = tgUser?.id ? `tg_${tgUser.id}` : 'demo_user';
      const res = await axios.get(`/api/v1/account?userId=${userId}`);
      setUser(res.data);
      socket.on(`notify:${userId}`, (n: any) => setNotification(n.message));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleTrade = async () => {
    if (!tradeModal || !user) return;
    try {
      const res = await axios.post('/api/v1/trades', {
        userId: user.id, symbol: tradeModal.sym, amount,
        spread: tradeModal.spread, buyExchange: tradeModal.bx,
        sellExchange: tradeModal.sx, type: tradeModal.type,
      });
      setUser({ ...user, balance: res.data.newBalance, trades: user.trades + 1, profit: user.profit + res.data.netProfit });
      setTradeModal(null);
      setNotification(`✅ Сделка исполнена: +$${res.data.netProfit.toFixed(4)}`);
    } catch (err: any) {
      setNotification('❌ ' + (err.response?.data?.error || 'Ошибка сделки'));
    }
  };

  const buyVip = async (plan: string) => {
    try {
      await axios.post('/api/v1/vip/subscribe', { userId: user.id, plan });
      setUser({ ...user, vip: true });
      setNotification('👑 VIP активирован!');
      setPage('signals');
    } catch { setNotification('❌ Ошибка оплаты'); }
  };

  // Fee calculator
  const calcFees = (sig: TradeSignal, amt: number, isVip: boolean) => {
    const feeRate    = isVip ? 0.003 : 0.008;
    const networkFee = sig.type === 'cross' ? amt * 0.002 : sig.type === 'dex' ? amt * 0.003 : 0;
    const exFeeA     = amt * 0.001;
    const exFeeB     = amt * 0.001;
    const slippage   = sig.type === 'dex' ? amt * 0.001 : 0;
    const platform   = amt * feeRate;
    const total      = platform + networkFee + exFeeA + exFeeB + slippage;
    const gross      = amt * (sig.spread / 100);
    const net        = gross - total;
    return { platform, networkFee, exFeeA, exFeeB, slippage, total, gross, net, feeRate };
  };

  const filteredSignals = filterType === 'all' ? signals : signals.filter(s => s.type === filterType);

  if (loading) return (
    <div className="h-screen bg-slate-950 flex flex-col items-center justify-center gap-4">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-400 to-purple-600 animate-pulse" />
        <div className="absolute inset-0.5 rounded-xl bg-slate-950 flex items-center justify-center font-bold text-xl text-cyan-400">N∞</div>
      </div>
      <p className="text-[10px] font-bold uppercase tracking-[.3em] text-slate-600 animate-pulse">Initializing Engine</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">

      {/* ── NOTIFICATION BANNER ── */}
      <AnimatePresence>
        {notification && (
          <motion.div initial={{ y:-40, opacity:0 }} animate={{ y:0, opacity:1 }} exit={{ y:-40, opacity:0 }}
            className="fixed top-0 left-0 right-0 z-[80] bg-slate-900 border-b border-slate-700 px-4 py-3 flex items-center justify-between text-sm"
          >
            <span>{notification}</span>
            <button onClick={()=>setNotification(null)}><X size={14} className="text-slate-500"/></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── HEADER ── */}
      <header className={`sticky z-40 bg-slate-900/90 backdrop-blur-xl border-b border-slate-800 px-4 py-3 transition-all ${notification ? 'top-[42px]' : 'top-0'}`}>
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative w-9 h-9">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-cyan-400 to-purple-600 opacity-80" />
              <div className="absolute inset-0.5 rounded-[10px] bg-slate-900 flex items-center justify-center font-black text-base text-cyan-400">N∞</div>
            </div>
            <div>
              <h1 className="text-base font-black tracking-tight leading-none">NEX<span className="text-cyan-400">ARB</span><span className="text-[10px] text-slate-600 font-normal ml-1">Pro</span></h1>
              <p className="text-[8px] text-slate-600 font-mono uppercase tracking-[.2em]">HFT · Multi-Strategy</p>
            </div>
          </div>
          <button onClick={() => setPage(user?.vip ? 'profile' : 'vip')}
            className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider transition-all ${
              user?.vip
                ? 'bg-amber-500/10 border border-amber-500/40 text-amber-400 hover:bg-amber-500/15'
                : 'bg-cyan-500/10 border border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/15'
            }`}
          >{user?.vip ? `👑 Cabinet` : '⚡ Upgrade'}</button>
        </div>

        {/* Stats bar */}
        <div className="max-w-md mx-auto grid grid-cols-3 gap-2 mt-3">
          {[
            { label: 'Balance',       value: `$${(user?.balance||0).toLocaleString('en',{maximumFractionDigits:2})}`, color: 'text-cyan-400' },
            { label: 'Profit',        value: `+$${(user?.profit||0).toFixed(2)}`, color: 'text-emerald-400' },
            { label: 'Signals',       value: `${signals.length}`, color: 'text-purple-400' },
          ].map((s, i) => (
            <div key={i} className="bg-slate-800/40 rounded-xl p-2 border border-slate-700/40">
              <p className="text-[7px] text-slate-600 uppercase font-black tracking-wider">{s.label}</p>
              <p className={`text-sm font-mono font-black ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      </header>

      {/* ── MAIN ── */}
      <main className="max-w-md mx-auto p-4 pb-24">
        {adminPanel ? (
          <Admin onBack={() => setAdminPanel(false)} />
        ) : (
          <AnimatePresence mode="wait">

            {/* ── SIGNALS ── */}
            {page === 'signals' && (
              <motion.div key="signals" initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }} className="space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-4 rounded-full bg-gradient-to-b from-cyan-400 to-purple-500" />
                    <h2 className="text-[9px] font-black uppercase tracking-[.2em] text-slate-500">Arbitrage Signals</h2>
                  </div>
                  <span className="text-[9px] font-mono text-slate-600">{filteredSignals.length} live</span>
                </div>

                {/* Type filter */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                  {[
                    { id:'all',   label:'All',         color:'text-slate-300' },
                    { id:'cex',   label:'CEX ⚡',      color:'text-cyan-400' },
                    { id:'tri',   label:'Triangular 🔺',color:'text-purple-400' },
                    { id:'dex',   label:'DEX 🌊',      color:'text-emerald-400' },
                    { id:'cross', label:'Cross 🔗',    color:'text-amber-400' },
                  ].map(f => (
                    <button key={f.id} onClick={() => setFilterType(f.id)}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider border transition-all ${
                        filterType === f.id
                          ? `bg-slate-800 border-slate-600 ${f.color}`
                          : 'bg-slate-900/40 border-slate-800/60 text-slate-700 hover:border-slate-700'
                      }`}
                    >{f.label}</button>
                  ))}
                </div>

                {filteredSignals.length > 0 ? filteredSignals.map(sig => {
                  const meta = TYPE_META[sig.type] || TYPE_META['cex'];
                  const coinSym = sig.sym.split('/')[0];
                  const coinIcon = COIN_ICONS[coinSym] || '◈';
                  const fees = calcFees(sig, amount, user?.vip);
                  return (
                    <motion.div key={sig.id}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => { if (!sig.vipOnly || user?.vip) setTradeModal(sig); else setPage('vip'); }}
                      className={`relative rounded-2xl border overflow-hidden cursor-pointer transition-all ${
                        sig.hot ? `${meta.border} ${meta.bg}` : 'border-slate-800/70 bg-slate-900/60 hover:border-slate-700'
                      }`}
                    >
                      {sig.hot && (
                        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent" />
                      )}
                      <div className="p-4 flex items-center gap-3">
                        {/* Coin icon */}
                        <div className={`w-11 h-11 rounded-xl border flex items-center justify-center text-xl font-bold flex-shrink-0 ${meta.bg} ${meta.border}`}>
                          {coinIcon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <h3 className="font-black text-sm">{sig.sym}</h3>
                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md border ${meta.bg} ${meta.border} ${meta.color}`}>
                              {meta.icon} {meta.label}
                            </span>
                            {sig.hot && <span className="text-[8px] font-black text-emerald-400">🔥 HOT</span>}
                            {sig.vipOnly && !user?.vip && <span className="text-[8px] font-black text-amber-400">👑 VIP</span>}
                          </div>
                          <p className="text-[9px] text-slate-500 font-mono truncate">
                            {sig.bx} <span className="text-slate-700">→</span> {sig.sx}
                            {sig.network && <span className="text-slate-600"> · {sig.network}</span>}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`text-2xl font-black font-mono ${meta.color}`}>+{sig.spread}%</p>
                          <p className="text-[8px] text-slate-600 font-mono">
                            net ~+${(amount * sig.spread / 100).toFixed(2)}
                          </p>
                        </div>
                      </div>
                      <div className="px-4 py-2 bg-slate-950/40 border-t border-slate-800/50 flex items-center justify-between">
                        <div className="flex items-center gap-3 text-[9px] font-mono">
                          <span className="text-slate-600">AI <span className="text-cyan-400">{sig.aiScore}</span></span>
                          <span className="text-slate-600">Net <span className="text-emerald-400">+{sig.net}%</span></span>
                        </div>
                        <span className={`text-[9px] font-black ${meta.color}`}>
                          {sig.vipOnly && !user?.vip ? 'UNLOCK ↗' : 'EXECUTE ⚡'}
                        </span>
                      </div>
                    </motion.div>
                  );
                }) : (
                  <div className="py-20 text-center space-y-3">
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-800/40 border border-slate-800 flex items-center justify-center">
                      <Search size={20} className="text-slate-700" />
                    </div>
                    <p className="text-slate-600 text-xs font-mono animate-pulse">Scanning markets...</p>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── SCANNER ── */}
            {page === 'scanner' && (
              <motion.div key="scanner" initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }}>
                <Scanner prices={prices} />
              </motion.div>
            )}

            {/* ── STRATEGIES ── */}
            {page === 'strategies' && (
              <motion.div key="strategies" initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }}>
                <Strategies user={user} t={t} onUpgrade={() => setPage('vip')} />
              </motion.div>
            )}

            {/* ── AUTO ── */}
            {page === 'auto' && (
              <motion.div key="auto" initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }} className="space-y-4">
                <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
                  <div className="p-5 flex items-center justify-between border-b border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center border transition-all ${autoTrade ? 'border-emerald-500/40 bg-emerald-500/8 text-emerald-400' : 'border-slate-700 bg-slate-800 text-slate-500'}`}>
                        <Bot size={22} />
                      </div>
                      <div>
                        <h2 className="font-black">Auto-Trade Bot</h2>
                        <p className={`text-[9px] font-black uppercase tracking-wider ${autoTrade ? 'text-emerald-400' : 'text-slate-600'}`}>
                          {autoTrade ? '● Running' : '○ Stopped'}
                        </p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={autoTrade} onChange={e => setAutoTrade(e.target.checked)} className="sr-only peer" />
                      <div className="w-11 h-6 bg-slate-800 border border-slate-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-[18px] after:w-[18px] after:transition-all peer-checked:bg-cyan-500/20 peer-checked:border-cyan-500/50" />
                    </label>
                  </div>
                  <div className="p-4">
                    <div className="flex items-start gap-2 bg-cyan-500/5 border border-cyan-500/15 rounded-xl p-3">
                      <AlertCircle size={12} className="text-cyan-400 mt-0.5 flex-shrink-0" />
                      <p className="text-[10px] text-cyan-300/80 leading-relaxed">
                        Настройте параметры авто-трейдинга в{' '}
                        <button onClick={() => setPage('profile')} className="text-cyan-400 font-black underline underline-offset-2">
                          Профиль → Авто-трейдинг
                        </button>
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── VIP ── */}
            {page === 'vip' && (
              <motion.div key="vip" initial={{ opacity:0, scale:0.97 }} animate={{ opacity:1, scale:1 }} className="space-y-5">
                <div className="text-center space-y-2 py-6">
                  <motion.div
                    animate={{ rotate: [0, 5, -5, 0], scale: [1, 1.05, 1] }}
                    transition={{ duration: 3, repeat: Infinity }}
                    className="w-20 h-20 bg-amber-500/10 border border-amber-500/25 rounded-3xl flex items-center justify-center mx-auto"
                  >
                    <Crown size={36} className="text-amber-400" />
                  </motion.div>
                  <h2 className="text-3xl font-black tracking-tight">NEXARB <span className="text-amber-400">VIP</span></h2>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                    Полный доступ ко всем 4 стратегиям, 7 сетям, авто-трейдингу и минимальным комиссиям.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id:'week',  label:'7 дней',   price:'$9',   sub:'$1.28/day' },
                    { id:'month', label:'1 месяц',  price:'$29',  sub:'$0.96/day', popular:true },
                    { id:'year',  label:'1 год',    price:'$149', sub:'$0.40/day' },
                  ].map(p => (
                    <motion.div key={p.id} whileTap={{ scale:0.97 }}
                      onClick={() => buyVip(p.id)}
                      className={`p-4 rounded-2xl border text-center cursor-pointer transition-all ${
                        p.popular
                          ? 'bg-amber-500/6 border-amber-500/40 shadow-lg shadow-amber-500/5'
                          : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {p.popular && <p className="text-[8px] font-black text-amber-400 uppercase tracking-wider mb-1">Popular</p>}
                      <p className="text-[9px] font-bold text-slate-500 uppercase">{p.label}</p>
                      <p className="text-2xl font-black text-amber-400 my-1">{p.price}</p>
                      <p className="text-[8px] text-slate-600">{p.sub}</p>
                    </motion.div>
                  ))}
                </div>

                <div className="rounded-2xl border border-slate-800 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-900/50 border-b border-slate-800">
                    <h3 className="text-[9px] font-black uppercase tracking-[.15em] text-slate-500">Что включено</h3>
                  </div>
                  {[
                    ['⚡', '1000+ сигналов в день', '30', '∞', true],
                    ['🤖', 'Авто-трейдинг 24/7', '—', '✅', true],
                    ['💸', 'Комиссия платформы', '0.8%', '0.3%', true],
                    ['🌊', 'DEX + Triangular + Cross', '—', '✅', true],
                    ['🌐', '7 блокчейн-сетей', '—', '✅', true],
                    ['👥', 'Реферальная программа', '—', '10%', false],
                  ].map(([icon, name, free, vip, hot], i) => (
                    <div key={i} className={`px-4 py-3 flex items-center justify-between text-[11px] border-b border-slate-800/50 ${i===5?'border-0':''}`}>
                      <div className="flex items-center gap-2 text-slate-400">
                        <span>{icon}</span><span>{name as string}</span>
                        {hot && <span className="text-[7px] text-emerald-400 font-black">HOT</span>}
                      </div>
                      <div className="flex gap-4 font-mono items-center">
                        <span className="text-slate-600">{free as string}</span>
                        <span className="text-emerald-400 font-black">{vip as string}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── PROFILE ── */}
            {page === 'profile' && (
              <motion.div key="profile" initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }}>
                <Profile user={user} lang={lang} setLang={setLang} t={t} onUpgrade={() => setPage('vip')} />
              </motion.div>
            )}

          </AnimatePresence>
        )}
      </main>

      {/* ── BOTTOM NAV ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800/80">
        <div className="max-w-md mx-auto flex items-center justify-around py-2 px-2">
          {[
            { id:'signals',    icon:<Zap size={19}/>,      label:'Signals' },
            { id:'scanner',    icon:<BarChart3 size={19}/>, label:'Scanner' },
            { id:'strategies', icon:<Layers size={19}/>,    label:'Strategy' },
            { id:'auto',       icon:<Bot size={19}/>,       label:'Auto' },
            { id:'profile',    icon:<User size={19}/>,      label:'Profile' },
          ].map(item => (
            <button key={item.id} onClick={() => setPage(item.id)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all ${
                page === item.id
                  ? 'text-cyan-400 bg-cyan-500/8'
                  : 'text-slate-600 hover:text-slate-400'
              }`}
            >
              {item.icon}
              <span className={`text-[7px] font-black uppercase tracking-wider ${page===item.id?'text-cyan-400':'text-slate-700'}`}>{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* ── TRADE MODAL ── */}
      <AnimatePresence>
        {tradeModal && user && (() => {
          const fees = calcFees(tradeModal, amount, user.vip);
          const meta = TYPE_META[tradeModal.type] || TYPE_META['cex'];
          const insufficient = amount > user.balance;
          const profitable   = fees.net > 0;
          return (
            <div className="fixed inset-0 z-[70] flex items-end justify-center">
              <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                onClick={() => setTradeModal(null)}
                className="absolute inset-0 bg-slate-950/85 backdrop-blur-md"
              />
              <motion.div initial={{ y:'100%' }} animate={{ y:0 }} exit={{ y:'100%' }}
                transition={{ type:'spring', damping:30, stiffness:300 }}
                className="relative w-full max-w-md bg-slate-900 border-t border-slate-700/60 rounded-t-3xl shadow-2xl overflow-hidden"
              >
                {/* Top bar */}
                <div className={`h-0.5 w-full ${profitable ? 'bg-gradient-to-r from-transparent via-emerald-400 to-transparent' : 'bg-gradient-to-r from-transparent via-red-400 to-transparent'}`} />
                <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mt-3 mb-0" />

                <div className="px-5 py-4 space-y-4">

                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded-md border uppercase ${meta.bg} ${meta.border} ${meta.color}`}>
                          {meta.icon} {meta.label}
                        </span>
                        {tradeModal.hot && <span className="text-[8px] text-emerald-400 font-black">🔥 HOT</span>}
                      </div>
                      <h3 className="text-xl font-black tracking-tight">{tradeModal.sym}</h3>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                        {tradeModal.bx} <ArrowRight size={8} className="inline mx-0.5"/> {tradeModal.sx}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-3xl font-black font-mono ${meta.color}`}>+{tradeModal.spread}%</p>
                      <p className="text-[9px] text-slate-600 font-mono">gross spread</p>
                    </div>
                  </div>

                  {/* Amount input */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[9px] font-black text-slate-600 uppercase tracking-wider">Сумма сделки</label>
                      <button onClick={() => setAmount(Math.floor(user.balance))} className={`text-[9px] font-black ${meta.color} hover:opacity-80`}>MAX ${Math.floor(user.balance)}</button>
                    </div>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-mono font-bold">$</span>
                      <input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))}
                        className="w-full bg-slate-800 border border-slate-700 rounded-2xl pl-8 pr-4 py-3.5 text-xl font-mono font-black focus:border-cyan-500/60 outline-none transition-colors"
                      />
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[100, 200, 500, 1000].map(v => (
                        <button key={v} onClick={() => setAmount(v)}
                          className={`py-1.5 rounded-xl text-[10px] font-black border transition-all ${amount===v ? `${meta.bg} ${meta.border} ${meta.color}` : 'border-slate-800 text-slate-600 hover:border-slate-700'}`}
                        >${v}</button>
                      ))}
                    </div>
                  </div>

                  {/* Fee breakdown */}
                  <div className="rounded-2xl border border-slate-800 overflow-hidden">
                    <button onClick={() => setFeeExpanded(!feeExpanded)}
                      className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-800/40 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <Info size={10} className="text-slate-500" />
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">Детализация комиссий</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-mono text-red-400">-${fees.total.toFixed(4)}</span>
                        {feeExpanded ? <ChevronUp size={10} className="text-slate-600"/> : <ChevronDown size={10} className="text-slate-600"/>}
                      </div>
                    </button>

                    {feeExpanded && (
                      <div className="px-4 py-3 space-y-2 bg-slate-900/40 border-t border-slate-800/60">
                        {/* Gross profit */}
                        <div className="flex justify-between text-[10px] pb-2 border-b border-slate-800/50">
                          <span className="text-slate-500">Валовая прибыль (+{tradeModal.spread}%)</span>
                          <span className="text-emerald-400 font-mono font-bold">+${fees.gross.toFixed(4)}</span>
                        </div>
                        {/* Platform fee */}
                        <div className="flex justify-between text-[10px]">
                          <span className="text-slate-500">🏦 Платформа NEXARB ({(fees.feeRate*100).toFixed(1)}%)</span>
                          <span className="text-red-400 font-mono">-${fees.platform.toFixed(4)}</span>
                        </div>
                        {/* Exchange fee A */}
                        <div className="flex justify-between text-[10px]">
                          <span className="text-slate-500">📊 Биржа {tradeModal.bx} (0.1%)</span>
                          <span className="text-red-400 font-mono">-${fees.exFeeA.toFixed(4)}</span>
                        </div>
                        {/* Exchange fee B — only for CEX/tri */}
                        {tradeModal.type !== 'cross' && (
                          <div className="flex justify-between text-[10px]">
                            <span className="text-slate-500">📊 Биржа {tradeModal.sx} (0.1%)</span>
                            <span className="text-red-400 font-mono">-${fees.exFeeB.toFixed(4)}</span>
                          </div>
                        )}
                        {/* Network fee */}
                        {fees.networkFee > 0 && (
                          <div className="flex justify-between text-[10px]">
                            <span className="text-slate-500">⛽ Газ / сеть ({tradeModal.type==='cross'?'0.2%':'0.3%'})</span>
                            <span className="text-red-400 font-mono">-${fees.networkFee.toFixed(4)}</span>
                          </div>
                        )}
                        {/* Slippage */}
                        {fees.slippage > 0 && (
                          <div className="flex justify-between text-[10px]">
                            <span className="text-slate-500">📉 Slippage DEX (0.1%)</span>
                            <span className="text-red-400 font-mono">-${fees.slippage.toFixed(4)}</span>
                          </div>
                        )}
                        {/* Total fees line */}
                        <div className="flex justify-between text-[10px] pt-2 border-t border-slate-800/50">
                          <span className="text-slate-500 font-bold">Итого комиссий</span>
                          <span className="text-red-400 font-mono font-bold">-${fees.total.toFixed(4)}</span>
                        </div>
                      </div>
                    )}

                    {/* Net result — always visible */}
                    <div className={`px-4 py-3 flex items-center justify-between ${feeExpanded ? 'border-t border-slate-800/60' : ''} bg-slate-800/20`}>
                      <div>
                        <p className="text-[8px] font-black uppercase tracking-wider text-slate-600">Чистая прибыль</p>
                        <p className="text-[9px] text-slate-600 mt-0.5">
                          ${amount.toFixed(0)} × {tradeModal.spread}% − ${fees.total.toFixed(4)} комиссий
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-2xl font-black font-mono ${profitable ? 'text-emerald-400' : 'text-red-400'}`}>
                          {profitable ? '+' : ''}{fees.net.toFixed(4)}$
                        </p>
                        {!user.vip && (
                          <p className="text-[8px] text-amber-400 font-bold">VIP: +${calcFees(tradeModal, amount, true).net.toFixed(4)}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Info row */}
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={10} className="text-slate-600" />
                    <p className="text-[9px] text-slate-600">
                      AI Score: <span className="text-cyan-400 font-bold">{tradeModal.aiScore}/100</span>
                      {tradeModal.bridge && <span> · Bridge: <span className="text-amber-400">{tradeModal.bridge}</span></span>}
                    </p>
                  </div>

                  {/* CTA */}
                  <button onClick={handleTrade}
                    disabled={insufficient || !profitable}
                    className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-wider transition-all active:scale-[0.98] ${
                      insufficient
                        ? 'bg-slate-800 border border-slate-700 text-slate-600'
                        : !profitable
                        ? 'bg-red-500/10 border border-red-500/30 text-red-400'
                        : 'bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-slate-900 shadow-xl shadow-cyan-500/20'
                    }`}
                  >
                    {insufficient
                      ? '⊘ Insufficient Balance'
                      : !profitable
                      ? `⊘ Spread too low (net ${fees.net.toFixed(4)}$)`
                      : `⚡ Execute Arbitrage · +$${fees.net.toFixed(4)}`
                    }
                  </button>

                  <p className="text-[8px] text-slate-700 text-center pb-1">
                    Сделка исполняется автоматически. Результат зачисляется мгновенно.
                  </p>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
