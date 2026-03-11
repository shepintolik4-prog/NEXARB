import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Crown,
  TrendingUp,
  BarChart3,
  Users,
  Copy,
  Check,
  Key,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Bot,
  Globe,
  ChevronDown,
  Zap,
  Shield,
  Star,
  ExternalLink,
} from 'lucide-react';
import { EXCHS } from '../constants';
import { encrypt, maskKey } from '../utils/crypto';

interface ProfileProps {
  user: {
    id: string;
    balance: number;
    profit: number;
    trades: number;
    vip: boolean;
    vip_expires: number | null;
    connected_exchanges: string[];
    ref_code: string;
  };
  lang: string;
  setLang: (l: string) => void;
  t: (key: string) => string;
  onUpgrade: () => void;
}

interface ApiKey {
  exchangeId: string;
  keyMask: string;
  isActive: boolean;
}

interface AutoSettings {
  amount: number;
  minSpread: number;
  maxRisk: 'low' | 'medium' | 'high';
}

const LANG_OPTIONS = [
  { code: 'ru', label: 'RU', flag: '🇷🇺', name: 'Русский' },
  { code: 'en', label: 'EN', flag: '🇺🇸', name: 'English' },
  { code: 'de', label: 'DE', flag: '🇩🇪', name: 'Deutsch' },
  { code: 'zh', label: 'ZH', flag: '🇨🇳', name: '中文' },
];

const SECTION = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) => (
  <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
    <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800 bg-slate-800/40">
      <span className="text-cyan-400">{icon}</span>
      <h3 className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-300">{title}</h3>
    </div>
    <div className="p-4">{children}</div>
  </div>
);

