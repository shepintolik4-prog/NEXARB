import React, { useState } from 'react';
import axios from 'axios';
import { Crown, FlaskConical, Zap, Settings, Key, Users, Shield, Globe, ChevronRight, Copy, Check, Activity, Calendar, Bot } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const LANGS_LIST = [{code:'ru',flag:'🇷🇺',name:'Русский'},{code:'en',flag:'🇺🇸',name:'English'},{code:'de',flag:'🇩🇪',name:'Deutsch'},{code:'zh',flag:'🇨🇳',name:'中文'}];

export default function Profile({ user, lang, setLang, t, onUpgrade, onModeSwitch, tradingMode='demo', userId='demo_user' }: any) {
  const [tab, setTab] = useState('overview');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoEnabled, setAutoEnabled] = useState(user?.auto_trading||false);
  const [autoAmount, setAutoAmount] = useState(user?.auto_amount||100);
  const [autoSpread, setAutoSpread] = useState(user?.auto_min_spread||0.2);
  const [autoRisk, setAutoRisk] = useState(user?.auto_risk||'medium');

  const displayName = user?.tg_first_name ? `${user.tg_first_name}${user.tg_last_name?' '+user.tg_last_name:''}` : user?.id||'User';
  const vipDays = user?.vip_expires ? Math.max(0,Math.ceil((user.vip_expires-Date.now()/1000)/86400)) : 0;

  const copyRef = () => { navigator.clipboard.writeText(user?.ref_code||''); setCopied(true); setTimeout(()=>setCopied(false),2000); };

  const saveAuto = async () => {
    setSaving(true);
    try { await axios.patch('/api/v1/account',{userId,auto_trading:autoEnabled,auto_amount:autoAmount,auto_min_spread:autoSpread,auto_risk:autoRisk}); } catch{}
    setSaving(false);
  };

  const tabs = [{id:'overview',icon:'◎',l:'Обзор'},{id:'trading',icon:'⚡',l:'Торговля'},{id:'api',icon:'🔑',l:'API'},{id:'ref',icon:'👥',l:'Рефералы'},{id:'settings',icon:'⚙',l:'Настройки'}];

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="relative rounded-2xl border border-slate-800 overflow-hidden bg-gradient-to-br from-slate-900 to-slate-950">
        {user?.vip && <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(251,191,36,.04),transparent_60%)]"/>}
        <div className="relative p-5">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl border-2 border-slate-700 overflow-hidden flex items-center justify-center bg-gradient-to-br from-cyan-500/20 to-purple-600/20">
                {user?.tg_photo_url ? <img src={user.tg_photo_url} alt="" className="w-full h-full object-cover"/> : <span className="text-2xl font-black text-slate-400">{displayName.slice(0,1).toUpperCase()}</span>}
              </div>
              {user?.vip && <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-lg bg-amber-500/20 border border-amber-500/50 flex items-center justify-center"><Crown size={10} className="text-amber-400"/></div>}
            </div>
            <div className="flex-1">
              <h2 className="font-black text-base leading-tight">{displayName}</h2>
              {user?.tg_username && <p className="text-[10px] text-cyan-400/80 font-mono">@{user.tg_username}</p>}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className={`text-[7px] font-black px-2 py-0.5 rounded-md border uppercase ${user?.vip?'bg-amber-500/10 border-amber-500/30 text-amber-400':'bg-slate-800 border-slate-700 text-slate-500'}`}>{user?.vip?`👑 VIP·${vipDays}д`:'FREE'}</span>
                <span className={`text-[7px] font-black px-2 py-0.5 rounded-md border uppercase ${tradingMode==='demo'?'bg-violet-500/10 border-violet-500/30 text-violet-400':'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'}`}>{tradingMode==='demo'?'🧪 Demo':'⚡ Real'}</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4">
            {[{l:'Баланс',v:`$${(user?.balance||0).toFixed(2)}`,c:'text-cyan-400'},{l:'Demo',v:`$${(user?.demo_balance||0).toFixed(2)}`,c:'text-violet-400'},{l:'Сделок',v:(user?.trades||0)+(user?.demo_trades||0),c:'text-emerald-400'}].map((s,i)=>(
              <div key={i} className="bg-slate-800/30 rounded-xl p-2.5 text-center border border-slate-800/50">
                <p className="text-[6px] text-slate-600 uppercase font-black tracking-wider mb-0.5">{s.l}</p>
                <p className={`text-[12px] font-black font-mono ${s.c}`}>{s.v}</p>
              </div>
            ))}
          </div>
          {onModeSwitch && (
            <div className="mt-3 flex items-center gap-2 bg-slate-800/30 rounded-xl p-1 border border-slate-800/50">
              <button onClick={()=>onModeSwitch('demo')} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${tradingMode==='demo'?'bg-violet-500/20 border border-violet-500/40 text-violet-400':'text-slate-600 hover:text-slate-400'}`}><FlaskConical size={10}/> Демо</button>
              <button onClick={()=>user?.vip?onModeSwitch('real'):onUpgrade()} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${tradingMode==='real'?'bg-cyan-500/20 border border-cyan-500/40 text-cyan-400':'text-slate-600 hover:text-slate-400'}`}><Zap size={10}/> Real {!user?.vip&&<span className="text-amber-500/70">👑</span>}</button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900/60 border border-slate-800/50 rounded-2xl p-1 overflow-x-auto no-scrollbar">
        {tabs.map(tb=>(
          <button key={tb.id} onClick={()=>setTab(tb.id)} className={`flex-shrink-0 flex items-center gap-1 px-3 py-2 rounded-xl text-[8px] font-black uppercase tracking-wider transition-all ${tab===tb.id?'bg-slate-800 text-cyan-400 border border-slate-700':'text-slate-600 hover:text-slate-400'}`}>
            <span>{tb.icon}</span>{tb.l}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab==='overview' && (
          <motion.div key="ov" initial={{opacity:0}} animate={{opacity:1}} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {[{l:'Real Profit',v:`+$${(user?.profit||0).toFixed(2)}`,c:'text-cyan-400',bg:'from-cyan-500/5'},{l:'Demo Profit',v:`+$${(user?.demo_profit||0).toFixed(2)}`,c:'text-violet-400',bg:'from-violet-500/5'},{l:'Real Trades',v:user?.trades||0,c:'text-emerald-400',bg:'from-emerald-500/5'},{l:'Demo Trades',v:user?.demo_trades||0,c:'text-amber-400',bg:'from-amber-500/5'}].map((s,i)=>(
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
                <p className="text-[10px] text-slate-300 font-mono">{new Date((user?.created_at||Date.now()/1000)*1000).toLocaleDateString('ru',{day:'numeric',month:'long',year:'numeric'})}</p>
              </div>
            </div>
            {!user?.vip && (
              <motion.div whileTap={{scale:0.98}} onClick={onUpgrade} className="cursor-pointer rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-center justify-between">
                <div><p className="font-black text-amber-400 text-sm">Перейти на VIP</p><p className="text-[8px] text-slate-600 mt-0.5">40+ бирж · 60+ токенов · 14 сетей</p></div>
                <div className="flex items-center gap-1 text-amber-400"><Crown size={16}/><ChevronRight size={12}/></div>
              </motion.div>
            )}
          </motion.div>
        )}

        {tab==='trading' && (
          <motion.div key="tr" initial={{opacity:0}} animate={{opacity:1}} className="space-y-4">
            <div className="rounded-2xl border border-slate-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/40"><p className="text-[8px] font-black uppercase tracking-[.15em] text-slate-500">Режим торговли</p></div>
              <div className="p-4 space-y-3">
                {[{id:'demo',icon:<FlaskConical size={14}/>,title:'Демо режим',desc:'Виртуальные средства. Идеально для изучения стратегий без риска.',col:'text-violet-400',bg:'bg-violet-500/8',brd:'border-violet-500/25'},{id:'real',icon:<Zap size={14}/>,title:'Реальная торговля',desc:'Реальные средства через API ключи. Только VIP.',col:'text-cyan-400',bg:'bg-cyan-500/8',brd:'border-cyan-500/25'}].map(m=>(
                  <button key={m.id} onClick={()=>m.id==='real'&&!user?.vip?onUpgrade():onModeSwitch?.(m.id as any)} className={`w-full flex items-start gap-3 p-3.5 rounded-xl border transition-all ${tradingMode===m.id?`${m.bg} ${m.brd}`:'bg-slate-800/20 border-slate-800/50 hover:border-slate-700/50'}`}>
                    <div className={`p-2 rounded-lg border mt-0.5 ${tradingMode===m.id?`${m.bg} ${m.brd}`:'bg-slate-800 border-slate-700'}`}><span className={tradingMode===m.id?m.col:'text-slate-500'}>{m.icon}</span></div>
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2"><p className={`text-sm font-black ${tradingMode===m.id?m.col:'text-slate-400'}`}>{m.title}</p>{m.id==='real'&&!user?.vip&&<span className="text-[7px] text-amber-500 font-black">👑 VIP</span>}{tradingMode===m.id&&<span className={`text-[7px] font-black px-1.5 py-0.5 rounded border ${m.bg} ${m.brd} ${m.col}`}>АКТИВЕН</span>}</div>
                      <p className="text-[8px] text-slate-600 mt-0.5 leading-relaxed">{m.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className={`rounded-2xl border border-slate-800 overflow-hidden ${!user?.vip?'opacity-50 pointer-events-none':''}`}>
              <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between">
                <div className="flex items-center gap-2"><Bot size={11} className="text-slate-600"/><p className="text-[8px] font-black uppercase tracking-[.15em] text-slate-500">Авто-трейдинг</p>{!user?.vip&&<span className="text-[7px] text-amber-500 font-black">👑 VIP</span>}</div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={autoEnabled} onChange={e=>setAutoEnabled(e.target.checked)} className="sr-only peer"/>
                  <div className="w-9 h-5 bg-slate-800 border border-slate-700 rounded-full peer peer-checked:bg-cyan-500/20 peer-checked:border-cyan-500/50 after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-[14px] after:w-[14px] after:transition-all peer-checked:after:translate-x-4"/>
                </label>
              </div>
              <div className="p-4 space-y-3 border border-slate-800">
                {[{l:`Сумма на сделку ($)`,v:autoAmount,set:setAutoAmount,min:10,max:10000,step:10},{l:'Мин. спред (%)',v:autoSpread,set:setAutoSpread,min:0.05,max:2,step:0.05}].map((f,i)=>(
                  <div key={i}>
                    <div className="flex justify-between mb-1.5"><label className="text-[7px] font-black text-slate-600 uppercase tracking-wider">{f.l}</label><span className="text-[8px] font-mono text-cyan-400">{f.v}</span></div>
                    <input type="range" min={f.min} max={f.max} step={f.step} value={f.v} onChange={e=>f.set(Number(e.target.value))} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"/>
                  </div>
                ))}
                <div>
                  <p className="text-[7px] font-black text-slate-600 uppercase tracking-wider mb-1.5">Риск-профиль</p>
                  <div className="flex gap-2">
                    {[{id:'low',l:'Низкий',c:'text-emerald-400',bg:'bg-emerald-500/10',bd:'border-emerald-500/40'},{id:'medium',l:'Средний',c:'text-amber-400',bg:'bg-amber-500/10',bd:'border-amber-500/40'},{id:'high',l:'Высокий',c:'text-red-400',bg:'bg-red-500/10',bd:'border-red-500/40'}].map(r=>(
                      <button key={r.id} onClick={()=>setAutoRisk(r.id)} className={`flex-1 py-1.5 rounded-xl text-[8px] font-black uppercase border transition-all ${autoRisk===r.id?`${r.bg} ${r.bd} ${r.c}`:'bg-transparent border-slate-800 text-slate-600'}`}>{r.l}</button>
                    ))}
                  </div>
                </div>
                <button onClick={saveAuto} className="w-full py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-[9px] font-black uppercase tracking-wider hover:bg-cyan-500/15 transition-colors">{saving?'Сохранение...':'✓ Сохранить'}</button>
              </div>
            </div>
          </motion.div>
        )}

        {tab==='api' && (
          <motion.div key="api" initial={{opacity:0}} animate={{opacity:1}} className="rounded-2xl border border-slate-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/40"><p className="text-[8px] font-black uppercase tracking-[.15em] text-slate-500">API ключи бирж</p></div>
            <div className="p-4">
              {!user?.vip ? (
                <div className="text-center py-8 space-y-3"><Key size={24} className="text-slate-700 mx-auto"/><p className="text-[10px] text-slate-600">Только VIP тариф</p><button onClick={onUpgrade} className="text-[9px] text-amber-400 font-black underline">Обновиться →</button></div>
              ) : (
                <div className="space-y-2">
                  {(user?.connected_exchanges||[]).map((ex: string)=>(
                    <div key={ex} className="flex items-center justify-between p-3 bg-slate-800/30 rounded-xl border border-slate-800/50">
                      <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-400"/><span className="text-[10px] font-bold capitalize">{ex}</span></div>
                      <span className="text-[8px] text-slate-600 font-mono">••••••••</span>
                    </div>
                  ))}
                  <p className="text-[8px] text-slate-600 text-center pt-2">Добавьте биржи в разделе Стратегии</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {tab==='ref' && (
          <motion.div key="ref" initial={{opacity:0}} animate={{opacity:1}} className="rounded-2xl border border-slate-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/40"><p className="text-[8px] font-black uppercase tracking-[.15em] text-slate-500">Реферальная программа</p></div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {[{l:'Рефералов',v:user?.referred_users?.length||0,c:'text-cyan-400'},{l:'Заработано',v:`$${(user?.ref_earned||0).toFixed(2)}`,c:'text-emerald-400'},{l:'% профит',v:'10%',c:'text-amber-400'}].map((s,i)=>(
                  <div key={i} className="bg-slate-800/30 rounded-xl p-2.5 text-center border border-slate-800/50">
                    <p className="text-[6px] text-slate-600 uppercase font-black tracking-wider mb-0.5">{s.l}</p>
                    <p className={`text-sm font-black font-mono ${s.c}`}>{s.v}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-[7px] font-black text-slate-600 uppercase tracking-wider mb-2">Ваш код</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-3 font-mono text-sm font-black text-cyan-400 tracking-widest">{user?.ref_code||'REFXXXXX'}</div>
                  <button onClick={copyRef} className={`p-3 rounded-xl border transition-all ${copied?'bg-emerald-500/10 border-emerald-500/30 text-emerald-400':'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'}`}>{copied?<Check size={14}/>:<Copy size={14}/>}</button>
                </div>
              </div>
              <p className="text-[8px] text-slate-600 leading-relaxed p-3 bg-slate-800/20 rounded-xl border border-slate-800/40">Приглашайте друзей и получайте 10% от их комиссий навсегда.</p>
            </div>
          </motion.div>
        )}

        {tab==='settings' && (
          <motion.div key="st" initial={{opacity:0}} animate={{opacity:1}} className="space-y-3">
            <div className="rounded-2xl border border-slate-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/40 flex items-center gap-2"><Globe size={11} className="text-slate-600"/><p className="text-[8px] font-black uppercase tracking-[.15em] text-slate-500">Язык</p></div>
              <div className="p-3 grid grid-cols-2 gap-2">
                {LANGS_LIST.map(l=>(
                  <button key={l.code} onClick={()=>setLang(l.code)} className={`flex items-center gap-2 p-3 rounded-xl border transition-all ${lang===l.code?'bg-cyan-500/8 border-cyan-500/30 text-cyan-400':'bg-slate-800/20 border-slate-800/50 text-slate-500 hover:border-slate-700'}`}>
                    <span className="text-lg">{l.flag}</span><span className="text-[9px] font-black">{l.name}</span>{lang===l.code&&<Check size={9} className="ml-auto text-cyan-400"/>}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/40 flex items-center gap-2"><Shield size={11} className="text-slate-600"/><p className="text-[8px] font-black uppercase tracking-[.15em] text-slate-500">Аккаунт</p></div>
              <div className="p-4 space-y-2">
                {[{l:'ID',v:user?.id},{l:'Telegram',v:user?.tg_username?`@${user.tg_username}`:'—'},{l:'Тариф',v:user?.vip?`VIP (${vipDays}д)`:'Free'},{l:'Режим',v:tradingMode==='demo'?'🧪 Демо':'⚡ Реальный'}].map((row,i)=>(
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
    </div>
  );
}
