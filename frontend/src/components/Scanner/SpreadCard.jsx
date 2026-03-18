import { ArrowRight, TrendingUp, Volume2 } from 'lucide-react'
import clsx from 'clsx'

// Colour coding by spread %
function spreadColor(pct) {
  if (pct >= 5) return 'text-accent-red'
  if (pct >= 2) return 'text-accent-yellow'
  if (pct >= 1) return 'text-accent-green'
  return 'text-accent-blue'
}
function spreadBg(pct) {
  if (pct >= 5) return 'bg-accent-red/10 border-accent-red/25'
  if (pct >= 2) return 'bg-accent-yellow/10 border-accent-yellow/25'
  if (pct >= 1) return 'bg-accent-green/10 border-accent-green/25'
  return 'bg-accent-blue/10 border-accent-blue/25'
}

function formatPrice(p) {
  if (!p) return '—'
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (p >= 1)    return p.toFixed(4)
  return p.toFixed(6)
}

function formatVol(v) {
  if (!v) return '—'
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}

export default function SpreadCard({ spread, onClick }) {
  const { symbol, base, quote, exchange_buy, exchange_sell,
          price_buy, price_sell, spread_pct, min_volume_24h } = spread

  const color   = spreadColor(spread_pct)
  const bgClass = spreadBg(spread_pct)

  return (
    <button
      onClick={() => onClick?.(spread)}
      className={clsx(
        'w-full text-left rounded-2xl border p-4 mb-2',
        'bg-bg-card border-bg-border active:scale-[0.98] transition-transform',
        'animate-slide-up'
      )}
    >
      {/* Top row: symbol + spread badge */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="font-bold text-text-primary font-mono text-base">{base}</span>
          <span className="text-text-muted font-mono text-sm">/{quote}</span>
        </div>
        <div className={clsx(
          'flex items-center gap-1 px-2.5 py-1 rounded-xl border text-sm font-bold font-mono',
          bgClass, color
        )}>
          <TrendingUp size={12} />
          +{spread_pct.toFixed(2)}%
        </div>
      </div>

      {/* Exchange row */}
      <div className="flex items-center gap-2 mb-3">
        <ExchangeBadge name={exchange_buy} type="buy" />
        <ArrowRight size={14} className="text-text-muted shrink-0" />
        <ExchangeBadge name={exchange_sell} type="sell" />
      </div>

      {/* Price row */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex gap-4">
          <div>
            <span className="text-text-muted">Buy </span>
            <span className="font-mono text-accent-green">${formatPrice(price_buy)}</span>
          </div>
          <div>
            <span className="text-text-muted">Sell </span>
            <span className="font-mono text-accent-red">${formatPrice(price_sell)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 text-text-muted">
          <Volume2 size={10} />
          <span className="font-mono">{formatVol(min_volume_24h)}</span>
        </div>
      </div>
    </button>
  )
}

function ExchangeBadge({ name, type }) {
  const colors = {
    buy:  'bg-accent-green/10 border-accent-green/20 text-accent-green',
    sell: 'bg-accent-red/10   border-accent-red/20   text-accent-red',
  }
  return (
    <span className={clsx(
      'flex-1 text-center text-xs font-bold uppercase font-mono px-2 py-1 rounded-lg border truncate',
      colors[type]
    )}>
      {name}
    </span>
  )
}
