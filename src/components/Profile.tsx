import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'motion/react';
import { Crown, FlaskConical, Zap, Settings, Key, Users, Shield, Globe, ChevronRight, Copy, Check, Activity, Calendar, Bot, Plus, Trash2, CheckCircle2, AlertCircle, X } from 'lucide-react';

const LANGS_LIST = [
  {code:'ru', flag:'🇷🇺', name:'Русский'},
  {code:'en', flag:'🇺🇸', name:'English'},
  {code:'de', flag:'🇩🇪', name:'Deutsch'},
  {code:'zh', flag:'🇨🇳', name:'中文'},
];

// Top exchanges for quick-connect UI
const QUICK_EXCHANGES = [
  {id:'binance',   name:'Binance',    logo:'🟡', tier:1},
  {id:'okx',       name:'OKX',        logo:'⚫', tier:1},
  {id:'bybit',     name:'Bybit',      logo:'🟠', tier:1},
  {id:'coinbase',  name:'Coinbase',   logo:'🔵', tier:1},
  {id:'kraken',    name:'Kraken',     logo:'🟣', tier:1},
  {id:'kucoin',    name:'KuCoin',     logo:'🟢', tier:2},
  {id:'gateio',    name:'Gate.io',    logo:'⚪', tier:2},
  {id:'mexc',      name:'MEXC',       logo:'🔷', tier:2},
  {id:'htx',       name:'HTX',        logo:'🔴', tier:2},
  {id:'bitget',    name:'Bitget',     logo:'🔵', tier:2},
];

interface ProfileProps {
  user: any;
  lang: string;
  setLang: (l: string) => void;
  t: (k: string) => string;
  onUpgrade: () => void;
  onModeSwitch?: (mode: 'demo' | 'real') => void;
  tradingMode?: 'demo' | 'real';
  userId?: string;
  onUserUpdate?: (u: any) => void;
  exchanges?: any[];
  initialTab?: string;
}