export default function Profile({ user, lang, setLang, t, onUpgrade }: ProfileProps) {
  // Stats (mock enriched data)
  const winRate = user.trades > 0 ? Math.min(95, 70 + user.trades * 2) : 0;
  const avgProfit = user.trades > 0 ? user.profit / user.trades : 0;

  // Referral
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const refLink = `https://t.me/nexarb_bot?start=${user.ref_code}`;

  const copyToClipboard = async (text: string, type: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // fallback
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  // API Keys
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([
    { exchangeId: 'binance', keyMask: 'abcd...ef12', isActive: true },
    { exchangeId: 'okx', keyMask: 'xxxx...3k9p', isActive: true },
  ]);
  const [addingKey, setAddingKey] = useState(false);
  const [newKeyExchange, setNewKeyExchange] = useState('bybit');
  const [newApiKey, setNewApiKey] = useState('');
  const [newApiSecret, setNewApiSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);

  const handleSaveKey = () => {
    if (!newApiKey || !newApiSecret) return;
    const masked = maskKey(newApiKey);
    setApiKeys(prev => [...prev, { exchangeId: newKeyExchange, keyMask: masked, isActive: true }]);
    setNewApiKey('');
    setNewApiSecret('');
    setAddingKey(false);
  };

  const handleDeleteKey = (exchangeId: string) => {
    setApiKeys(prev => prev.filter(k => k.exchangeId !== exchangeId));
  };

  // Auto-trading settings
  const [autoSettings, setAutoSettings] = useState<AutoSettings>({
    amount: 200,
    minSpread: 0.5,
    maxRisk: 'low',
  });
  const [autoSaved, setAutoSaved] = useState(false);

  const saveAutoSettings = () => {
    setAutoSaved(true);
    setTimeout(() => setAutoSaved(false), 2000);
  };

  // VIP expiry
  const vipExpiryStr = user.vip_expires
    ? new Date(user.vip_expires * 1000).toLocaleDateString()
    : null;

  return (
    <div className="space-y-4">

      {/* ── HERO CARD ─────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl border p-5 space-y-4"
        style={{
          background: user.vip
            ? 'linear-gradient(135deg, rgba(245,166,35,0.08) 0%, rgba(10,15,30,1) 60%)'
            : 'linear-gradient(135deg, rgba(34,211,238,0.06) 0%, rgba(10,15,30,1) 60%)',
          borderColor: user.vip ? 'rgba(245,166,35,0.3)' : 'rgba(34,211,238,0.2)',
        }}
      >
        {/* glow */}
        <div
          className="absolute -top-12 -right-12 w-40 h-40 rounded-full blur-3xl opacity-20"
          style={{ background: user.vip ? '#f5a623' : '#22d3ee' }}
        />

        <div className="relative flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl shadow-xl flex-shrink-0"
            style={{
              background: user.vip
                ? 'linear-gradient(135deg,#f5a623,#e8890c)'
                : 'linear-gradient(135deg,#22d3ee,#a855f7)',
            }}
          >
            {user.vip ? '👑' : '👤'}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">
              ID: {user.id}
            </p>
            <h2 className="text-lg font-black tracking-tight truncate">
              {user.id === 'demo_user' ? 'Demo User' : user.id.replace('tg_', 'User #')}
            </h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {user.vip ? (
                <span className="bg-amber-500/15 text-amber-400 text-[9px] font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
                  👑 VIP
                  {vipExpiryStr && (
                    <span className="opacity-70 ml-1">· {t('profile_vip_expires')} {vipExpiryStr}</span>
                  )}
                </span>
              ) : (
                <span className="bg-slate-700/50 text-slate-400 text-[9px] font-bold px-2 py-0.5 rounded-full border border-slate-700">
                  FREE
                </span>
              )}
              <span className="bg-cyan-500/10 text-cyan-400 text-[9px] font-bold px-2 py-0.5 rounded-full border border-cyan-500/20">
                {user.trades} trades
              </span>
            </div>
          </div>
        </div>

        {!user.vip && (
          <button
            onClick={onUpgrade}
            className="relative w-full py-3 rounded-xl font-black text-sm text-slate-900 transition-all active:scale-[0.98]"
            style={{ background: 'linear-gradient(90deg,#22d3ee,#a855f7)' }}
          >
            ⚡ {t('profile_upgrade')}
          </button>
        )}
      </motion.div>

      {/* ── STATISTICS ───────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <SECTION title={t('profile_stats')} icon={<BarChart3 size={14} />}>
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                label: t('profile_total_profit'),
                value: `+$${user.profit.toFixed(2)}`,
                color: 'text-emerald-400',
                sub: user.vip ? '▲ VIP rate' : '▲ standard rate',
              },
              {
                label: t('profile_total_trades'),
                value: user.trades.toString(),
                color: 'text-cyan-400',
                sub: `${user.connected_exchanges.length} exchanges`,
              },
              {
                label: t('profile_win_rate'),
                value: `${winRate.toFixed(0)}%`,
                color: winRate >= 70 ? 'text-emerald-400' : 'text-amber-400',
                sub: winRate >= 80 ? '🔥 excellent' : '📈 good',
              },
              {
                label: t('profile_avg_profit'),
                value: `$${avgProfit.toFixed(2)}`,
                color: 'text-purple-400',
                sub: 'per trade',
              },
            ].map((s, i) => (
              <div key={i} className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50 space-y-1">
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{s.label}</p>
                <p className={`text-xl font-black font-mono ${s.color}`}>{s.value}</p>
                <p className="text-[9px] text-slate-600 font-mono">{s.sub}</p>
              </div>
            ))}
          </div>
        </SECTION>
      </motion.div>

      {/* ── REFERRAL ─────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <SECTION title={t('profile_ref')} icon={<Users size={14} />}>
          <div className="space-y-3">
            {/* Ref code */}
            <div className="space-y-1.5">
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{t('profile_ref_code')}</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 font-mono font-bold text-sm text-cyan-400 tracking-widest">
                  {user.ref_code}
                </div>
                <button
                  onClick={() => copyToClipboard(user.ref_code, 'code')}
                  className={`px-3 py-2.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 ${
                    copied === 'code'
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  {copied === 'code' ? <Check size={12} /> : <Copy size={12} />}
                  {copied === 'code' ? t('profile_ref_copied') : t('profile_ref_copy')}
                </button>
              </div>
            </div>

            {/* Ref link */}
            <div className="space-y-1.5">
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{t('profile_ref_link')}</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 font-mono text-[10px] text-slate-400 truncate">
                  {refLink}
                </div>
                <button
                  onClick={() => copyToClipboard(refLink, 'link')}
                  className={`px-3 py-2.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 flex-shrink-0 ${
                    copied === 'link'
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  {copied === 'link' ? <Check size={12} /> : <ExternalLink size={12} />}
                  {copied === 'link' ? t('profile_ref_copied') : t('profile_ref_copy')}
                </button>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/40 text-center">
                <p className="text-[9px] font-bold text-slate-500 uppercase">{t('profile_ref_invited')}</p>
                <p className="text-lg font-black font-mono text-slate-200">0</p>
              </div>
              <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/40 text-center">
                <p className="text-[9px] font-bold text-slate-500 uppercase">{t('profile_ref_earned')}</p>
                <p className="text-lg font-black font-mono text-emerald-400">$0.00</p>
              </div>
            </div>
          </div>
        </SECTION>
      </motion.div>

      {/* ── API KEYS ─────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <SECTION title={t('profile_api')} icon={<Key size={14} />}>
          <div className="space-y-2">
            {/* Existing keys */}
            {apiKeys.map(key => {
              const exch = EXCHS.find(e => e.id === key.exchangeId);
              return (
                <div
                  key={key.exchangeId}
                  className="flex items-center justify-between bg-slate-800/50 rounded-xl px-3 py-2.5 border border-slate-700/50"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{exch?.logo || '⬡'}</span>
                    <div>
                      <p className="text-xs font-bold">{exch?.name || key.exchangeId}</p>
                      <p className="text-[10px] font-mono text-slate-500">{key.keyMask}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      {t('profile_api_active')}
                    </span>
                    <button
                      onClick={() => handleDeleteKey(key.exchangeId)}
                      className="text-slate-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Add key form */}
            <AnimatePresence>
              {addingKey && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 p-3 space-y-3 mt-1">
                    {/* Exchange selector */}
                    <div className="space-y-1">
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Exchange</p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {EXCHS.slice(0, 6).map(ex => (
                          <button
                            key={ex.id}
                            onClick={() => setNewKeyExchange(ex.id)}
                            className={`py-1.5 rounded-lg text-[10px] font-bold border transition-all flex items-center justify-center gap-1 ${
                              newKeyExchange === ex.id
                                ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400'
                                : 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-600'
                            }`}
                          >
                            <span>{ex.logo}</span>
                            <span>{ex.name.split(' ')[0]}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* API Key */}
                    <div className="space-y-1">
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                        {t('profile_api_key')}
                      </p>
                      <input
                        value={newApiKey}
                        onChange={e => setNewApiKey(e.target.value)}
                        placeholder={t('profile_api_placeholder_key')}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs font-mono focus:border-cyan-500 outline-none placeholder:text-slate-700"
                      />
                    </div>

                    {/* API Secret */}
                    <div className="space-y-1">
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                        {t('profile_api_secret')}
                      </p>
                      <div className="relative">
                        <input
                          type={showSecret ? 'text' : 'password'}
                          value={newApiSecret}
                          onChange={e => setNewApiSecret(e.target.value)}
                          placeholder={t('profile_api_placeholder_secret')}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 pr-10 text-xs font-mono focus:border-cyan-500 outline-none placeholder:text-slate-700"
                        />
                        <button
                          onClick={() => setShowSecret(!showSecret)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400"
                        >
                          {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveKey}
                        disabled={!newApiKey || !newApiSecret}
                        className="flex-1 bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 font-black py-2 rounded-xl text-xs transition-all"
                      >
                        {t('profile_api_save')}
                      </button>
                      <button
                        onClick={() => { setAddingKey(false); setNewApiKey(''); setNewApiSecret(''); }}
                        className="px-4 bg-slate-800 text-slate-400 font-bold py-2 rounded-xl text-xs border border-slate-700 hover:border-slate-600 transition-all"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {!addingKey && (
              <button
                onClick={() => setAddingKey(true)}
                className="w-full py-2.5 rounded-xl border border-dashed border-slate-700 text-slate-500 hover:border-cyan-500/40 hover:text-cyan-400 transition-all text-xs font-bold flex items-center justify-center gap-1.5 mt-1"
              >
                <Plus size={12} />
                {t('profile_api_add')}
              </button>
            )}
          </div>
        </SECTION>
      </motion.div>

      {/* ── AUTO-TRADING SETTINGS ─────────────────── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <SECTION title={t('profile_auto')} icon={<Bot size={14} />}>
          <div className="space-y-4">
            {/* Amount */}
            <div className="space-y-1.5">
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                {t('profile_auto_amount')}
              </p>
              <div className="relative">
                <input
                  type="number"
                  value={autoSettings.amount}
                  onChange={e => setAutoSettings(s => ({ ...s, amount: Number(e.target.value) }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm font-mono font-bold focus:border-cyan-500 outline-none"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-500">
                  USDT
                </span>
              </div>
              {/* Quick presets */}
              <div className="flex gap-1.5">
                {[100, 200, 500, 1000].map(v => (
                  <button
                    key={v}
                    onClick={() => setAutoSettings(s => ({ ...s, amount: v }))}
                    className={`flex-1 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                      autoSettings.amount === v
                        ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-400'
                        : 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-600'
                    }`}
                  >
                    ${v}
                  </button>
                ))}
              </div>
            </div>

            {/* Min spread */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                  {t('profile_auto_min_spread')}
                </p>
                <span className="text-[10px] font-mono font-bold text-cyan-400">{autoSettings.minSpread}%</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="2"
                step="0.1"
                value={autoSettings.minSpread}
                onChange={e => setAutoSettings(s => ({ ...s, minSpread: Number(e.target.value) }))}
                className="w-full accent-cyan-400 h-1.5 rounded-full appearance-none bg-slate-700 cursor-pointer"
              />
              <div className="flex justify-between text-[9px] text-slate-600 font-mono">
                <span>0.1%</span><span>2.0%</span>
              </div>
            </div>

            {/* Risk */}
            <div className="space-y-1.5">
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                {t('profile_auto_max_risk')}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'low', label: t('profile_auto_risk_low'), color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/40' },
                  { id: 'medium', label: t('profile_auto_risk_med'), color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/40' },
                  { id: 'high', label: t('profile_auto_risk_high'), color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/40' },
                ].map(r => (
                  <button
                    key={r.id}
                    onClick={() => setAutoSettings(s => ({ ...s, maxRisk: r.id as any }))}
                    className={`py-2 rounded-xl border text-xs font-bold transition-all ${
                      autoSettings.maxRisk === r.id
                        ? `${r.bg} ${r.color}`
                        : 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-600'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Save button */}
            <button
              onClick={saveAutoSettings}
              className={`w-full py-3 rounded-xl font-black text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${
                autoSaved
                  ? 'bg-emerald-500/10 border border-emerald-500/40 text-emerald-400'
                  : 'bg-gradient-to-r from-cyan-500 to-purple-600 text-slate-900 shadow-lg shadow-cyan-500/20'
              }`}
            >
              {autoSaved ? <><Check size={14} /> {t('profile_auto_saved')}</> : t('profile_auto_save')}
            </button>
          </div>
        </SECTION>
      </motion.div>

      {/* ── LANGUAGE ─────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <SECTION title={t('profile_lang')} icon={<Globe size={14} />}>
          <div className="grid grid-cols-4 gap-2">
            {LANG_OPTIONS.map(l => (
              <button
                key={l.code}
                onClick={() => setLang(l.code)}
                className={`relative py-3 rounded-xl border flex flex-col items-center gap-1 transition-all active:scale-95 ${
                  lang === l.code
                    ? 'bg-cyan-500/10 border-cyan-500/50 shadow-[0_0_12px_rgba(34,211,238,0.1)]'
                    : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                }`}
              >
                {lang === l.code && (
                  <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-cyan-400" />
                )}
                <span className="text-xl">{l.flag}</span>
                <span className={`text-[10px] font-black tracking-widest ${lang === l.code ? 'text-cyan-400' : 'text-slate-400'}`}>
                  {l.label}
                </span>
                <span className="text-[8px] text-slate-600 font-medium">{l.name}</span>
              </button>
            ))}
          </div>
        </SECTION>
      </motion.div>

    </div>
  );
}
