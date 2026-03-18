/**
 * NEXARB Scanner - AlertForm
 * Bottom-sheet form for creating a new alert
 */
import { useState } from 'react'
import clsx from 'clsx'
import { alertsApi } from '../../api/client'
import { ALERT_TYPE_META } from './AlertCard'
import toast from 'react-hot-toast'

const DEFAULT_FORM = {
  alert_type:       'cex_spread',
  symbol:           '',
  exchange_buy:     '',
  exchange_sell:    '',
  min_spread_pct:   1.0,
  min_volume_24h:   100_000,
  cooldown_minutes: 30,
}

export default function AlertForm({ user, onClose, onCreated }) {
  const [form, setForm] = useState(DEFAULT_FORM)
  const [loading, setLoading] = useState(false)

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = async () => {
    if (!user?.telegram_id) {
      toast.error('Not logged in')
      return
    }
    setLoading(true)
    try {
      const { data } = await alertsApi.create({
        ...form,
        telegram_id:     user.telegram_id,
        symbol:          form.symbol       || null,
        exchange_buy:    form.exchange_buy  || null,
        exchange_sell:   form.exchange_sell || null,
        min_spread_pct:  parseFloat(form.min_spread_pct),
        min_volume_24h:  parseFloat(form.min_volume_24h),
        cooldown_minutes: parseInt(form.cooldown_minutes),
      })
      onCreated?.(data)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-bg-secondary border-t border-bg-border rounded-t-2xl animate-slide-up pb-8 max-h-[88vh] overflow-y-auto">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-bg-border">
          <span className="font-semibold text-text-primary">New Alert</span>
          <button onClick={onClose} className="text-text-muted text-sm">Cancel</button>
        </div>

        <div className="px-4 py-4 space-y-5">
          {/* Alert type selector */}
          <div>
            <label className="text-text-secondary text-sm block mb-2">Alert Type</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(ALERT_TYPE_META).map(([val, meta]) => (
                <button
                  key={val}
                  onClick={() => set('alert_type', val)}
                  className={clsx(
                    'py-2.5 rounded-xl border text-xs font-medium transition-all',
                    form.alert_type === val
                      ? `${meta.bg} ${meta.color} font-bold`
                      : 'bg-bg-card border-bg-border text-text-muted'
                  )}
                >
                  {meta.label}
                </button>
              ))}
            </div>
          </div>

          {/* Symbol */}
          <Field label="Symbol (optional)">
            <Input
              value={form.symbol}
              onChange={(v) => set('symbol', v)}
              placeholder="BTC/USDT — leave empty for all"
              mono
            />
          </Field>

          {/* Exchange filters — only for CEX spread */}
          {form.alert_type === 'cex_spread' && (
            <div className="flex gap-2">
              <Field label="Buy Exchange" className="flex-1">
                <Input
                  value={form.exchange_buy}
                  onChange={(v) => set('exchange_buy', v)}
                  placeholder="binance"
                  mono
                />
              </Field>
              <Field label="Sell Exchange" className="flex-1">
                <Input
                  value={form.exchange_sell}
                  onChange={(v) => set('exchange_sell', v)}
                  placeholder="okx"
                  mono
                />
              </Field>
            </div>
          )}

          {/* Min Spread % */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-text-secondary text-sm">Min Spread %</label>
              <span className="text-accent-blue font-mono text-sm font-semibold">
                {form.min_spread_pct}%
              </span>
            </div>
            <input
              type="range"
              min="0.1" max="20" step="0.1"
              value={form.min_spread_pct}
              onChange={(e) => set('min_spread_pct', parseFloat(e.target.value))}
              className="w-full accent-accent-blue"
            />
            <div className="flex justify-between text-text-muted text-xs mt-1">
              <span>0.1%</span><span>20%</span>
            </div>
          </div>

          {/* Cooldown */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-text-secondary text-sm">Cooldown (repeat alert no sooner than)</label>
              <span className="text-accent-blue font-mono text-sm font-semibold">
                {form.cooldown_minutes}m
              </span>
            </div>
            <input
              type="range"
              min="5" max="240" step="5"
              value={form.cooldown_minutes}
              onChange={(e) => set('cooldown_minutes', parseInt(e.target.value))}
              className="w-full accent-accent-blue"
            />
            <div className="flex justify-between text-text-muted text-xs mt-1">
              <span>5m</span><span>4h</span>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-bg-card border border-bg-border rounded-xl p-3 text-xs text-text-muted font-mono">
            Fire when{' '}
            <span className="text-text-secondary">{form.symbol || 'any symbol'}</span>
            {' '}spread ≥{' '}
            <span className="text-accent-blue">{form.min_spread_pct}%</span>
            {form.exchange_buy ? ` on ${form.exchange_buy.toUpperCase()}` : ''}
            {form.exchange_sell ? `→${form.exchange_sell.toUpperCase()}` : ''}
            . Cooldown: <span className="text-accent-blue">{form.cooldown_minutes}m</span>.
          </div>
        </div>

        {/* Submit */}
        <div className="px-4 pt-2">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full py-3.5 bg-accent-blue rounded-xl text-white font-bold text-sm disabled:opacity-50 active:opacity-80"
          >
            {loading ? 'Creating…' : 'Create Alert'}
          </button>
        </div>
      </div>
    </>
  )
}

/* ── Small helpers ─────────────────────────────────────────────────────────── */

function Field({ label, children, className }) {
  return (
    <div className={className}>
      <label className="text-text-secondary text-sm block mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function Input({ value, onChange, placeholder, mono = false }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={clsx(
        'w-full bg-bg-card border border-bg-border rounded-xl px-3 py-2.5 text-sm',
        'text-text-primary placeholder:text-text-muted',
        'focus:outline-none focus:border-accent-blue',
        mono && 'font-mono'
      )}
    />
  )
}

function clsx(...args) {
  return args.filter(Boolean).join(' ')
}
