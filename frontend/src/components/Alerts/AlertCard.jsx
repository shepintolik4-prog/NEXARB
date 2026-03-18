/**
 * NEXARB Scanner - AlertCard
 * Displays a single user alert with toggle and delete controls
 */
import { Bell, BellOff, Trash2 } from 'lucide-react'
import clsx from 'clsx'

export const ALERT_TYPE_META = {
  cex_spread:     { label: 'CEX Spread',   color: 'text-accent-blue',   bg: 'bg-accent-blue/10   border-accent-blue/20'   },
  futures_spread: { label: 'Futures',      color: 'text-accent-yellow', bg: 'bg-accent-yellow/10 border-accent-yellow/20' },
  dex_spread:     { label: 'DEX Spread',   color: 'text-accent-purple', bg: 'bg-accent-purple/10 border-accent-purple/20' },
  funding_rate:   { label: 'Funding Rate', color: 'text-accent-green',  bg: 'bg-accent-green/10  border-accent-green/20'  },
}

export default function AlertCard({ alert, onToggle, onDelete }) {
  const meta = ALERT_TYPE_META[alert.alert_type] ?? ALERT_TYPE_META.cex_spread

  const lastTriggered = alert.last_triggered_at
    ? new Date(alert.last_triggered_at).toLocaleString('ru-RU', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  return (
    <div className={clsx(
      'rounded-2xl border bg-bg-card p-4 mb-2 animate-slide-up transition-opacity',
      alert.is_active ? 'border-bg-border' : 'border-bg-border opacity-55'
    )}>
      {/* Header row */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Type badge */}
          <span className={clsx(
            'text-xs font-bold px-2 py-0.5 rounded-lg border',
            meta.bg, meta.color
          )}>
            {meta.label}
          </span>
          {alert.symbol && (
            <span className="text-text-secondary font-mono text-xs">{alert.symbol}</span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
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

      {/* Criteria row */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-mono text-text-muted mb-2">
        <span>
          Spread ≥ <span className="text-accent-blue">{alert.min_spread_pct}%</span>
        </span>
        {alert.exchange_buy && (
          <span>
            Buy: <span className="text-text-secondary uppercase">{alert.exchange_buy}</span>
          </span>
        )}
        {alert.exchange_sell && (
          <span>
            Sell: <span className="text-text-secondary uppercase">{alert.exchange_sell}</span>
          </span>
        )}
        <span>Cooldown: {alert.cooldown_minutes}m</span>
      </div>

      {/* Footer row */}
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>Triggered {alert.trigger_count}×</span>
        {lastTriggered && <span>Last: {lastTriggered}</span>}
      </div>
    </div>
  )
}
