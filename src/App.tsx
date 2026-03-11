import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { motion, AnimatePresence } from 'motion/react';
import {
  Zap, Bot, User, BarChart3, Layers,
  Crown, Lock, ChevronDown, ChevronUp,
  ArrowRight, Info, CheckCircle2, X, Search,
} from 'lucide-react';
import { COINS } from './constants';
import { LANGS } from './i18n';
import Admin from './Admin';
import Scanner from './components/Scanner';
import Strategies from './components/Strategies';
import Profile from './components/Profile';

const socket = io();

const TYPE_META: Record<string, { label: string; color: string; bg: string; border: string; icon: string }> = {
  cex:   { label:'CEX',        color:'text-cyan-400',   bg:'bg-cyan-500/8',    border:'border-cyan-500/25',   icon:'⚡' },
  tri:   { label:'TRIANGULAR', color:'text-purple-400', bg:'bg-purple-500/8',  border:'border-purple-500/25', icon:'🔺' },
  dex:   { label:'DEX',        color:'text-emerald-400',bg:'bg-emerald-500/8', border:'border-emerald-500/25',icon:'🌊' },
  cross: { label:'CROSS-CHAIN',color:'text-amber-400',  bg:'bg-amber-500/8',   border:'border-amber-500/25',  icon:'🔗' },
};

const COIN_ICONS: Record<string, string> = {
  BTC:'₿', ETH:'Ξ', SOL:'◎', BNB:'◈', XRP:'✕', DOGE:'Ð',
  ADA:'₳', AVAX:'▲', MATIC:'⬡', DOT:'●', TON:'💎', TRX:'⬡',
};

