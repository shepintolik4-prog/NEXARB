import { useEffect, useState } from 'react'
import { Plus, Bell, BellOff, Trash2, ChevronDown, CheckCircle } from 'lucide-react'
import clsx from 'clsx'
import { useStore } from '../../store/useStore'
import { alertsApi } from '../../api/client'
import { WebApp } from '../../telegram'
import toast from 'react-hot-toast'

const ALERT_TYPE_LABELS = {
  cex_spread:      { label: 'CEX Spread',     color: 'text-accent-blue',   bg: 'bg-accent-blue/10   border-accent-blue/20'   },
  futures_spread:  { label: 'Futures',        color: 'text-accent-yellow', bg: 'bg-accent-yellow/10 border-accent-yellow/20' },
  dex_spread:      { label: 'DEX Spread',     color: 'text-accent-purple', bg: 'bg-accent-purple/10 border-accent-purple/20' },
  funding_rate:    { label: 'Funding Rate',   color: 'text-accent-green',  bg: 'bg-accent-green/10  border-accent-green/20'  },
}

export default function AlertsPage() {
  const { user, alerts, setAlerts, setAlertsLoading, alertsLoading,
          removeAlert, updateAlert, addAlert } = useStore()
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    if (user?.telegram_id) loadAlerts()
  }, [user])

  const loadAlerts = async () => {
    if (!user?.telegram_id) return
    setAlertsLoading(true)
    try {
      const { data } = await alertsApi.list(user.telegram_id)
      setAlerts(data || [])
    } catch (err) {
      toast.error('Failed to load alerts')
    } finally {
      setAlertsLoading(false)
    }
  }

  const handleToggle = async (alert) => {
    WebApp.haptic.impact('light')
    try {
      await alertsApi.update(alert.id, {
        alert_id: alert.id,
        telegram_id: user.telegram_id,
        is_active: !alert.is_active,
      })
      updateAlert(alert.id, { is_active: !alert.is_active })
    } catch {
      toast.error('Failed to update alert')
    }
  }

  const handleDelete = async (alert) => {
    WebApp.haptic.notification('warning')
    try {
      await alertsApi.delete(alert.id, user.telegram_id)
      removeAlert(alert.id)
      toast.success('Alert deleted')
    } catch {
      toast.error('Failed to delete alert')
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-[57px] z-30 bg-bg-primary/95 backdrop-blur border-b border-bg-border px-4 py-3 flex items-center justify-between">
        <span className="text-text-secondary text-sm font-mono">
          {alerts.filter((a) => a.is_active).length} active / {alerts.length} total
        </span>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-blue text-white rounded-xl text-sm font-medium"
        >
          <Plus size={14} />
          New Alert
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-24">
        {alertsLoading && <AlertsSkeleton />}

        {!alertsLoading && alerts.length === 0 && (
          <EmptyAlerts onAdd={() => setShowForm(true)} />
        )}

        {alerts.map((alert) => (
          <AlertCard
            key={alert.id}
            alert={alert}
            onToggle={() => handleToggle(alert)}
            onDelete={() => handleDelete(alert)}
          />
        ))}
      </div>

      {/* Create Form Sheet */}
      {showForm && (
        <AlertCreateSheet
          user={user}
          onClose={() => setShowForm(false)}
          onCreated={(a) => {
            addAlert(a)
            setShowForm(false)
            toast.success('Alert created!')
          }}
        />
      )}
    </div>
  )
}

function AlertCard({ alert, onToggle, onDelete }) {
  const meta = ALERT_TYPE_LABELS[alert.alert_type] || ALERT_TYPE_LABELS.cex_spread
  const lastTriggered = alert.last_triggered_at
    ? new Date(alert.last_triggered_at).toLocaleString('ru-RU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className={clsx(
      'rounded-2xl border bg-bg-card p-4 mb-2 animate-slide-up transition-opacity',
      alert.is_active ? 'border-bg-border' : 'border-bg-border opacity-60'
    )}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={clsx('text-xs font-bold px-2 py-0.5 rounded-lg border', meta.bg, meta.color)}>
            {meta.label}
          </span>
          {alert.symbol && (
            <span className="text-text-secondary font-mono text-xs">{alert.symbol}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onToggle}
            className={clsx(
              'p-1.5 rounded-lg transition-colors',
              alert.is_active
                ? 'bg-accent-green/10 text-accent-green'
                : 'bg-bg-hover text-text-muted'
            )}
          >
            {alert.is_active ? <Bell size={14} /> : <BellOff size={14} />}
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg bg-accent-red/10 text-accent-red"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs font-mono text-text-muted">
        <span>≥ <span className="text-accent-blue">{alert.min_spread_pct}%</span> spread</span>
        {alert.exchange_buy && <span>Buy: <span className="text-text-secondary uppercase">{alert.exchange_buy}</span></span>}
        {alert.exchange_sell && <span>Sell: <span className="text-text-secondary uppercase">{alert.exchange_sell}</span></span>}
        <span>Cooldown: {alert.cooldown_minutes}m</span>
      </div>

      <div className="flex items-center justify-between mt-2 text-xs text-text-muted">
        <span>Triggered {alert.trigger_count}×</span>
        {lastTriggered && <span>Last: {lastTriggered}</span>}
      </div>
    </div>
  )
}

