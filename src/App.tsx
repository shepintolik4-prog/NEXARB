import React, { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { motion, AnimatePresence } from 'motion/react';
import {
  Zap, Bot, User, BarChart3, Layers, Crown, Lock,
  ChevronDown, ChevronUp, ArrowRight, Info, CheckCircle2,
  X, SlidersHorizontal, Search, RefreshCw, TrendingUp,
  Activity, Shield, TestTube, FlaskConical,
} from 'lucide-react';
import Scanner from './components/Scanner';
import Strategies from './components/Strategies';
import Profile from './components/Profile';
import { LANGS } from './i18n';

const socket = io();

// ── CONSTANTS ────────────────────────────────────────────────
const TYPE_META: Record<string, { label: string; color: string; bg: string; border: string; glow: string; icon: string }> = {
  cex:   { label:'CEX',        color:'text-cyan-400',    bg:'bg-cyan-500/8',     border:'border-cyan-500/20',   glow:'shadow-cyan-500/10',   icon:'⚡' },
  tri:   { label:'TRIANGULAR', color:'text-violet-400',  bg:'bg-violet-500/8',   border:'border-violet-500/20', glow:'shadow-violet-500/10', icon:'△' },
  dex:   { label:'DEX',        color:'text-emerald-400', bg:'bg-emerald-500/8',  border:'border-emerald-500/20',glow:'shadow-emerald-500/10',icon:'◈' },
  cross: { label:'CROSS-CHAIN',color:'text-amber-400',   bg:'bg-amber-500/8',    border:'border-amber-500/20',  glow:'shadow-amber-500/10',  icon:'⬡' },
};

const COIN_COLORS: Record<string, string> = {
  BTC:'#F7931A', ETH:'#627EEA', SOL:'#9945FF', BNB:'#F0B90B', XRP:'#00AAE4',
  ADA:'#0033AD', AVAX:'#E84142', DOT:'#E6007A', MATIC:'#8247E5', TON:'#0088CC',
  TRX:'#EF0027', DOGE:'#C2A633', LINK:'#375BD2', UNI:'#FF007A', ARB:'#2D9CDB',
};

const COIN_ICONS: Record<string, string> = {
  BTC:'₿', ETH:'Ξ', SOL:'◎', BNB:'◈', XRP:'✕', DOGE:'Ð', ADA:'₳',
  AVAX:'▲', MATIC:'⬡', DOT:'●', TON:'💎', TRX:'T', LINK:'⬡', UNI:'🦄',
  LTC:'Ł', BCH:'₿', SHIB:'🐶', PEPE:'🐸', WIF:'🐕',
};

// ── SOCKET ────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState<string>('signals');
  const [lang, setLang] = useState('ru');
  const [user, setUser] = useState<any>(null);
  const [limits, setLimits] = useState<any>({ signals_max:3, trades_max:5, exchanges_max:2, strategies:'cex' });
  const [signals, setSignals] = useState<any[]>([]);
  const [prices, setPrices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tradeModal, setTradeModal] = useState<any>(null);
  const [amount, setAmount] = useState(200);
  const [feeExpanded, setFeeExpanded] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [notification, setNotification] = useState<{ msg:string; type:'ok'|'err'|'info' } | null>(null);
  const [tradingMode, setTradingMode] = useState<'demo'|'real'>('demo');

  // Filter state
  const [filterType, setFilterType] = useState<string>('all');
  const [filterNetwork, setFilterNetwork] = useState<string>('all');
  const [filterMinSpread, setFilterMinSpread] = useState<number>(0);
  const [filterSearch, setFilterSearch] = useState<string>('');
  const [filterMinAI, setFilterMinAI] = useState<number>(0);

  const [exchanges, setExchanges] = useState<any[]>([]);
  const [networks, setNetworks] = useState<any[]>([]);

  const notifTimer = useRef<any>(null);
  const userId = useRef<string>('demo_user');

  const t = (k: string) => LANGS[lang]?.[k] || LANGS['ru'][k] || k;

  const notify = (msg: string, type: 'ok'|'err'|'info' = 'ok') => {
    setNotification({ msg, type });
    if (notifTimer.current) clearTimeout(notifTimer.current);
    notifTimer.current = setTimeout(() => setNotification(null), 3500);
  };

  // ── INIT ──────────────────────────────────────────────────
  useEffect(() => {
    initUser();
    socket.on('signals', (s: any[]) => setSignals(s));
    socket.on('prices',  (p: any[]) => setPrices(p));
    socket.on('broadcast', (n: any) => notify('📢 ' + n.message, 'info'));
    socket.on('meta', (m: any) => {
      if (m.exchanges) setExchanges(m.exchanges);
      if (m.networks)  setNetworks(m.networks);
    });
    // Load static data
    axios.get('/api/v1/exchanges').then(r => setExchanges(r.data)).catch(() => {});
    axios.get('/api/v1/networks').then(r => setNetworks(r.data)).catch(() => {});
    return () => { socket.off('signals'); socket.off('prices'); socket.off('broadcast'); socket.off('meta'); };
  }, []);

  const initUser = async () => {
    try {
      const tg = (window as any).Telegram?.WebApp;
      tg?.expand?.();
      const tgUser = tg?.initDataUnsafe?.user;
      const uid = tgUser?.id ? `tg_${tgUser.id}` : 'demo_user';
      userId.current = uid;

      // Auth with Telegram data
      const res = await axios.post('/api/v1/auth', { user: tgUser || null });
      const u = res.data;
      setUser(u);
      setLimits(u.limits);
      setTradingMode(u.trade_mode || 'demo');

      // Subscribe to personal notifications
      socket.on(`notify:${uid}`, (n: any) => notify('🔔 ' + n.message, 'info'));
    } catch (err) {
      console.error('Auth error:', err);
      // Fallback — load guest
      try {
        const res = await axios.get('/api/v1/account?userId=demo_user');
        setUser(res.data);
        setLimits(res.data.limits);
      } catch {}
    } finally {
      setLoading(false);
    }
  };

  // ── TRADE MODE SWITCH ─────────────────────────────────────
  const switchTradeMode = async (mode: 'demo' | 'real') => {
    setTradingMode(mode);
    setUser((u: any) => ({ ...u, trade_mode: mode }));
    try {
      await axios.patch('/api/v1/account', { userId: userId.current, trade_mode: mode });
      notify(mode === 'demo' ? '🧪 Демо режим активирован' : '⚡ Реальная торговля активирована', 'ok');
    } catch {}
  };

  // ── FEE CALC ──────────────────────────────────────────────
  const calcFees = (sig: any, amt: number, isVip: boolean) => {
    const feeRate    = isVip ? 0.003 : 0.008;
    const networkFee = sig.type==='cross' ? amt*0.002 : sig.type==='dex' ? amt*0.003 : 0;
    const exFeeA     = amt * 0.001;
    const exFeeB     = amt * 0.001;
    const slippage   = sig.type==='dex' ? amt*0.001 : 0;
    const platform   = amt * feeRate;
    const total      = platform + networkFee + exFeeA + exFeeB + slippage;
    const gross      = amt * (sig.spread / 100);
    const net        = gross - total;
    return { platform, networkFee, exFeeA, exFeeB, slippage, total, gross, net, feeRate };
  };

  // ── HANDLE TRADE ─────────────────────────────────────────
  const handleTrade = async () => {
    if (!tradeModal || !user) return;
    try {
      const res = await axios.post('/api/v1/trades', {
        userId: userId.current,
        symbol: tradeModal.sym, amount,
        spread: tradeModal.spread, buyExchange: tradeModal.bx,
        sellExchange: tradeModal.sx, type: tradeModal.type,
        mode: tradingMode,
      });
      const d = res.data;
      setUser((u: any) => ({
        ...u,
        balance:      tradingMode==='real' ? d.newBalance : u.balance,
        demo_balance: tradingMode==='demo' ? d.newBalance : u.demo_balance,
        profit:       tradingMode==='real' ? (u.profit||0)+d.net : u.profit,
        demo_profit:  tradingMode==='demo' ? (u.demo_profit||0)+d.net : u.demo_profit,
        trades:       tradingMode==='real' ? (u.trades||0)+1 : u.trades,
        demo_trades:  tradingMode==='demo' ? (u.demo_trades||0)+1 : u.demo_trades,
      }));
      setTradeModal(null);
      notify(`✅ ${tradingMode==='demo'?'[DEMO] ':''}+$${d.net.toFixed(4)} исполнено`, 'ok');
    } catch (err: any) {
      notify('❌ ' + (err.response?.data?.error || 'Ошибка'), 'err');
    }
  };

  const buyVip = async (plan: string) => {
    try {
      await axios.post('/api/v1/vip/subscribe', { userId: userId.current, plan });
      setUser((u: any) => ({ ...u, vip: true }));
      setLimits({ signals_max:9999, trades_max:9999, exchanges_max:9999, strategies:'all' });
      notify('👑 VIP активирован!', 'ok');
      setPage('signals');
    } catch { notify('❌ Ошибка оплаты', 'err'); }
  };

  // ── FILTER LOGIC ─────────────────────────────────────────
  const filteredSignals = signals.filter(s => {
    if (filterType !== 'all' && s.type !== filterType) return false;
    if (filterNetwork !== 'all') {
      if (s.type === 'cex' || s.type === 'tri') return false;
      if (s.type === 'dex' && s.network !== filterNetwork) return false;
      if (s.type === 'cross' && s.bx !== filterNetwork && s.sx !== filterNetwork) return false;
    }
    if (filterMinSpread > 0 && s.spread < filterMinSpread) return false;
    if (filterMinAI > 0 && s.aiScore < filterMinAI) return false;
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      if (!s.sym.toLowerCase().includes(q) && !s.bx.toLowerCase().includes(q) && !s.sx.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const visibleSigs = user?.vip ? filteredSignals : filteredSignals.slice(0, limits.signals_max);
  const lockedSigs  = user?.vip ? [] : filteredSignals.slice(limits.signals_max, limits.signals_max + 3);

  const activeBalance = tradingMode === 'real' ? (user?.balance || 0) : (user?.demo_balance || 0);
  const activeProfit  = tradingMode === 'real' ? (user?.profit  || 0) : (user?.demo_profit  || 0);

  // ── LOADING SCREEN ────────────────────────────────────────
  if (loading) return (
    <div className="h-screen bg-[#020812] flex flex-col items-center justify-center gap-5">
      <motion.div animate={{ scale:[1,.95,1] }} transition={{ duration:2, repeat:Infinity }}
        className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-400 via-blue-500 to-purple-600" />
        <div className="absolute inset-0.5 rounded-xl bg-[#020812] flex items-center justify-center font-black text-xl bg-gradient-to-br from-cyan-400 to-purple-500 bg-clip-text text-transparent">N∞</div>
        <motion.div animate={{ rotate:360 }} transition={{ duration:3, repeat:Infinity, ease:'linear' }}
          className="absolute -inset-1 rounded-2xl border border-cyan-500/20 border-t-cyan-500/80" />
      </motion.div>
      <div className="space-y-1 text-center">
        <p className="text-[9px] font-black uppercase tracking-[.35em] text-slate-700 animate-pulse">Загрузка NEXARB</p>
        <p className="text-[7px] text-slate-800 font-mono">Connecting to market data...</p>
      </div>
    </div>
  );

  // ── MAIN RENDER ───────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#020812] text-slate-200 font-sans overflow-x-hidden">

      {/* ── NOTIFICATION BANNER ── */}
      <AnimatePresence>
        {notification && (
          <motion.div initial={{ y:-50, opacity:0 }} animate={{ y:0, opacity:1 }} exit={{ y:-50, opacity:0 }}
            className={`fixed top-0 inset-x-0 z-[90] flex items-center justify-between px-4 py-3 text-xs font-semibold backdrop-blur-xl border-b
              ${notification.type==='ok'  ? 'bg-emerald-950/90 border-emerald-700/50 text-emerald-300'
              : notification.type==='err' ? 'bg-red-950/90 border-red-700/50 text-red-300'
              :                             'bg-slate-900/95 border-slate-700/50 text-slate-200'}`}
          >
            <span>{notification.msg}</span>
            <button onClick={() => setNotification(null)}><X size={13} className="opacity-50"/></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── HEADER ── */}
      <header className="sticky top-0 z-40 bg-[#020812]/95 backdrop-blur-2xl border-b border-slate-800/60">
        <div className="max-w-md mx-auto px-4 py-3">

          {/* Top row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="relative w-9 h-9">
                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-cyan-400 to-purple-600" />
                <div className="absolute inset-[1.5px] rounded-[9px] bg-[#020812] flex items-center justify-center text-[10px] font-black">
                  <span className="bg-gradient-to-br from-cyan-400 to-purple-500 bg-clip-text text-transparent">N∞</span>
                </div>
              </div>
              <div>
                <h1 className="text-[15px] font-black tracking-tight">NEX<span className="text-cyan-400">ARB</span></h1>
                <p className="text-[6px] text-slate-700 font-mono uppercase tracking-[.18em]">
                  {user?.tg_username ? `@${user.tg_username}` : 'Multi-Strategy HFT'}
                </p>
              </div>
            </div>

            {/* Demo / Real toggle */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-0.5">
                <button onClick={() => switchTradeMode('demo')}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-[9px] text-[8px] font-black uppercase transition-all ${
                    tradingMode==='demo' ? 'bg-violet-500/20 border border-violet-500/40 text-violet-400' : 'text-slate-600 hover:text-slate-400'
                  }`}>
                  <FlaskConical size={8}/> Demo
                </button>
                <button onClick={() => user?.vip ? switchTradeMode('real') : setPage('vip')}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-[9px] text-[8px] font-black uppercase transition-all ${
                    tradingMode==='real' ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-400' : 'text-slate-600 hover:text-slate-400'
                  }`}>
                  <Zap size={8}/> Real
                </button>
              </div>

              <button onClick={() => setPage(user?.vip ? 'profile' : 'vip')}
                className={`p-2 rounded-xl border transition-all ${
                  user?.vip ? 'bg-amber-500/8 border-amber-500/30 text-amber-400' : 'bg-slate-800/60 border-slate-700/60 text-slate-500 hover:text-slate-300'
                }`}>
                {user?.vip ? <Crown size={14}/> : <User size={14}/>}
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2">
            <div className="relative bg-slate-900/60 rounded-xl p-2.5 border border-slate-800/50 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/3 to-transparent" />
              <p className="text-[6px] text-slate-600 uppercase font-black tracking-wider mb-0.5">
                {tradingMode==='demo' ? '💧 Демо баланс' : '💰 Баланс'}
              </p>
              <p className="text-[13px] font-black font-mono text-cyan-400 leading-none">
                ${activeBalance.toLocaleString('en', {maximumFractionDigits:2})}
              </p>
            </div>
            <div className="relative bg-slate-900/60 rounded-xl p-2.5 border border-slate-800/50 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/3 to-transparent" />
              <p className="text-[6px] text-slate-600 uppercase font-black tracking-wider mb-0.5">Прибыль</p>
              <p className={`text-[13px] font-black font-mono leading-none ${activeProfit>=0?'text-emerald-400':'text-red-400'}`}>
                {activeProfit>=0?'+':''}{activeProfit.toFixed(2)}$
              </p>
            </div>
            <div className="relative bg-slate-900/60 rounded-xl p-2.5 border border-slate-800/50 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500/3 to-transparent" />
              <p className="text-[6px] text-slate-600 uppercase font-black tracking-wider mb-0.5">Сигналов</p>
              <p className="text-[13px] font-black font-mono text-violet-400 leading-none">{signals.length}</p>
            </div>
          </div>

          {/* Free limit bar */}
          {!user?.vip && (
            <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }}
              className="flex items-center justify-between mt-2 bg-amber-500/5 border border-amber-500/15 rounded-xl px-3 py-1.5">
              <div className="flex items-center gap-1.5">
                <Lock size={8} className="text-amber-500/70"/>
                <span className="text-[7px] text-amber-500/70 font-bold">Free: {limits.signals_max} сигнала · {limits.trades_max} сделок · {limits.exchanges_max} биржи</span>
              </div>
              <button onClick={() => setPage('vip')} className="text-[7px] text-amber-400 font-black hover:text-amber-300">VIP →</button>
            </motion.div>
          )}
        </div>
      </header>

      {/* ── CONTENT ── */}
      <main className="max-w-md mx-auto px-4 pb-24 pt-3">
        <AnimatePresence mode="wait">

          {/* ════════════ SIGNALS PAGE ════════════ */}
          {page === 'signals' && (
            <motion.div key="signals" initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }} className="space-y-3">

              {/* Filter bar */}
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <Search size={10} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600"/>
                  <input value={filterSearch} onChange={e => setFilterSearch(e.target.value)}
                    placeholder="Поиск по токену или бирже..."
                    className="w-full bg-slate-900/60 border border-slate-800/60 rounded-xl py-2 pl-8 pr-3 text-[10px] text-slate-300 placeholder-slate-700 outline-none focus:border-slate-600"
                  />
                </div>
                <button onClick={() => setFilterOpen(x => !x)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[9px] font-black border transition-all ${
                    filterOpen ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-400' : 'bg-slate-900/60 border-slate-800/60 text-slate-500 hover:text-slate-300'
                  }`}>
                  <SlidersHorizontal size={11}/>
                  Фильтр
                  {(filterType!=='all'||filterNetwork!=='all'||filterMinSpread>0||filterMinAI>0) && (
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 block"/>
                  )}
                </button>
              </div>

              {/* Expanded filter panel */}
              <AnimatePresence>
                {filterOpen && (
                  <motion.div initial={{ height:0, opacity:0 }} animate={{ height:'auto', opacity:1 }} exit={{ height:0, opacity:0 }}
                    className="overflow-hidden">
                    <div className="bg-slate-900/80 border border-slate-800/60 rounded-2xl p-4 space-y-4">

                      {/* Strategy type */}
                      <div>
                        <p className="text-[7px] font-black uppercase tracking-[.15em] text-slate-600 mb-2">Тип стратегии</p>
                        <div className="flex flex-wrap gap-1.5">
                          {[{id:'all',l:'Все'},{id:'cex',l:'⚡ CEX'},{id:'tri',l:'△ Tri'},{id:'dex',l:'◈ DEX'},{id:'cross',l:'⬡ Cross'}].map(f => {
                            const m = TYPE_META[f.id];
                            return (
                              <button key={f.id} onClick={() => setFilterType(f.id)}
                                className={`px-2.5 py-1 rounded-lg text-[8px] font-black border transition-all ${
                                  filterType===f.id ? `${m?.bg||'bg-slate-800'} ${m?.border||'border-slate-600'} ${m?.color||'text-slate-300'}` : 'bg-transparent border-slate-800 text-slate-600 hover:border-slate-700'
                                }`}>{f.l}</button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Network filter */}
                      <div>
                        <p className="text-[7px] font-black uppercase tracking-[.15em] text-slate-600 mb-2">Сеть</p>
                        <div className="flex flex-wrap gap-1.5">
                          <button onClick={() => setFilterNetwork('all')}
                            className={`px-2.5 py-1 rounded-lg text-[8px] font-black border transition-all ${filterNetwork==='all'?'bg-slate-800 border-slate-600 text-slate-300':'bg-transparent border-slate-800 text-slate-600'}`}>
                            Все
                          </button>
                          {networks.slice(0,10).map(n => (
                            <button key={n.id} onClick={() => setFilterNetwork(n.id)}
                              className={`px-2.5 py-1 rounded-lg text-[8px] font-black border transition-all ${filterNetwork===n.id?'bg-slate-800 border-slate-600 text-white':'bg-transparent border-slate-800 text-slate-600 hover:border-slate-700'}`}
                              style={filterNetwork===n.id?{borderColor:n.color+'60',color:n.color}:{}}>
                              {n.icon} {n.name.split(' ')[0]}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Min spread */}
                      <div>
                        <div className="flex justify-between mb-1.5">
                          <p className="text-[7px] font-black uppercase tracking-[.15em] text-slate-600">Мин. спред</p>
                          <span className="text-[8px] font-mono text-cyan-400">{filterMinSpread > 0 ? `>${filterMinSpread}%` : 'Любой'}</span>
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          {[0, 0.1, 0.2, 0.5, 1.0].map(v => (
                            <button key={v} onClick={() => setFilterMinSpread(v)}
                              className={`px-2.5 py-1 rounded-lg text-[8px] font-black border transition-all ${
                                filterMinSpread===v ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-400' : 'bg-transparent border-slate-800 text-slate-600 hover:border-slate-700'
                              }`}>{v===0?'Все':`>${v}%`}</button>
                          ))}
                        </div>
                      </div>

                      {/* Min AI score */}
                      <div>
                        <div className="flex justify-between mb-1.5">
                          <p className="text-[7px] font-black uppercase tracking-[.15em] text-slate-600">Мин. AI Score</p>
                          <span className="text-[8px] font-mono text-violet-400">{filterMinAI > 0 ? `>${filterMinAI}` : 'Любой'}</span>
                        </div>
                        <div className="flex gap-1.5">
                          {[0, 60, 70, 80, 90].map(v => (
                            <button key={v} onClick={() => setFilterMinAI(v)}
                              className={`px-2.5 py-1 rounded-lg text-[8px] font-black border transition-all ${
                                filterMinAI===v ? 'bg-violet-500/15 border-violet-500/40 text-violet-400' : 'bg-transparent border-slate-800 text-slate-600 hover:border-slate-700'
                              }`}>{v===0?'Все':`${v}+`}</button>
                          ))}
                        </div>
                      </div>

                      {/* Reset */}
                      <button onClick={() => { setFilterType('all'); setFilterNetwork('all'); setFilterMinSpread(0); setFilterMinAI(0); setFilterSearch(''); }}
                        className="w-full py-2 rounded-xl bg-slate-800/50 border border-slate-700/50 text-[8px] text-slate-500 font-bold hover:text-slate-300 transition-colors">
                        Сбросить фильтры
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Results count */}
              <div className="flex items-center justify-between px-1">
                <p className="text-[7px] text-slate-700 font-mono uppercase tracking-wider">
                  {visibleSigs.length} из {filteredSignals.length} сигналов
                  {filteredSignals.length !== signals.length && ` (всего ${signals.length})`}
                </p>
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>
                  <p className="text-[7px] text-slate-700 font-mono">live</p>
                </div>
              </div>

              {/* Signal cards */}
              {visibleSigs.map((sig, i) => {
                const meta = TYPE_META[sig.type] || TYPE_META.cex;
                const coinSym = sig.sym.split('/')[0].split('(')[0].trim();
                const coinColor = COIN_COLORS[coinSym] || '#00d4ff';
                const fees = calcFees(sig, amount, user?.vip);
                const canExecute = !sig.vipOnly || user?.vip;
                return (
                  <motion.div key={sig.id}
                    initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay: i * 0.03 }}
                    whileTap={{ scale:0.985 }}
                    onClick={() => canExecute ? setTradeModal(sig) : setPage('vip')}
                    className={`relative rounded-2xl border overflow-hidden cursor-pointer transition-all duration-200 ${
                      sig.hot ? `${meta.border} shadow-lg ${meta.glow}` : 'border-slate-800/50 hover:border-slate-700/70'
                    }`}
                  >
                    {/* Hot gradient line */}
                    {sig.hot && (
                      <div className="absolute top-0 inset-x-0 h-[1.5px]" style={{ background:`linear-gradient(90deg, transparent, ${coinColor}90, transparent)` }}/>
                    )}

                    <div className="bg-gradient-to-br from-slate-900/80 to-slate-950/90 p-3.5">
                      <div className="flex items-start gap-3">
                        {/* Coin icon */}
                        <div className="relative flex-shrink-0">
                          <div className="w-11 h-11 rounded-xl flex items-center justify-center text-lg font-black border"
                            style={{ background:`${coinColor}12`, borderColor:`${coinColor}30`, color:coinColor }}>
                            {COIN_ICONS[coinSym] || coinSym.slice(0,2)}
                          </div>
                          <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-[5px] flex items-center justify-center text-[7px] font-black ${meta.bg} ${meta.border} ${meta.color}`} style={{border:`1px solid`}}>
                            {meta.icon}
                          </div>
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                            <h3 className="font-black text-sm leading-none">{sig.sym}</h3>
                            <span className={`text-[6px] font-black px-1.5 py-0.5 rounded-md border uppercase tracking-wider ${meta.bg} ${meta.border} ${meta.color}`}>
                              {meta.label}
                            </span>
                            {sig.hot && <span className="text-[6px] font-black text-emerald-400 animate-pulse">🔥 HOT</span>}
                            {sig.vipOnly && !user?.vip && <span className="text-[6px] font-black text-amber-400">👑 VIP</span>}
                            {sig.network && <span className={`text-[6px] font-bold px-1 py-0.5 rounded-md bg-slate-800/80 border border-slate-700/50 text-slate-400`}>{sig.networkName||sig.network}</span>}
                          </div>
                          <p className="text-[8px] text-slate-600 font-mono truncate">
                            {sig.bx} <span className="text-slate-700">→</span> {sig.sx}
                            {sig.bridge && <span className="text-slate-700"> · {sig.bridge}</span>}
                          </p>
                        </div>

                        {/* Spread */}
                        <div className="text-right flex-shrink-0">
                          <p className={`text-xl font-black font-mono ${meta.color}`}>+{sig.spread}%</p>
                          <p className="text-[7px] font-mono text-slate-600">≈+${(amount*sig.spread/100).toFixed(2)}</p>
                        </div>
                      </div>

                      {/* Bottom row */}
                      <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-slate-800/40">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            <div className={`w-1 h-3 rounded-full ${sig.aiScore>80?'bg-emerald-400':sig.aiScore>65?'bg-amber-400':'bg-red-400'}`}/>
                            <span className="text-[7px] font-mono text-slate-600">AI <span className="text-slate-400">{sig.aiScore}</span></span>
                          </div>
                          <span className="text-[7px] font-mono text-slate-600">
                            Net <span className="text-emerald-400/90">+{sig.net}%</span>
                          </span>
                          {sig.buyPrice > 0 && (
                            <span className="text-[7px] font-mono text-slate-700">
                              ${sig.buyPrice < 1 ? sig.buyPrice.toFixed(6) : sig.buyPrice.toFixed(2)}
                            </span>
                          )}
                        </div>
                        <span className={`text-[7px] font-black uppercase tracking-wider ${canExecute ? meta.color : 'text-amber-500/60'}`}>
                          {canExecute ? '⚡ EXECUTE' : '🔒 VIP'}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}

              {/* Locked/blurred signals */}
              {lockedSigs.map((sig, i) => {
                const meta = TYPE_META[sig.type] || TYPE_META.cex;
                return (
                  <div key={`locked-${i}`} className="relative rounded-2xl border border-slate-800/30 overflow-hidden cursor-pointer" onClick={() => setPage('vip')}>
                    <div className="p-3.5 blur-sm select-none pointer-events-none">
                      <div className="flex items-center gap-3">
                        <div className={`w-11 h-11 rounded-xl border flex items-center justify-center text-lg font-black ${meta.bg} ${meta.border}`}>◈</div>
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="font-black text-sm">???/USDT</span>
                            <span className={`text-[6px] font-black px-1.5 py-0.5 rounded-md border ${meta.bg} ${meta.border} ${meta.color}`}>{meta.icon} {meta.label}</span>
                          </div>
                          <p className="text-[8px] text-slate-600">??? → ???</p>
                        </div>
                        <p className={`text-xl font-black font-mono ${meta.color}`}>+?.??%</p>
                      </div>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/65 backdrop-blur-[2px]">
                      <motion.div whileTap={{ scale:0.96 }}
                        className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 px-4 py-2.5 rounded-2xl">
                        <Lock size={12} className="text-amber-400"/>
                        <span className="text-[9px] font-black text-amber-400 uppercase tracking-wider">Разблокировать VIP</span>
                      </motion.div>
                    </div>
                  </div>
                );
              })}

              {/* Empty */}
              {filteredSignals.length === 0 && (
                <div className="py-20 text-center space-y-3">
                  <motion.div animate={{ rotate:[0,10,-10,0] }} transition={{ duration:4, repeat:Infinity }}
                    className="w-16 h-16 mx-auto rounded-2xl bg-slate-900/40 border border-slate-800 flex items-center justify-center">
                    <Activity size={22} className="text-slate-700"/>
                  </motion.div>
                  <p className="text-slate-700 text-xs font-mono animate-pulse">Сканирование рынков...</p>
                  {(filterType!=='all'||filterNetwork!=='all'||filterMinSpread>0) && (
                    <button onClick={() => { setFilterType('all'); setFilterNetwork('all'); setFilterMinSpread(0); }}
                      className="text-[9px] text-cyan-500 underline">Сбросить фильтры</button>
                  )}
                </div>
              )}

              {/* VIP promo */}
              {!user?.vip && signals.length > 0 && (
                <motion.div whileTap={{ scale:0.98 }} onClick={() => setPage('vip')}
                  className="cursor-pointer rounded-2xl border border-amber-500/15 bg-gradient-to-r from-amber-500/5 to-orange-500/5 p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-black text-amber-400">Все {signals.length}+ сигналов</p>
                    <p className="text-[8px] text-slate-600 mt-0.5">DEX · Triangular · Cross-chain · Авто-трейдинг</p>
                  </div>
                  <div className="flex items-center gap-1 text-amber-400 font-black text-xs">
                    <Crown size={14}/> VIP <ArrowRight size={10}/>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* ════════════ SCANNER ════════════ */}
          {page === 'scanner' && (
            <motion.div key="scanner" initial={{ opacity:0 }} animate={{ opacity:1 }}>
              <Scanner prices={prices} />
            </motion.div>
          )}

          {/* ════════════ STRATEGIES ════════════ */}
          {page === 'strategies' && (
            <motion.div key="strategies" initial={{ opacity:0 }} animate={{ opacity:1 }}>
              <Strategies user={user} t={t} onUpgrade={() => setPage('vip')} />
            </motion.div>
          )}

          {/* ════════════ AUTO TRADING ════════════ */}
          {page === 'auto' && (
            <motion.div key="auto" initial={{ opacity:0 }} animate={{ opacity:1 }} className="space-y-4">
              {!user?.vip ? (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-8 text-center space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/8 border border-amber-500/20 flex items-center justify-center">
                    <Bot size={26} className="text-amber-400"/>
                  </div>
                  <div>
                    <h3 className="font-black text-amber-400 text-lg">Авто-трейдинг — VIP</h3>
                    <p className="text-[10px] text-slate-600 mt-1.5 leading-relaxed">Автоматическое исполнение сигналов 24/7 с настраиваемым риск-менеджментом</p>
                  </div>
                  <button onClick={() => setPage('vip')} className="px-8 py-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 font-black text-sm rounded-2xl">
                    👑 Получить VIP
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-black">Auto-Trade Bot</h2>
                    <div className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase border ${user?.auto_trading?'bg-emerald-500/10 border-emerald-500/30 text-emerald-400':'bg-slate-800 border-slate-700 text-slate-600'}`}>
                      {user?.auto_trading ? '● Активен' : '○ Остановлен'}
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Настройте авто-трейдинг в <button onClick={() => setPage('profile')} className="text-cyan-400 font-black underline">Профиле → Авто-трейдинг</button>
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {/* ════════════ VIP PAGE ════════════ */}
          {page === 'vip' && (
            <motion.div key="vip" initial={{ opacity:0, scale:0.97 }} animate={{ opacity:1, scale:1 }} className="space-y-5 pb-4">

              {/* Hero */}
              <div className="relative rounded-3xl border border-amber-500/15 bg-gradient-to-br from-amber-500/5 via-orange-500/3 to-transparent overflow-hidden p-6 text-center">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(251,191,36,.06),transparent_70%)]"/>
                <motion.div animate={{ y:[0,-4,0] }} transition={{ duration:3, repeat:Infinity }}
                  className="relative w-20 h-20 mx-auto mb-4">
                  <div className="w-20 h-20 rounded-3xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center">
                    <Crown size={38} className="text-amber-400"/>
                  </div>
                  <motion.div animate={{ rotate:360 }} transition={{ duration:8, repeat:Infinity, ease:'linear' }}
                    className="absolute -inset-1 rounded-[28px] border border-amber-500/15 border-t-amber-500/60"/>
                </motion.div>
                <h2 className="text-3xl font-black mb-1">NEXARB <span className="text-amber-400">VIP</span></h2>
                <p className="text-[10px] text-slate-500 max-w-[240px] mx-auto leading-relaxed">
                  Полный доступ ко всем стратегиям, 40+ биржам, 60+ токенам, 14 сетям
                </p>
              </div>

              {/* Plans */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id:'week',  label:'7 дней',  price:'$9',   sub:'$1.28/день' },
                  { id:'month', label:'1 месяц', price:'$29',  sub:'$0.96/день', popular:true },
                  { id:'year',  label:'1 год',   price:'$149', sub:'$0.41/день' },
                ].map(p => (
                  <motion.div key={p.id} whileTap={{ scale:0.96 }} onClick={() => buyVip(p.id)}
                    className={`p-4 rounded-2xl border text-center cursor-pointer transition-all relative overflow-hidden ${
                      p.popular ? 'bg-amber-500/5 border-amber-500/35' : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                    }`}>
                    {p.popular && (
                      <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-amber-400 to-transparent"/>
                    )}
                    {p.popular && <p className="text-[6px] font-black text-amber-400 uppercase tracking-[.15em] mb-1.5">⭐ Популярный</p>}
                    <p className="text-[8px] text-slate-500 uppercase tracking-wide">{p.label}</p>
                    <p className="text-[22px] font-black text-amber-400 my-1 leading-none">{p.price}</p>
                    <p className="text-[7px] text-slate-600">{p.sub}</p>
                  </motion.div>
                ))}
              </div>

              {/* Comparison table */}
              <div className="rounded-2xl border border-slate-800 overflow-hidden">
                <div className="px-4 py-3 bg-slate-900/40 border-b border-slate-800 flex justify-between">
                  <span className="text-[7px] font-black uppercase tracking-[.15em] text-slate-600">Возможности</span>
                  <div className="flex gap-6">
                    <span className="text-[7px] font-black text-slate-600 w-10 text-center">FREE</span>
                    <span className="text-[7px] font-black text-amber-400 w-10 text-center">VIP</span>
                  </div>
                </div>
                {[
                  ['⚡','Арб. сигналов','3','∞ 50+'],
                  ['🤖','Авто-трейдинг 24/7','—','✅'],
                  ['💸','Комиссия','0.8%','0.3%'],
                  ['🌊','DEX + Tri + Cross','—','✅'],
                  ['🌐','Сетей (chains)','—','14 сетей'],
                  ['🏦','Бирж','2','40+'],
                  ['🪙','Токенов','—','60+'],
                  ['🧪','Demo + Real режим','Demo','Оба'],
                  ['📊','AI Score фильтр','—','✅'],
                  ['👥','Рефералы','—','10%'],
                ].map(([icon,name,free,vip], i, arr) => (
                  <div key={i} className={`px-4 py-2.5 flex items-center ${i<arr.length-1?'border-b border-slate-800/30':''}`}>
                    <span className="text-sm mr-2.5">{icon as string}</span>
                    <span className="text-[10px] text-slate-400 flex-1">{name as string}</span>
                    <div className="flex gap-6">
                      <span className="text-[9px] font-mono text-slate-600 w-10 text-center">{free as string}</span>
                      <span className="text-[9px] font-mono text-emerald-400 font-black w-10 text-center">{vip as string}</span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ════════════ PROFILE ════════════ */}
          {page === 'profile' && (
            <motion.div key="profile" initial={{ opacity:0 }} animate={{ opacity:1 }}>
              <Profile
                user={user} lang={lang} setLang={setLang} t={t}
                onUpgrade={() => setPage('vip')}
                onModeSwitch={switchTradeMode}
                tradingMode={tradingMode}
                userId={userId.current}
              />
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* ── BOTTOM NAV ── */}
      <nav className="fixed bottom-0 inset-x-0 z-50 bg-[#020812]/96 backdrop-blur-2xl border-t border-slate-800/60">
        <div className="max-w-md mx-auto grid grid-cols-5 py-1.5 px-2">
          {[
            { id:'signals',    icon:<Zap size={17}/>,        label:'Сигналы' },
            { id:'scanner',    icon:<BarChart3 size={17}/>,   label:'Сканер'  },
            { id:'strategies', icon:<Layers size={17}/>,      label:'Стратегии'},
            { id:'auto',       icon:<Bot size={17}/>,         label:'Авто'    },
            { id:'profile',    icon:<User size={17}/>,        label:'Профиль' },
          ].map(item => {
            const active = page === item.id;
            return (
              <button key={item.id} onClick={() => setPage(item.id)}
                className={`flex flex-col items-center gap-0.5 py-2 rounded-xl transition-all ${
                  active ? 'text-cyan-400' : 'text-slate-700 hover:text-slate-500'
                }`}>
                <div className={`relative transition-all ${active ? 'scale-110' : ''}`}>
                  {item.icon}
                  {active && <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-cyan-400"/>}
                </div>
                <span className={`text-[5.5px] font-black uppercase tracking-wider ${active ? 'text-cyan-400' : 'text-slate-800'}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── TRADE MODAL ── */}
      <AnimatePresence>
        {tradeModal && user && (() => {
          const meta = TYPE_META[tradeModal.type] || TYPE_META.cex;
          const fees = calcFees(tradeModal, amount, user.vip);
          const coinSym = tradeModal.sym.split('/')[0].split('(')[0].trim();
          const coinColor = COIN_COLORS[coinSym] || '#00d4ff';
          const insufficient = amount > activeBalance || amount <= 0;
          const profitable = fees.net > 0;
          const isDemo = tradingMode === 'demo';

          return (
            <div className="fixed inset-0 z-[70] flex items-end justify-center">
              <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                onClick={() => setTradeModal(null)}
                className="absolute inset-0 bg-[#020812]/90 backdrop-blur-md"/>
              <motion.div initial={{ y:'100%' }} animate={{ y:0 }} exit={{ y:'100%' }}
                transition={{ type:'spring', damping:30, stiffness:300 }}
                className="relative w-full max-w-md bg-slate-900 border-t border-slate-700/40 rounded-t-3xl max-h-[92vh] overflow-y-auto">

                {/* Top accent line */}
                <div className="h-px w-full" style={{ background:`linear-gradient(90deg, transparent, ${coinColor}80, transparent)` }}/>
                <div className="w-10 h-1 bg-slate-700/80 rounded-full mx-auto mt-3"/>

                {/* Demo badge */}
                {isDemo && (
                  <div className="mx-5 mt-4 flex items-center gap-2 bg-violet-500/8 border border-violet-500/20 rounded-xl px-3 py-2">
                    <FlaskConical size={11} className="text-violet-400"/>
                    <span className="text-[8px] font-black text-violet-400 uppercase tracking-wider">Демо режим — средства не списываются</span>
                  </div>
                )}

                <div className="px-5 py-4 space-y-4">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[7px] font-black px-2 py-1 rounded-lg border uppercase tracking-wider ${meta.bg} ${meta.border} ${meta.color}`}>
                          {meta.icon} {meta.label}
                        </span>
                        {tradeModal.hot && <span className="text-[7px] text-emerald-400 font-black animate-pulse">🔥 HOT</span>}
                      </div>
                      <h3 className="text-xl font-black">{tradeModal.sym}</h3>
                      <p className="text-[8px] text-slate-600 font-mono">{tradeModal.bx} → {tradeModal.sx}
                        {tradeModal.bridge && <span className="text-slate-700"> · {tradeModal.bridge} ({tradeModal.bridgeTime})</span>}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-3xl font-black font-mono ${meta.color}`}>+{tradeModal.spread}%</p>
                      <p className="text-[7px] text-slate-600">gross spread</p>
                    </div>
                  </div>

                  {/* Amount input */}
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-[8px] font-black uppercase tracking-wider text-slate-600">Сумма сделки</span>
                      <button onClick={() => setAmount(Math.floor(activeBalance))} className={`text-[8px] font-black ${meta.color}`}>
                        MAX ${Math.floor(activeBalance)}
                      </button>
                    </div>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-lg">$</span>
                      <input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))}
                        className="w-full bg-slate-800/80 border border-slate-700 rounded-2xl pl-9 pr-4 py-3.5 text-xl font-mono font-black outline-none focus:border-cyan-500/50 transition-colors"/>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[100,250,500,1000].map(v => (
                        <button key={v} onClick={() => setAmount(v)}
                          className={`py-2 rounded-xl text-[8px] font-black border transition-all ${
                            amount===v ? `${meta.bg} ${meta.border} ${meta.color}` : 'border-slate-800 text-slate-600 hover:border-slate-700'
                          }`}>${v}</button>
                      ))}
                    </div>
                  </div>

                  {/* Fee breakdown */}
                  <div className="rounded-2xl border border-slate-800 overflow-hidden">
                    <button onClick={() => setFeeExpanded(x => !x)}
                      className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-800/30 hover:bg-slate-800/50 transition-colors">
                      <div className="flex items-center gap-2">
                        <Info size={9} className="text-slate-600"/>
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
                          <div className="px-4 py-3 space-y-2 border-t border-slate-800/50 bg-slate-950/40">
                            <div className="flex justify-between text-[9px] pb-2 border-b border-slate-800/40">
                              <span className="text-slate-500">📈 Валовая прибыль (+{tradeModal.spread}%)</span>
                              <span className="text-emerald-400 font-mono font-bold">+${fees.gross.toFixed(4)}</span>
                            </div>
                            {[
                              [`🏦 NEXARB (${(fees.feeRate*100).toFixed(1)}%${user?.vip?', VIP':''})`  , fees.platform ],
                              [`📊 ${tradeModal.bx} (0.1%)`                                             , fees.exFeeA   ],
                              ...(tradeModal.type!=='cross'?[[`📊 ${tradeModal.sx} (0.1%)`, fees.exFeeB]]:[]),
                              ...(fees.networkFee>0?[[`⛽ Сеть (${tradeModal.type==='cross'?'0.2%':'0.3%'})`, fees.networkFee]]:[]),
                              ...(fees.slippage>0?[['📉 Slippage DEX (0.1%)', fees.slippage]]:[]),
                            ].map(([label,val]: any, i) => (
                              <div key={i} className="flex justify-between text-[8px]">
                                <span className="text-slate-600">{label}</span>
                                <span className="text-red-400 font-mono">−${(val as number).toFixed(4)}</span>
                              </div>
                            ))}
                            <div className="flex justify-between text-[9px] pt-2 border-t border-slate-800/40">
                              <span className="font-bold text-slate-500">Итого удержано</span>
                              <span className="text-red-400 font-mono font-bold">−${fees.total.toFixed(4)}</span>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Net profit */}
                    <div className="px-4 py-3.5 flex items-center justify-between border-t border-slate-800/40 bg-slate-800/15">
                      <div>
                        <p className="text-[7px] font-black uppercase tracking-wider text-slate-600">Чистая прибыль</p>
                        <p className="text-[7px] text-slate-700 mt-0.5 font-mono">${amount} × {tradeModal.spread}% − ${fees.total.toFixed(2)} fees</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-2xl font-black font-mono ${profitable ? 'text-emerald-400' : 'text-red-400'}`}>
                          {profitable?'+':''}{fees.net.toFixed(4)}$
                        </p>
                        {!user.vip && fees.net > 0 && (
                          <p className="text-[7px] text-amber-400 font-bold">VIP: +${calcFees(tradeModal, amount, true).net.toFixed(4)}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* AI score line */}
                  <div className="flex items-center justify-between text-[8px] text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 size={9}/>
                      <span>AI Score: <span className="text-cyan-400 font-bold">{tradeModal.aiScore}/100</span></span>
                    </div>
                    {tradeModal.bridge && <span className="text-slate-700 font-mono">{tradeModal.bridge} · {tradeModal.bridgeTime}</span>}
                  </div>

                  {/* Execute button */}
                  <button onClick={handleTrade} disabled={insufficient || !profitable}
                    className={`w-full py-4 rounded-2xl font-black text-[13px] uppercase tracking-wider transition-all active:scale-[0.98] ${
                      insufficient        ? 'bg-slate-800 border border-slate-700 text-slate-600 cursor-not-allowed'
                      : !profitable       ? 'bg-red-500/8 border border-red-500/25 text-red-400'
                      : isDemo            ? 'bg-gradient-to-r from-violet-500/80 to-purple-600/80 hover:opacity-90 text-white shadow-lg shadow-violet-500/15'
                      :                     'bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-90 text-slate-900 font-black shadow-xl shadow-cyan-500/20'
                    }`}>
                    {insufficient        ? '⊘ Недостаточно средств'
                    : !profitable        ? `⊘ Спред мал (${fees.net.toFixed(4)}$)`
                    : isDemo             ? `🧪 DEMO Execute +$${fees.net.toFixed(4)}`
                    :                      `⚡ Execute +$${fees.net.toFixed(4)}`}
                  </button>

                  <p className="text-[7px] text-slate-800 text-center pb-2">
                    {isDemo ? 'Демо режим — средства списываются из виртуального баланса' : 'Реальная торговля — убедитесь в наличии API ключей'}
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