export default function App() {
  const [page, setPage] = useState('signals');
  const [lang, setLang] = useState('ru');
  const [user, setUser] = useState<any>(null);
  const [limits, setLimits] = useState<any>({ signals_max: 3, trades_max: 5, exchanges_max: 2, strategies: 'cex' });
  const [signals, setSignals] = useState<any[]>([]);
  const [prices, setPrices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tradeModal, setTradeModal] = useState<any>(null);
  const [amount, setAmount] = useState(200);
  const [autoTrade, setAutoTrade] = useState(false);
  const [adminPanel, setAdminPanel] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [notification, setNotification] = useState<string | null>(null);
  const [feeExpanded, setFeeExpanded] = useState(false);
  const [userId, setUserId] = useState('demo_user');

  const t = (k: string) => LANGS[lang]?.[k] || LANGS['ru'][k] || k;

  useEffect(() => {
    initUser();
    socket.on('signals', (s: any[]) => setSignals(s));
    socket.on('prices',  (p: any[]) => setPrices(p));
    socket.on('broadcast', (n: any) => setNotification('📢 ' + n.message));
    return () => { socket.off('signals'); socket.off('prices'); socket.off('broadcast'); };
  }, []);

  const initUser = async () => {
    try {
      const tg = (window as any).Telegram?.WebApp;
      const tgUser = tg?.initDataUnsafe?.user;
      const uid = tgUser?.id ? `tg_${tgUser.id}` : 'demo_user';
      setUserId(uid);
      const res = await axios.get(`/api/v1/account?userId=${uid}`);
      setUser(res.data);
      if (res.data.limits) setLimits(res.data.limits);
      socket.on(`notify:${uid}`, (n: any) => setNotification('🔔 ' + n.message));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  // Fee calculator
  const calcFees = (sig: any, amt: number, isVip: boolean) => {
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

  const handleTrade = async () => {
    if (!tradeModal || !user) return;
    try {
      const res = await axios.post('/api/v1/trades', {
        userId, symbol: tradeModal.sym, amount,
        spread: tradeModal.spread, buyExchange: tradeModal.bx,
        sellExchange: tradeModal.sx, type: tradeModal.type,
      });
      setUser((u: any) => ({ ...u, balance: res.data.newBalance, trades: u.trades + 1, profit: u.profit + res.data.netProfit }));
      setTradeModal(null);
      setNotification(`✅ Сделка исполнена: +$${res.data.netProfit.toFixed(4)}`);
    } catch (err: any) {
      setNotification('❌ ' + (err.response?.data?.error || 'Ошибка'));
    }
  };

  const buyVip = async (plan: string) => {
    try {
      await axios.post('/api/v1/vip/subscribe', { userId, plan });
      setUser((u: any) => ({ ...u, vip: true }));
      setLimits({ signals_max: 999, trades_max: 999, exchanges_max: 999, strategies: 'all' });
      setNotification('👑 VIP активирован!');
      setPage('signals');
    } catch { setNotification('❌ Ошибка оплаты'); }
  };

  // ── Compute visible signals based on free limits ──
  const allFiltered = filterType === 'all' ? signals : signals.filter(s => s.type === filterType);
  const visibleCount = user?.vip ? allFiltered.length : Math.min(allFiltered.length, limits.signals_max);
  const visibleSignals = allFiltered.slice(0, visibleCount);
  const lockedSignals  = user?.vip ? [] : allFiltered.slice(visibleCount, visibleCount + 3);

  if (loading) return (
    <div className="h-screen bg-slate-950 flex flex-col items-center justify-center gap-4">
      <div className="relative w-14 h-14">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-400 to-purple-600 animate-pulse" />
        <div className="absolute inset-0.5 rounded-xl bg-slate-950 flex items-center justify-center font-black text-xl text-cyan-400">N∞</div>
      </div>
      <p className="text-[9px] font-bold uppercase tracking-[.3em] text-slate-700 animate-pulse">Загрузка...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">

      {/* ── NOTIFICATION ── */}
      <AnimatePresence>
        {notification && (
          <motion.div initial={{ y:-40, opacity:0 }} animate={{ y:0, opacity:1 }} exit={{ y:-40, opacity:0 }}
            className="fixed top-0 inset-x-0 z-[80] bg-slate-800/95 backdrop-blur border-b border-slate-700 px-4 py-2.5 flex items-center justify-between text-xs font-medium"
          >
            <span>{notification}</span>
            <button onClick={() => setNotification(null)}><X size={13} className="text-slate-500"/></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── HEADER ── */}
      <header className={`sticky z-40 bg-slate-900/92 backdrop-blur-xl border-b border-slate-800 px-4 py-3 transition-all ${notification ? 'top-[38px]' : 'top-0'}`}>
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative w-9 h-9 flex-shrink-0">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-cyan-400 to-purple-600" />
              <div className="absolute inset-0.5 rounded-[10px] bg-slate-900 flex items-center justify-center font-black text-sm text-cyan-400">N∞</div>
            </div>
            <div>
              <h1 className="text-base font-black tracking-tight leading-none">NEX<span className="text-cyan-400">ARB</span></h1>
              <p className="text-[7px] text-slate-600 font-mono uppercase tracking-[.2em]">Multi-Strategy HFT</p>
            </div>
          </div>
          <button onClick={() => setPage(user?.vip ? 'profile' : 'vip')}
            className={`px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-wider transition-all border ${
              user?.vip
                ? 'bg-amber-500/8 border-amber-500/35 text-amber-400'
                : 'bg-cyan-500/8 border-cyan-500/35 text-cyan-400 hover:bg-cyan-500/12'
            }`}
          >{user?.vip ? '👑 Кабинет' : '⚡ Стать VIP'}</button>
        </div>

        {/* Stats */}
        <div className="max-w-md mx-auto grid grid-cols-3 gap-2 mt-3">
          {[
            { label:'Баланс',   value:`$${(user?.balance||0).toLocaleString('en',{maximumFractionDigits:2})}`, color:'text-cyan-400'   },
            { label:'Прибыль',  value:`+$${(user?.profit||0).toFixed(2)}`,                                      color:'text-emerald-400' },
            { label:'Сигналов', value:`${signals.length}`,                                                       color:'text-purple-400'  },
          ].map((s, i) => (
            <div key={i} className="bg-slate-800/35 rounded-xl p-2 border border-slate-700/35">
              <p className="text-[6px] text-slate-600 uppercase font-black tracking-wider">{s.label}</p>
              <p className={`text-sm font-mono font-black ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Free limit warning */}
        {!user?.vip && (
          <div className="max-w-md mx-auto mt-2">
            <div className="flex items-center justify-between bg-amber-500/5 border border-amber-500/15 rounded-xl px-3 py-1.5">
              <div className="flex items-center gap-1.5">
                <Lock size={9} className="text-amber-400" />
                <span className="text-[8px] text-amber-400/80 font-bold">Free: {limits.signals_max} сигнала · {limits.trades_max} сделок/день · {limits.exchanges_max} биржи</span>
              </div>
              <button onClick={() => setPage('vip')} className="text-[8px] text-amber-400 font-black hover:text-amber-300">VIP →</button>
            </div>
          </div>
        )}
      </header>

      {/* ── MAIN ── */}
      <main className="max-w-md mx-auto p-4 pb-24">
        {adminPanel ? (
          <Admin onBack={() => setAdminPanel(false)} />
        ) : (
          <AnimatePresence mode="wait">

            {/* ── SIGNALS PAGE ── */}
            {page === 'signals' && (
              <motion.div key="signals" initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }} className="space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800/50">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-4 rounded-full bg-gradient-to-b from-cyan-400 to-purple-500" />
                    <h2 className="text-[8px] font-black uppercase tracking-[.2em] text-slate-500">Арбитражные Сигналы</h2>
                  </div>
                  <span className="text-[8px] font-mono text-slate-600">{visibleCount} из {allFiltered.length}</span>
                </div>

                {/* Type filter */}
                <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
                  {[
                    { id:'all',   label:'Все' },
                    { id:'cex',   label:'CEX ⚡' },
                    { id:'tri',   label:'Tri 🔺' },
                    { id:'dex',   label:'DEX 🌊' },
                    { id:'cross', label:'Cross 🔗' },
                  ].map(f => {
                    const meta = TYPE_META[f.id];
                    return (
                      <button key={f.id} onClick={() => setFilterType(f.id)}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-wider border transition-all ${
                          filterType === f.id
                            ? `bg-slate-800 border-slate-600 ${meta?.color || 'text-slate-300'}`
                            : 'bg-slate-900/40 border-slate-800/50 text-slate-700 hover:border-slate-700'
                        }`}
                      >{f.label}</button>
                    );
                  })}
                </div>

                {/* Visible signals */}
                {visibleSignals.map(sig => {
                  const meta = TYPE_META[sig.type] || TYPE_META['cex'];
                  const coinSym = sig.sym.split('/')[0];
                  const canExecute = !sig.vipOnly || user?.vip;
                  const fees = calcFees(sig, amount, user?.vip);
                  return (
                    <motion.div key={sig.id} whileTap={{ scale:0.99 }}
                      onClick={() => canExecute ? setTradeModal(sig) : setPage('vip')}
                      className={`relative rounded-2xl border overflow-hidden cursor-pointer transition-all ${
                        sig.hot ? `${meta.border} ${meta.bg}` : 'border-slate-800/60 bg-slate-900/50 hover:border-slate-700/60'
                      }`}
                    >
                      {sig.hot && <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent" />}
                      <div className="p-3.5 flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center text-lg font-black flex-shrink-0 ${meta.bg} ${meta.border}`}>
                          {COIN_ICONS[coinSym] || '◈'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                            <h3 className="font-black text-sm leading-none">{sig.sym}</h3>
                            <span className={`text-[7px] font-black px-1.5 py-0.5 rounded border ${meta.bg} ${meta.border} ${meta.color}`}>{meta.icon} {meta.label}</span>
                            {sig.hot && <span className="text-[7px] text-emerald-400 font-black">🔥</span>}
                            {sig.vipOnly && !user?.vip && <span className="text-[7px] text-amber-400 font-black">👑 VIP</span>}
                          </div>
                          <p className="text-[8px] text-slate-600 font-mono truncate">{sig.bx} → {sig.sx}{sig.network ? ` · ${sig.network}` : ''}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`text-xl font-black font-mono ${meta.color}`}>+{sig.spread}%</p>
                          <p className="text-[7px] text-slate-600 font-mono">≈+${(amount * sig.spread / 100).toFixed(2)}</p>
                        </div>
                      </div>
                      <div className="px-3.5 py-2 bg-slate-950/30 border-t border-slate-800/40 flex items-center justify-between">
                        <div className="flex gap-3 text-[8px] font-mono">
                          <span className="text-slate-600">AI <span className="text-cyan-400/80">{sig.aiScore}</span></span>
                          <span className="text-slate-600">Net <span className="text-emerald-400/80">+{sig.net}%</span></span>
                        </div>
                        <span className={`text-[8px] font-black ${meta.color}`}>{canExecute ? 'EXECUTE ⚡' : 'VIP ↗'}</span>
                      </div>
                    </motion.div>
                  );
                })}

                {/* Locked signals (blurred) — only for free users */}
                {lockedSignals.map((sig, i) => {
                  const meta = TYPE_META[sig.type] || TYPE_META['cex'];
                  return (
                    <div key={`locked-${i}`} className="relative rounded-2xl border border-slate-800/40 overflow-hidden cursor-pointer" onClick={() => setPage('vip')}>
                      {/* Blurred content */}
                      <div className="p-3.5 flex items-center gap-3 blur-sm select-none pointer-events-none">
                        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center text-lg font-black ${meta.bg} ${meta.border}`}>◈</div>
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <h3 className="font-black text-sm">???/USDT</h3>
                            <span className={`text-[7px] font-black px-1.5 py-0.5 rounded border ${meta.bg} ${meta.border} ${meta.color}`}>{meta.icon} {meta.label}</span>
                          </div>
                          <p className="text-[8px] text-slate-600 font-mono">??? → ???</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-xl font-black font-mono ${meta.color}`}>+?.??%</p>
                        </div>
                      </div>
                      {/* Lock overlay */}
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 backdrop-blur-[2px]">
                        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 px-4 py-2 rounded-2xl">
                          <Lock size={12} className="text-amber-400" />
                          <span className="text-[9px] font-black text-amber-400 uppercase tracking-wider">Разблокировать в VIP</span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Empty state */}
                {allFiltered.length === 0 && (
                  <div className="py-16 text-center space-y-3">
                    <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-800/30 border border-slate-800 flex items-center justify-center">
                      <Search size={18} className="text-slate-700" />
                    </div>
                    <p className="text-slate-600 text-xs font-mono animate-pulse">Сканирование рынков...</p>
                  </div>
                )}

                {/* VIP promo at bottom if free */}
                {!user?.vip && (
                  <div onClick={() => setPage('vip')} className="cursor-pointer rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-black text-amber-400">Получите все {signals.length}+ сигналов</p>
                      <p className="text-[9px] text-slate-500 mt-0.5">DEX · Triangular · Cross-chain · Авто-трейдинг</p>
                    </div>
                    <div className="flex items-center gap-1 text-amber-400 text-xs font-black">👑 VIP <ArrowRight size={12}/></div>
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
                {!user?.vip ? (
                  <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 text-center space-y-3">
                    <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center"><Bot size={24} className="text-amber-400"/></div>
                    <h3 className="font-black text-amber-400">Авто-трейдинг — только VIP</h3>
                    <p className="text-xs text-slate-500">Автоматическое исполнение сигналов 24/7 доступно только на VIP тарифе.</p>
                    <button onClick={() => setPage('vip')} className="btn bg-amber-500/10 border border-amber-500/30 text-amber-400 font-black text-sm px-6 py-2.5 rounded-xl">👑 Обновиться до VIP</button>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
                    <div className="p-5 flex items-center justify-between border-b border-slate-800">
                      <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center border transition-all ${autoTrade ? 'border-emerald-500/40 bg-emerald-500/8 text-emerald-400' : 'border-slate-700 bg-slate-800 text-slate-500'}`}>
                          <Bot size={22}/>
                        </div>
                        <div>
                          <h2 className="font-black">Auto-Trade Bot</h2>
                          <p className={`text-[9px] font-black uppercase ${autoTrade ? 'text-emerald-400' : 'text-slate-600'}`}>{autoTrade ? '● Активен' : '○ Остановлен'}</p>
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={autoTrade} onChange={e => setAutoTrade(e.target.checked)} className="sr-only peer" />
                        <div className="w-11 h-6 bg-slate-800 border border-slate-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-[18px] after:w-[18px] after:transition-all peer-checked:bg-cyan-500/20 peer-checked:border-cyan-500/50" />
                      </label>
                    </div>
                    <div className="p-4">
                      <p className="text-[10px] text-slate-500">Настройте в <button onClick={() => setPage('profile')} className="text-cyan-400 font-black underline">Профиль → Авто-трейдинг</button></p>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── VIP ── */}
            {page === 'vip' && (
              <motion.div key="vip" initial={{ opacity:0, scale:0.97 }} animate={{ opacity:1, scale:1 }} className="space-y-5">
                <div className="text-center py-6 space-y-2">
                  <motion.div animate={{ rotate:[0,5,-5,0] }} transition={{ duration:3.5, repeat:Infinity }}
                    className="w-20 h-20 bg-amber-500/8 border border-amber-500/20 rounded-3xl flex items-center justify-center mx-auto"
                  ><Crown size={36} className="text-amber-400"/></motion.div>
                  <h2 className="text-3xl font-black">NEXARB <span className="text-amber-400">VIP</span></h2>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">Полный доступ ко всем 4 стратегиям, 7 сетям, авто-трейдингу и минимальной комиссии.</p>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id:'week',  label:'7 дней',  price:'$9',   sub:'$1.28/день' },
                    { id:'month', label:'1 месяц', price:'$29',  sub:'$0.96/день', popular:true },
                    { id:'year',  label:'1 год',   price:'$149', sub:'$0.41/день' },
                  ].map(p => (
                    <motion.div key={p.id} whileTap={{ scale:0.97 }} onClick={() => buyVip(p.id)}
                      className={`p-4 rounded-2xl border text-center cursor-pointer transition-all ${p.popular ? 'bg-amber-500/5 border-amber-500/35' : 'bg-slate-900 border-slate-800 hover:border-slate-700'}`}
                    >
                      {p.popular && <p className="text-[7px] font-black text-amber-400 uppercase tracking-wider mb-1">Популярный</p>}
                      <p className="text-[8px] text-slate-500 uppercase">{p.label}</p>
                      <p className="text-2xl font-black text-amber-400 my-1">{p.price}</p>
                      <p className="text-[7px] text-slate-600">{p.sub}</p>
                    </motion.div>
                  ))}
                </div>

                <div className="rounded-2xl border border-slate-800 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/40">
                    <h3 className="text-[8px] font-black uppercase tracking-[.15em] text-slate-500">VIP vs Free</h3>
                  </div>
                  {[
                    ['⚡','Сигналов','3','∞'],
                    ['🤖','Авто-трейдинг 24/7','—','✅'],
                    ['💸','Комиссия платформы','0.8%','0.3%'],
                    ['🌊','DEX + Tri + Cross-chain','—','✅'],
                    ['🌐','7 сетей (ETH/SOL/TON...)','—','✅'],
                    ['🏦','Подключение бирж','2','∞'],
                    ['👥','Реферальная программа','—','10%'],
                  ].map(([icon,name,free,vip],i) => (
                    <div key={i} className={`px-4 py-2.5 flex items-center justify-between text-[10px] ${i<6?'border-b border-slate-800/40':''}`}>
                      <div className="flex items-center gap-2 text-slate-400"><span>{icon}</span><span>{name as string}</span></div>
                      <div className="flex gap-4 font-mono items-center">
                        <span className="text-slate-600 w-10 text-right">{free as string}</span>
                        <span className="text-emerald-400 font-black w-10 text-right">{vip as string}</span>
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
      <nav className="fixed bottom-0 inset-x-0 z-50 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800/70">
        <div className="max-w-md mx-auto flex items-center justify-around py-2 px-2">
          {[
            { id:'signals',    icon:<Zap size={18}/>,      label:'Сигналы' },
            { id:'scanner',    icon:<BarChart3 size={18}/>, label:'Сканер' },
            { id:'strategies', icon:<Layers size={18}/>,    label:'Стратегии' },
            { id:'auto',       icon:<Bot size={18}/>,       label:'Авто' },
            { id:'profile',    icon:<User size={18}/>,      label:'Профиль' },
          ].map(item => (
            <button key={item.id} onClick={() => setPage(item.id)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all ${
                page === item.id ? 'text-cyan-400 bg-cyan-500/8' : 'text-slate-600 hover:text-slate-400'
              }`}
            >
              {item.icon}
              <span className={`text-[6px] font-black uppercase tracking-wider ${page===item.id?'text-cyan-400':'text-slate-700'}`}>{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* ── TRADE MODAL ── */}
      <AnimatePresence>
        {tradeModal && user && (() => {
          const fees = calcFees(tradeModal, amount, user.vip);
          const meta = TYPE_META[tradeModal.type] || TYPE_META['cex'];
          const insufficient = amount > user.balance || amount <= 0;
          const profitable   = fees.net > 0;
          return (
            <div className="fixed inset-0 z-[70] flex items-end justify-center">
              <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                onClick={() => setTradeModal(null)}
                className="absolute inset-0 bg-slate-950/88 backdrop-blur-md"
              />
              <motion.div initial={{ y:'100%' }} animate={{ y:0 }} exit={{ y:'100%' }}
                transition={{ type:'spring', damping:28, stiffness:280 }}
                className="relative w-full max-w-md bg-slate-900 border-t border-slate-700/50 rounded-t-3xl shadow-2xl max-h-[90vh] overflow-y-auto"
              >
                {/* Gradient line */}
                <div className={`h-px w-full ${profitable ? 'bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent' : 'bg-gradient-to-r from-transparent via-red-400/70 to-transparent'}`} />
                <div className="w-10 h-1 bg-slate-700/80 rounded-full mx-auto mt-3" />

                <div className="px-5 py-4 space-y-4">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[7px] font-black px-2 py-0.5 rounded border uppercase ${meta.bg} ${meta.border} ${meta.color}`}>{meta.icon} {meta.label}</span>
                        {tradeModal.hot && <span className="text-[7px] text-emerald-400 font-black">🔥 HOT</span>}
                      </div>
                      <h3 className="text-xl font-black">{tradeModal.sym}</h3>
                      <p className="text-[9px] text-slate-500 font-mono">{tradeModal.bx} <ArrowRight size={7} className="inline"/> {tradeModal.sx}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-3xl font-black font-mono ${meta.color}`}>+{tradeModal.spread}%</p>
                      <p className="text-[8px] text-slate-600">gross spread</p>
                    </div>
                  </div>

                  {/* Amount input */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[8px] font-black text-slate-600 uppercase tracking-wider">Сумма сделки</span>
                      <button onClick={() => setAmount(Math.floor(user.balance))} className={`text-[8px] font-black ${meta.color}`}>MAX ${Math.floor(user.balance)}</button>
                    </div>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-mono">$</span>
                      <input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))}
                        className="w-full bg-slate-800 border border-slate-700 rounded-2xl pl-8 pr-4 py-3.5 text-xl font-mono font-black focus:border-cyan-500/50 outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[100, 200, 500, 1000].map(v => (
                        <button key={v} onClick={() => setAmount(v)}
                          className={`py-1.5 rounded-xl text-[9px] font-black border transition-all ${amount===v ? `${meta.bg} ${meta.border} ${meta.color}` : 'border-slate-800 text-slate-600 hover:border-slate-700'}`}
                        >${v}</button>
                      ))}
                    </div>
                  </div>

                  {/* Fee breakdown */}
                  <div className="rounded-2xl border border-slate-800 overflow-hidden">
                    <button onClick={() => setFeeExpanded(x => !x)}
                      className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-800/35 text-left hover:bg-slate-800/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Info size={9} className="text-slate-600" />
                        <span className="text-[8px] font-black uppercase tracking-wider text-slate-600">Детализация комиссий</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[8px] font-mono text-red-400 font-bold">−${fees.total.toFixed(4)}</span>
                        {feeExpanded ? <ChevronUp size={9} className="text-slate-600"/> : <ChevronDown size={9} className="text-slate-600"/>}
                      </div>
                    </button>

                    <AnimatePresence>
                      {feeExpanded && (
                        <motion.div initial={{ height:0 }} animate={{ height:'auto' }} exit={{ height:0 }} className="overflow-hidden">
                          <div className="px-4 py-3 space-y-2 bg-slate-900/50 border-t border-slate-800/50">
                            <div className="flex justify-between text-[9px] pb-2 border-b border-slate-800/40">
                              <span className="text-slate-500">📈 Валовая прибыль (+{tradeModal.spread}%)</span>
                              <span className="text-emerald-400 font-mono font-bold">+${fees.gross.toFixed(4)}</span>
                            </div>
                            <div className="flex justify-between text-[9px]">
                              <span className="text-slate-500">🏦 NEXARB платформа ({(fees.feeRate*100).toFixed(1)}%{user?.vip?', VIP':',  Free'})</span>
                              <span className="text-red-400 font-mono">−${fees.platform.toFixed(4)}</span>
                            </div>
                            <div className="flex justify-between text-[9px]">
                              <span className="text-slate-500">📊 {tradeModal.bx} биржа (0.1%)</span>
                              <span className="text-red-400 font-mono">−${fees.exFeeA.toFixed(4)}</span>
                            </div>
                            {tradeModal.type !== 'cross' && (
                              <div className="flex justify-between text-[9px]">
                                <span className="text-slate-500">📊 {tradeModal.sx} биржа (0.1%)</span>
                                <span className="text-red-400 font-mono">−${fees.exFeeB.toFixed(4)}</span>
                              </div>
                            )}
                            {fees.networkFee > 0 && (
                              <div className="flex justify-between text-[9px]">
                                <span className="text-slate-500">⛽ Газ сети ({tradeModal.type==='cross'?'0.2%':'0.3%'})</span>
                                <span className="text-red-400 font-mono">−${fees.networkFee.toFixed(4)}</span>
                              </div>
                            )}
                            {fees.slippage > 0 && (
                              <div className="flex justify-between text-[9px]">
                                <span className="text-slate-500">📉 Slippage DEX (0.1%)</span>
                                <span className="text-red-400 font-mono">−${fees.slippage.toFixed(4)}</span>
                              </div>
                            )}
                            <div className="flex justify-between text-[9px] pt-2 border-t border-slate-800/40">
                              <span className="text-slate-500 font-bold">Итого удержано</span>
                              <span className="text-red-400 font-mono font-bold">−${fees.total.toFixed(4)}</span>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Net result */}
                    <div className="px-4 py-3 flex items-center justify-between bg-slate-800/20 border-t border-slate-800/40">
                      <div>
                        <p className="text-[7px] font-black uppercase tracking-wider text-slate-600">Чистая прибыль</p>
                        <p className="text-[8px] text-slate-600 mt-0.5">${amount.toFixed(0)} × {tradeModal.spread}% − ${fees.total.toFixed(4)} комиссий</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-2xl font-black font-mono ${profitable ? 'text-emerald-400' : 'text-red-400'}`}>
                          {profitable ? '+' : ''}{fees.net.toFixed(4)}$
                        </p>
                        {!user.vip && fees.net > 0 && (
                          <p className="text-[7px] text-amber-400 font-bold">VIP: +${calcFees(tradeModal, amount, true).net.toFixed(4)}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* AI score */}
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={9} className="text-slate-700" />
                    <p className="text-[8px] text-slate-600">AI Score: <span className="text-cyan-400 font-bold">{tradeModal.aiScore}/100</span>{tradeModal.bridge ? ` · Bridge: ${tradeModal.bridge}` : ''}</p>
                  </div>

                  {/* CTA */}
                  <button onClick={handleTrade} disabled={insufficient || !profitable}
                    className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-wider transition-all active:scale-[0.98] mb-1 ${
                      insufficient
                        ? 'bg-slate-800 border border-slate-700 text-slate-600'
                        : !profitable
                        ? 'bg-red-500/8 border border-red-500/25 text-red-400'
                        : 'bg-gradient-to-r from-cyan-500 to-purple-600 hover:opacity-90 text-slate-900 shadow-xl shadow-cyan-500/15'
                    }`}
                  >
                    {insufficient ? '⊘ Недостаточно средств' : !profitable ? `⊘ Спред слишком мал (${fees.net.toFixed(4)}$)` : `⚡ Исполнить · +$${fees.net.toFixed(4)}`}
                  </button>

                  <p className="text-[7px] text-slate-700 text-center pb-1">
                    Сделка исполняется мгновенно. Результат зачисляется сразу на баланс.
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