function AlertCreateSheet({ user, onClose, onCreated }) {
  const [form, setForm] = useState({
    alert_type:     'cex_spread',
    symbol:         '',
    exchange_buy:   '',
    exchange_sell:  '',
    min_spread_pct: 1.0,
    min_volume_24h: 100000,
    cooldown_minutes: 30,
  })
  const [loading, setLoading] = useState(false)

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const handleSubmit = async () => {
    if (!user?.telegram_id) { toast.error('Not logged in'); return }
    setLoading(true)
    try {
      const { data } = await alertsApi.create({
        ...form,
        telegram_id: user.telegram_id,
        symbol: form.symbol || null,
        exchange_buy: form.exchange_buy || null,
        exchange_sell: form.exchange_sell || null,
        min_spread_pct: parseFloat(form.min_spread_pct),
        min_volume_24h: parseFloat(form.min_volume_24h),
        cooldown_minutes: parseInt(form.cooldown_minutes),
      })
      onCreated(data)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-bg-secondary border-t border-bg-border rounded-t-2xl animate-slide-up pb-8 max-h-[85vh] overflow-y-auto">
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-bg-border" /></div>
        <div className="px-4 py-3 border-b border-bg-border flex items-center justify-between">
          <span className="font-semibold text-text-primary">New Alert</span>
          <button onClick={onClose} className="text-text-muted text-sm">Cancel</button>
        </div>
        <div className="px-4 py-4 space-y-4">
          {/* Alert Type */}
          <div>
            <label className="text-text-secondary text-sm block mb-1.5">Alert Type</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(ALERT_TYPE_LABELS).map(([val, meta]) => (
                <button
                  key={val}
                  onClick={() => set('alert_type', val)}
                  className={clsx(
                    'py-2 rounded-xl border text-xs font-medium transition-colors',
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
          <FormField label="Symbol (optional)" placeholder="BTC/USDT">
            <input value={form.symbol} onChange={(e) => set('symbol', e.target.value)}
              placeholder="BTC/USDT — leave empty for all"
              className="w-full bg-bg-card border border-bg-border rounded-xl px-3 py-2.5 text-sm text-text-primary font-mono placeholder:text-text-muted focus:outline-none focus:border-accent-blue" />
          </FormField>

          {/* Exchanges */}
          {form.alert_type === 'cex_spread' && (
            <div className="flex gap-2">
              <FormField label="Buy Exchange" className="flex-1">
                <input value={form.exchange_buy} onChange={(e) => set('exchange_buy', e.target.value)}
                  placeholder="binance"
                  className="w-full bg-bg-card border border-bg-border rounded-xl px-3 py-2.5 text-sm font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue" />
              </FormField>
              <FormField label="Sell Exchange" className="flex-1">
                <input value={form.exchange_sell} onChange={(e) => set('exchange_sell', e.target.value)}
                  placeholder="okx"
                  className="w-full bg-bg-card border border-bg-border rounded-xl px-3 py-2.5 text-sm font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue" />
              </FormField>
            </div>
          )}

          {/* Min Spread */}
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-text-secondary text-sm">Min Spread %</label>
              <span className="text-accent-blue font-mono text-sm">{form.min_spread_pct}%</span>
            </div>
            <input type="range" min="0.1" max="20" step="0.1" value={form.min_spread_pct}
              onChange={(e) => set('min_spread_pct', parseFloat(e.target.value))}
              className="w-full accent-accent-blue" />
          </div>

          {/* Cooldown */}
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-text-secondary text-sm">Cooldown (minutes)</label>
              <span className="text-accent-blue font-mono text-sm">{form.cooldown_minutes}m</span>
            </div>
            <input type="range" min="5" max="240" step="5" value={form.cooldown_minutes}
              onChange={(e) => set('cooldown_minutes', parseInt(e.target.value))}
              className="w-full accent-accent-blue" />
          </div>
        </div>

        <div className="px-4 pt-2">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full py-3 bg-accent-blue rounded-xl text-white font-bold text-sm disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Alert'}
          </button>
        </div>
      </div>
    </>
  )
}

function FormField({ label, children, className }) {
  return (
    <div className={className}>
      <label className="text-text-secondary text-sm block mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function AlertsSkeleton() {
  return <>
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="rounded-2xl border border-bg-border bg-bg-card p-4 mb-2 animate-pulse">
        <div className="flex justify-between mb-2">
          <div className="h-5 w-24 bg-bg-hover rounded-lg" />
          <div className="flex gap-2">
            <div className="h-7 w-7 bg-bg-hover rounded-lg" />
            <div className="h-7 w-7 bg-bg-hover rounded-lg" />
          </div>
        </div>
        <div className="h-4 w-3/4 bg-bg-hover rounded mb-2" />
        <div className="h-3 w-1/2 bg-bg-hover rounded" />
      </div>
    ))}
  </>
}

function EmptyAlerts({ onAdd }) {
  return (
    <div className="text-center py-16">
      <Bell size={28} className="text-text-muted mx-auto mb-3" />
      <p className="text-text-secondary text-sm mb-1">No alerts configured</p>
      <p className="text-text-muted text-xs mb-4">Get Telegram notifications when spreads match your criteria</p>
      <button onClick={onAdd} className="px-4 py-2 bg-accent-blue/20 border border-accent-blue/30 rounded-xl text-accent-blue text-sm font-medium">
        Create First Alert
      </button>
    </div>
  )
}