export default function Profile({
  user, lang, setLang, t, onUpgrade,
  onModeSwitch, tradingMode='demo',
  userId='demo_user', onUserUpdate, exchanges=[], initialTab='overview',
}: ProfileProps) {
  const [tab, setTab] = useState(initialTab);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoEnabled, setAutoEnabled] = useState(user?.auto_trading||false);
  const [autoAmount, setAutoAmount] = useState(user?.auto_amount||100);
  const [autoSpread, setAutoSpread] = useState(user?.auto_min_spread||0.2);
  const [autoRisk, setAutoRisk] = useState(user?.auto_risk||'medium');
  const [savedMsg, setSavedMsg] = useState('');

  // Exchange connect state
  const [addExModal, setAddExModal] = useState(false);
  const [selExchange, setSelExchange] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [connectingEx, setConnectingEx] = useState(false);
  const [connectResult, setConnectResult] = useState<{ok:boolean;msg:string}|null>(null);
  const [connectedExchanges, setConnectedExchanges] = useState<string[]>(user?.connected_exchanges||[]);
  const [removingEx, setRemovingEx] = useState<string|null>(null);

  useEffect(() => {
    setConnectedExchanges(user?.connected_exchanges||[]);
    setAutoEnabled(user?.auto_trading||false);
  }, [user]);

  const displayName = user?.tg_first_name
    ? `${user.tg_first_name}${user.tg_last_name?' '+user.tg_last_name:''}`
    : user?.id||'User';

  const vipDays = user?.vip_expires
    ? Math.max(0, Math.ceil((user.vip_expires-Date.now()/1000)/86400))
    : 0;

  const copyRef = () => {
    navigator.clipboard.writeText(user?.ref_code||'');
    setCopied(true);
    setTimeout(()=>setCopied(false), 2000);
  };

  const saveAutoSettings = async () => {
    setSaving(true);
    try {
      await axios.patch('/api/v1/account', {
        userId,
        auto_trading: autoEnabled,
        auto_amount: autoAmount,
        auto_min_spread: autoSpread,
        auto_risk: autoRisk,
      });
      if(onUserUpdate) onUserUpdate((u: any)=>({...u, auto_trading:autoEnabled, auto_amount:autoAmount}));
      setSavedMsg(t('saved')||'Сохранено!');
      setTimeout(()=>setSavedMsg(''), 2500);
    } catch {}
    setSaving(false);
  };

  const connectExchange = async () => {
    if(!selExchange||!apiKey||!apiSecret) {
      setConnectResult({ok:false, msg:'Заполните все поля'});
      return;
    }
    setConnectingEx(true);
    setConnectResult(null);
    try {
      const res = await axios.post('/api/v1/exchange/connect', {
        userId, exchange: selExchange, apiKey, apiSecret,
      });
      if(res.data.ok) {
        const newList = res.data.connected || [...connectedExchanges, selExchange];
        setConnectedExchanges(newList);
        if(onUserUpdate) onUserUpdate((u: any)=>({...u, connected_exchanges:newList}));
        setConnectResult({ok:true, msg:`✅ ${selExchange} подключена успешно!`});
        setApiKey(''); setApiSecret(''); setSelExchange('');
        setTimeout(()=>{setAddExModal(false);setConnectResult(null);}, 2000);
      }
    } catch(err: any) {
      const msg = err.response?.data?.error || 'Ошибка подключения';
      setConnectResult({ok:false, msg:'❌ '+msg});
    }
    setConnectingEx(false);
  };

  const disconnectExchange = async (exchange: string) => {
    if(!confirm(`Отключить ${exchange}?`)) return;
    setRemovingEx(exchange);
    try {
      await axios.delete('/api/v1/exchange/connect', {data:{userId, exchange}});
      const newList = connectedExchanges.filter(e=>e!==exchange);
      setConnectedExchanges(newList);
      if(onUserUpdate) onUserUpdate((u: any)=>({...u, connected_exchanges:newList}));
    } catch {}
    setRemovingEx(null);
  };

  const TABS = [
    {id:'overview', label:'Обзор',     e:'◎'},
    {id:'trading',  label:'Торговля',  e:'⚡'},
    {id:'api',      label:'Биржи',     e:'🔑'},
    {id:'ref',      label:'Рефералы',  e:'👥'},
    {id:'settings', label:'Настройки', e:'⚙'},
  ];

  return (
    <div className="space-y-4">

      {/* ── HERO ── */}
      <div className="relative rounded-2xl border border-slate-800 overflow-hidden bg-gradient-to-br from-slate-900 to-slate-950">
        {user?.vip && <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(251,191,36,.04),transparent_60%)]"/>}
        <div className="relative p-5">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl border-2 border-slate-700 overflow-hidden flex items-center justify-center bg-gradient-to-br from-cyan-500/20 to-purple-600/20">
                {user?.tg_photo_url
                  ? <img src={user.tg_photo_url} alt="" className="w-full h-full object-cover"/>
                  : <span className="text-2xl font-black text-slate-400">{displayName.slice(0,1).toUpperCase()}</span>
                }
              </div>
              {user?.vip && (
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-lg bg-amber-500/20 border border-amber-500/50 flex items-center justify-center">
                  <Crown size={10} className="text-amber-400"/>
                </div>
              )}
            </div>
            <div className="flex-1">
              <h2 className="font-black text-base leading-tight">{displayName}</h2>
              {user?.tg_username && <p className="text-[10px] text-cyan-400/80 font-mono">@{user.tg_username}</p>}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className={`text-[7px] font-black px-2 py-0.5 rounded-md border uppercase ${
                  user?.vip ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-slate-800 border-slate-700 text-slate-500'
                }`}>{user?.vip ? `👑 VIP · ${vipDays}д` : 'FREE'}</span>
                <span className={`text-[7px] font-black px-2 py-0.5 rounded-md border uppercase ${
                  tradingMode==='demo' ? 'bg-violet-500/10 border-violet-500/30 text-violet-400' : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                }`}>{tradingMode==='demo' ? '🧪 Demo' : '⚡ Real'}</span>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            {[
              {l:'Real Balance', v:`$${(user?.balance||0).toFixed(2)}`,      c:'text-cyan-400'},
              {l:'Demo Balance', v:`$${(user?.demo_balance||0).toFixed(2)}`, c:'text-violet-400'},
              {l:'Всего сделок', v:(user?.trades||0)+(user?.demo_trades||0), c:'text-emerald-400'},
            ].map((s,i)=>(
              <div key={i} className="bg-slate-800/30 rounded-xl p-2.5 text-center border border-slate-800/50">
                <p className="text-[6px] text-slate-600 uppercase font-black tracking-wider mb-0.5">{s.l}</p>
                <p className={`text-[12px] font-black font-mono ${s.c}`}>{s.v}</p>
              </div>
            ))}
          </div>

          {/* Demo/Real switch */}
          {onModeSwitch && (
            <div className="mt-3 flex items-center gap-0.5 bg-slate-800/30 rounded-xl p-1 border border-slate-800/50">
              <button onClick={()=>onModeSwitch('demo')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${
                  tradingMode==='demo' ? 'bg-violet-500/20 border border-violet-500/40 text-violet-400' : 'text-slate-600 hover:text-slate-400'
                }`}><FlaskConical size={10}/> Демо</button>
              <button onClick={()=>user?.vip ? onModeSwitch('real') : onUpgrade()}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${
                  tradingMode==='real' ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-400' : 'text-slate-600 hover:text-slate-400'
                }`}><Zap size={10}/> Real {!user?.vip && <span className="text-amber-500/70 text-[7px]">👑</span>}</button>
            </div>
          )}
        </div>
      </div>

      {/* ── TABS ── */}
      <div className="flex gap-1 bg-slate-900/60 border border-slate-800/50 rounded-2xl p-1 overflow-x-auto no-scrollbar">
        {TABS.map(tb=>(
          <button key={tb.id} onClick={()=>setTab(tb.id)}
            className={`flex-shrink-0 flex items-center gap-1 px-3 py-2 rounded-xl text-[8px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
              tab===tb.id ? 'bg-slate-800 text-cyan-400 border border-slate-700' : 'text-slate-600 hover:text-slate-400'
            }`}><span>{tb.e}</span>{tb.label}</button>
        ))}
      </div>

      <AnimatePresence mode="wait">

        {/* ── OVERVIEW ── */}
        {tab==='overview' && (
          <motion.div key="ov" initial={{opacity:0}} animate={{opacity:1}} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {[
                {l:'Real Profit',  v:`+$${(user?.profit||0).toFixed(2)}`,      c:'text-cyan-400',   bg:'from-cyan-500/5'},
                {l:'Demo Profit',  v:`+$${(user?.demo_profit||0).toFixed(2)}`, c:'text-violet-400', bg:'from-violet-500/5'},
                {l:'Real Trades',  v:user?.trades||0,                          c:'text-emerald-400',bg:'from-emerald-500/5'},
                {l:'Demo Trades',  v:user?.demo_trades||0,                     c:'text-amber-400',  bg:'from-amber-500/5'},
              ].map((s,i)=>(
                <div key={i} className={`bg-gradient-to-br ${s.bg} to-transparent border border-slate-800/50 rounded-2xl p-4`}>
                  <p className="text-[7px] text-slate-600 uppercase font-black tracking-wider mb-1">{s.l}</p>
                  <p className={`text-xl font-black font-mono ${s.c}`}>{s.v}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 p-3 bg-slate-900/40 border border-slate-800/50 rounded-xl">
              <Calendar size={13} className="text-slate-600 flex-shrink-0"/>
              <div>
                <p className="text-[7px] text-slate-600 uppercase font-black tracking-wider">Участник с</p>
                <p className="text-[10px] text-slate-300 font-mono">
                  {new Date((user?.created_at||Date.now()/1000)*1000).toLocaleDateString('ru',{day:'numeric',month:'long',year:'numeric'})}
                </p>
              </div>
            </div>
            {!user?.vip && (
              <motion.div whileTap={{scale:0.98}} onClick={onUpgrade}
                className="cursor-pointer rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-center justify-between">
                <div>
                  <p className="font-black text-amber-400 text-sm">Перейти на VIP</p>
                  <p className="text-[8px] text-slate-600 mt-0.5">40+ бирж · DEX · Авто-трейдинг</p>
                </div>
                <div className="flex items-center gap-1 text-amber-400"><Crown size={16}/><ChevronRight size={12}/></div>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* ── TRADING ── */}
        {tab==='trading' && (
          <motion.div key="tr" initial={{opacity:0}} animate={{opacity:1}} className="space-y-4">

            {/* Mode select */}
            <div className="rounded-2xl border border-slate-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/40">
                <p className="text-[8px] font-black uppercase tracking-[.15em] text-slate-500">Режим торговли</p>
              </div>
              <div className="p-4 space-y-3">
                {[
                  {id:'demo', icon:<FlaskConical size={14}/>, title:'Демо режим', desc:'Виртуальные средства. Без риска.', col:'text-violet-400', bg:'bg-violet-500/8', brd:'border-violet-500/25'},
                  {id:'real', icon:<Zap size={14}/>,          title:'Реальная торговля', desc:'Реальные средства через API. Только VIP.', col:'text-cyan-400', bg:'bg-cyan-500/8', brd:'border-cyan-500/25'},
                ].map(m=>(
                  <button key={m.id}
                    onClick={()=>m.id==='real'&&!user?.vip ? onUpgrade() : onModeSwitch?.(m.id as any)}
                    className={`w-full flex items-start gap-3 p-3.5 rounded-xl border transition-all ${
                      tradingMode===m.id ? `${m.bg} ${m.brd}` : 'bg-slate-800/20 border-slate-800/50 hover:border-slate-700/50'
                    }`}>
                    <div className={`p-2 rounded-lg border mt-0.5 flex-shrink-0 ${tradingMode===m.id?`${m.bg} ${m.brd}`:'bg-slate-800 border-slate-700'}`}>
                      <span className={tradingMode===m.id?m.col:'text-slate-500'}>{m.icon}</span>
                    </div>
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-black ${tradingMode===m.id?m.col:'text-slate-400'}`}>{m.title}</p>
                        {m.id==='real'&&!user?.vip && <span className="text-[7px] text-amber-500 font-black">👑 VIP</span>}
                        {tradingMode===m.id && <span className={`text-[7px] font-black px-1.5 py-0.5 rounded border ${m.bg} ${m.brd} ${m.col}`}>АКТИВЕН</span>}
                      </div>
                      <p className="text-[8px] text-slate-600 mt-0.5 leading-relaxed">{m.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Auto-trading settings */}
            <div className={`rounded-2xl border border-slate-800 overflow-hidden ${!user?.vip?'opacity-60':''}`}>
              <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot size={11} className="text-slate-600"/>
                  <p className="text-[8px] font-black uppercase tracking-[.15em] text-slate-500">Авто-трейдинг</p>
                  {!user?.vip && <span className="text-[7px] text-amber-500 font-black">👑 VIP</span>}
                </div>
                <button
                  onClick={()=>!user?.vip?onUpgrade():setAutoEnabled((x: boolean)=>!x)}
                  className={`relative w-10 h-5 rounded-full border transition-all duration-300 ${
                    autoEnabled&&user?.vip ? 'bg-cyan-500/30 border-cyan-500/60' : 'bg-slate-800 border-slate-700'
                  }`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-300 ${
                    autoEnabled&&user?.vip ? 'left-5' : 'left-0.5'
                  }`}/>
                </button>
              </div>
              <div className="p-4 space-y-4">
                {[
                  {l:'Сумма на сделку (USDT)', v:autoAmount, set:setAutoAmount, min:10, max:10000, step:10, fmt:(v:number)=>`$${v}`},
                  {l:'Мин. спред (%)',          v:autoSpread, set:setAutoSpread, min:0.05, max:2, step:0.05, fmt:(v:number)=>`${v}%`},
                ].map((f,i)=>(
                  <div key={i}>
                    <div className="flex justify-between mb-2">
                      <label className="text-[7px] font-black text-slate-600 uppercase tracking-wider">{f.l}</label>
                      <span className="text-[9px] font-mono text-cyan-400 font-black">{f.fmt(f.v)}</span>
                    </div>
                    <input type="range" min={f.min} max={f.max} step={f.step} value={f.v}
                      onChange={e=>f.set(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      disabled={!user?.vip}
                    />
                  </div>
                ))}
                <div>
                  <p className="text-[7px] font-black text-slate-600 uppercase tracking-wider mb-2">Риск-профиль</p>
                  <div className="flex gap-2">
                    {[
                      {id:'low',    l:'Низкий',  c:'text-emerald-400', bg:'bg-emerald-500/10', bd:'border-emerald-500/40'},
                      {id:'medium', l:'Средний', c:'text-amber-400',   bg:'bg-amber-500/10',   bd:'border-amber-500/40'},
                      {id:'high',   l:'Высокий', c:'text-red-400',     bg:'bg-red-500/10',     bd:'border-red-500/40'},
                    ].map(r=>(
                      <button key={r.id}
                        onClick={()=>user?.vip&&setAutoRisk(r.id)}
                        className={`flex-1 py-2 rounded-xl text-[8px] font-black uppercase border transition-all ${
                          autoRisk===r.id ? `${r.bg} ${r.bd} ${r.c}` : 'bg-transparent border-slate-800 text-slate-600'
                        }`}>{r.l}</button>
                    ))}
                  </div>
                </div>
                {user?.vip && (
                  <button onClick={saveAutoSettings}
                    className="w-full py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-[9px] font-black uppercase tracking-wider hover:bg-cyan-500/15 transition-colors">
                    {saving ? '⟳ Сохранение...' : savedMsg || '✓ Сохранить настройки'}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── API / EXCHANGES ── */}
        {tab==='api' && (
          <motion.div key="api" initial={{opacity:0}} animate={{opacity:1}} className="space-y-4">
            {!user?.vip ? (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-8 text-center space-y-4">
                <Key size={28} className="text-amber-400 mx-auto"/>
                <div>
                  <p className="font-black text-amber-400 text-base">API ключи — VIP</p>
                  <p className="text-[9px] text-slate-600 mt-1.5 leading-relaxed">Подключайте биржи и торгуйте реальными средствами</p>
                </div>
                <button onClick={onUpgrade} className="px-6 py-2.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 font-black text-xs rounded-2xl">
                  👑 Активировать VIP
                </button>
              </div>
            ) : (
              <>
                {/* Connected exchanges */}
                <div className="rounded-2xl border border-slate-800 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between">
                    <p className="text-[8px] font-black uppercase tracking-[.15em] text-slate-500">
                      Подключённые биржи ({connectedExchanges.length})
                    </p>
                    <button onClick={()=>{setAddExModal(true);setConnectResult(null);}}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-[8px] font-black hover:bg-cyan-500/15 transition-colors">
                      <Plus size={10}/> Добавить
                    </button>
                  </div>
                  <div className="p-4">
                    {connectedExchanges.length===0 ? (
                      <div className="text-center py-6 space-y-2">
                        <Key size={20} className="text-slate-700 mx-auto"/>
                        <p className="text-[9px] text-slate-600">Нет подключённых бирж</p>
                        <p className="text-[8px] text-slate-700">Нажмите "Добавить" для подключения</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {connectedExchanges.map(exId=>{
                          const exInfo = QUICK_EXCHANGES.find(e=>e.id===exId) || {id:exId, name:exId, logo:'🏦', tier:2};
                          const isRemoving = removingEx===exId;
                          return (
                            <div key={exId} className="flex items-center justify-between p-3 bg-slate-800/30 rounded-xl border border-slate-800/50">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-base">{exInfo.logo}</div>
                                <div>
                                  <p className="text-[11px] font-bold capitalize">{exInfo.name}</p>
                                  <p className="text-[7px] text-emerald-400 font-bold">● Подключена</p>
                                </div>
                              </div>
                              <button onClick={()=>disconnectExchange(exId)} disabled={isRemoving}
                                className="p-2 rounded-lg bg-red-500/8 border border-red-500/20 text-red-400 hover:bg-red-500/15 transition-colors disabled:opacity-40">
                                {isRemoving ? <span className="text-[8px]">...</span> : <Trash2 size={12}/>}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Quick exchange tiles */}
                <div className="rounded-2xl border border-slate-800 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/40">
                    <p className="text-[8px] font-black uppercase tracking-[.15em] text-slate-500">Быстрое подключение</p>
                  </div>
                  <div className="p-3 grid grid-cols-5 gap-2">
                    {QUICK_EXCHANGES.map(ex=>{
                      const connected = connectedExchanges.includes(ex.id);
                      return (
                        <button key={ex.id}
                          onClick={()=>{if(connected){disconnectExchange(ex.id);}else{setSelExchange(ex.id);setAddExModal(true);setConnectResult(null);}}}
                          className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all ${
                            connected ? 'bg-emerald-500/8 border-emerald-500/30' : 'bg-slate-800/30 border-slate-800 hover:border-slate-700'
                          }`}>
                          <span className="text-xl">{ex.logo}</span>
                          <span className={`text-[6px] font-black uppercase text-center leading-tight ${connected?'text-emerald-400':'text-slate-600'}`}>{ex.name}</span>
                          {connected && <div className="w-1 h-1 rounded-full bg-emerald-400"/>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}

        {/* ── REFERRAL ── */}
        {tab==='ref' && (
          <motion.div key="ref" initial={{opacity:0}} animate={{opacity:1}} className="rounded-2xl border border-slate-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/40">
              <p className="text-[8px] font-black uppercase tracking-[.15em] text-slate-500">Реферальная программа</p>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {[
                  {l:'Рефералов', v:user?.referred_users?.length||0,      c:'text-cyan-400'},
                  {l:'Заработано', v:`$${(user?.ref_earned||0).toFixed(2)}`, c:'text-emerald-400'},
                  {l:'% профит',  v:'10%',                                c:'text-amber-400'},
                ].map((s,i)=>(
                  <div key={i} className="bg-slate-800/30 rounded-xl p-2.5 text-center border border-slate-800/50">
                    <p className="text-[6px] text-slate-600 uppercase font-black tracking-wider mb-0.5">{s.l}</p>
                    <p className={`text-sm font-black font-mono ${s.c}`}>{s.v}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-[7px] font-black text-slate-600 uppercase tracking-wider mb-2">Ваш реферальный код</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-3 font-mono text-sm font-black text-cyan-400 tracking-widest">
                    {user?.ref_code||'REFXXXXX'}
                  </div>
                  <button onClick={copyRef}
                    className={`p-3 rounded-xl border transition-all ${copied?'bg-emerald-500/10 border-emerald-500/30 text-emerald-400':'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'}`}>
                    {copied?<Check size={14}/>:<Copy size={14}/>}
                  </button>
                </div>
              </div>
              <p className="text-[8px] text-slate-600 leading-relaxed p-3 bg-slate-800/20 rounded-xl border border-slate-800/40">
                Приглашайте друзей и получайте 10% от их комиссионных выплат навсегда.
              </p>
            </div>
          </motion.div>
        )}

        {/* ── SETTINGS ── */}
        {tab==='settings' && (
          <motion.div key="st" initial={{opacity:0}} animate={{opacity:1}} className="space-y-3">
            <div className="rounded-2xl border border-slate-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/40 flex items-center gap-2">
                <Globe size={11} className="text-slate-600"/>
                <p className="text-[8px] font-black uppercase tracking-[.15em] text-slate-500">{t('lang_title')||'Язык интерфейса'}</p>
              </div>
              <div className="p-3 grid grid-cols-2 gap-2">
                {LANGS_LIST.map(l=>(
                  <button key={l.code} onClick={()=>setLang(l.code)}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border transition-all ${
                      lang===l.code ? 'bg-cyan-500/8 border-cyan-500/30 text-cyan-400' : 'bg-slate-800/20 border-slate-800/50 text-slate-500 hover:border-slate-700'
                    }`}>
                    <span className="text-xl">{l.flag}</span>
                    <span className="text-[10px] font-black">{l.name}</span>
                    {lang===l.code && <Check size={10} className="ml-auto text-cyan-400"/>}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/40 flex items-center gap-2">
                <Shield size={11} className="text-slate-600"/>
                <p className="text-[8px] font-black uppercase tracking-[.15em] text-slate-500">Аккаунт</p>
              </div>
              <div className="p-4 space-y-2">
                {[
                  {l:'ID',       v:user?.id},
                  {l:'Telegram', v:user?.tg_username?`@${user.tg_username}`:'—'},
                  {l:'Тариф',    v:user?.vip?`VIP (${vipDays} дн.)`:'Free'},
                  {l:'Режим',    v:tradingMode==='demo'?'🧪 Демо':'⚡ Реальный'},
                  {l:'Бирж',     v:connectedExchanges.length||0},
                ].map((row,i)=>(
                  <div key={i} className="flex justify-between items-center py-1.5 border-b border-slate-800/30 last:border-0">
                    <span className="text-[8px] text-slate-600 uppercase font-bold tracking-wider">{row.l}</span>
                    <span className="text-[9px] text-slate-400 font-mono truncate max-w-[160px]">{row.v}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── ADD EXCHANGE MODAL ── */}
      <AnimatePresence>
        {addExModal && (
          <div className="fixed inset-0 z-[80] flex items-end justify-center">
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
              onClick={()=>setAddExModal(false)}
              className="absolute inset-0 bg-[#020812]/90 backdrop-blur-md"/>
            <motion.div initial={{y:'100%'}} animate={{y:0}} exit={{y:'100%'}}
              transition={{type:'spring',damping:30,stiffness:300}}
              className="relative w-full max-w-md bg-slate-900 border-t border-slate-700/40 rounded-t-3xl max-h-[80vh] overflow-y-auto">
              <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mt-3"/>
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
                <h3 className="font-black text-base">Подключить биржу</h3>
                <button onClick={()=>setAddExModal(false)} className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-500"><X size={13}/></button>
              </div>
              <div className="px-5 py-4 space-y-4">

                {/* Result banner */}
                {connectResult && (
                  <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}}
                    className={`flex items-center gap-2 p-3 rounded-xl border text-[10px] font-bold ${
                      connectResult.ok ? 'bg-emerald-500/8 border-emerald-500/25 text-emerald-400' : 'bg-red-500/8 border-red-500/25 text-red-400'
                    }`}>
                    {connectResult.ok ? <CheckCircle2 size={13}/> : <AlertCircle size={13}/>}
                    {connectResult.msg}
                  </motion.div>
                )}

                {/* Exchange select */}
                <div>
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-wider mb-2">Биржа</p>
                  <div className="grid grid-cols-5 gap-2 mb-3">
                    {QUICK_EXCHANGES.map(ex=>(
                      <button key={ex.id} onClick={()=>setSelExchange(ex.id)}
                        className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all ${
                          selExchange===ex.id ? 'bg-cyan-500/10 border-cyan-500/40' : 'bg-slate-800/30 border-slate-800 hover:border-slate-700'
                        }`}>
                        <span className="text-lg">{ex.logo}</span>
                        <span className={`text-[6px] font-black uppercase ${selExchange===ex.id?'text-cyan-400':'text-slate-600'}`}>{ex.name}</span>
                      </button>
                    ))}
                  </div>
                  <input value={selExchange} onChange={e=>setSelExchange(e.target.value.toLowerCase())}
                    placeholder="или введите название биржи..."
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2.5 text-[10px] font-mono text-slate-300 outline-none focus:border-cyan-500/50 placeholder-slate-700"/>
                </div>

                {/* API Key */}
                <div>
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-wider mb-2">API Key</p>
                  <input value={apiKey} onChange={e=>setApiKey(e.target.value)}
                    placeholder="Введите API Key..."
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2.5 text-[10px] font-mono text-slate-300 outline-none focus:border-cyan-500/50 placeholder-slate-700"/>
                </div>

                {/* API Secret */}
                <div>
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-wider mb-2">API Secret</p>
                  <input type="password" value={apiSecret} onChange={e=>setApiSecret(e.target.value)}
                    placeholder="Введите API Secret..."
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2.5 text-[10px] font-mono text-slate-300 outline-none focus:border-cyan-500/50 placeholder-slate-700"/>
                </div>

                <div className="p-3 bg-amber-500/5 border border-amber-500/15 rounded-xl text-[8px] text-amber-500/70 leading-relaxed">
                  ⚠️ Для безопасности используйте API ключи только с правами на торговлю, без права на вывод средств.
                </div>

                <button onClick={connectExchange} disabled={connectingEx||!selExchange||!apiKey||!apiSecret}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-900 font-black text-[11px] uppercase tracking-wider disabled:opacity-40 active:scale-[.98] transition-transform">
                  {connectingEx ? '⟳ Подключение...' : `✓ Подключить ${selExchange||'биржу'}`}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
