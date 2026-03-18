import { useEffect, useState } from 'react'
import { RefreshCw, TrendingUp, DollarSign } from 'lucide-react'
import clsx from 'clsx'
import { useFutures } from '../../hooks/useFutures'
import { useStore } from '../../store/useStore'
import { WebApp } from '../../telegram'

const MODE_TABS = [
  { id: 'spread',  label: 'Spot/Futures' },
  { id: 'funding', label: 'Funding Rates' },
]

export default function FuturesPage() {
  const { scanFutures, scanFunding, futuresResults, futuresLoading,
          fundingRates, fundingLoading, futuresFilters } = useFutures()
  const { setFuturesFilters } = useStore()
  const [mode, setMode] = useState('spread')

  useEffect(() => {
    if (mode === 'spread') scanFutures()
    else scanFunding()
  }, [mode])

  const handleRefresh = () => {
    WebApp.haptic.impact('light')
    if (mode === 'spread') scanFutures()
    else scanFunding()
  }

  const loading = mode === 'spread' ? futuresLoading : fundingLoading

  return (
    <div className="flex flex-col h-full">
      {/* Mode tabs + refresh */}
      <div className="sticky top-[57px] z-30 bg-bg-primary/95 backdrop-blur border-b border-bg-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 flex bg-bg-card border border-bg-border rounded-xl p-1">
            {MODE_TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setMode(t.id)}
                className={clsx(
                  'flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  mode === t.id
                    ? 'bg-accent-blue text-white'
                    : 'text-text-muted'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="p-2 rounded-xl bg-bg-card border border-bg-border text-text-secondary active:bg-bg-hover disabled:opacity-40"
          >
            <RefreshCw size={15} className={clsx(loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-bg-border text-xs font-mono text-text-muted">
        <span>{mode === 'spread' ? futuresResults.length : fundingRates.length} results</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-24">
        {loading && (
          <FuturesSkeleton />
        )}

        {!loading && mode === 'spread' && (
          futuresResults.length === 0
            ? <EmptyState onRefresh={handleRefresh} />
            : futuresResults.map((item, i) => (
                <FuturesCard key={`${item.symbol}-${item.spot_exchange}-${i}`} item={item} />
              ))
        )}

        {!loading && mode === 'funding' && (
          fundingRates.length === 0
            ? <EmptyState onRefresh={handleRefresh} />
            : fundingRates.map((item, i) => (
                <FundingCard key={`${item.exchange}-${item.symbol}-${i}`} item={item} />
              ))
        )}
      </div>
    </div>
  )
}

function FuturesCard({ item }) {
  const { symbol, base, spot_exchange, spot_price, futures_price,
          spread_pct, funding_rate, funding_rate_annual, direction } = item

  const isPositive = spread_pct > 0
  const spreadColor = isPositive ? 'text-accent-green' : 'text-accent-red'
  const spreadBg = isPositive
    ? 'bg-accent-green/10 border-accent-green/25'
    : 'bg-accent-red/10 border-accent-red/25'

  const fmt = (v) => v?.toLocaleString('en-US', { maximumFractionDigits: 4 }) ?? '—'

  return (
    <div className="rounded-2xl border border-bg-border bg-bg-card p-4 mb-2 animate-slide-up">
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="font-bold font-mono text-base text-text-primary">{base}</span>
          <span className="text-text-muted text-xs ml-1">{spot_exchange?.toUpperCase()}</span>
        </div>
        <div className={clsx(
          'flex items-center gap-1 px-2.5 py-1 rounded-xl border text-sm font-bold font-mono',
          spreadBg, spreadColor
        )}>
          <TrendingUp size={12} />
          {spread_pct > 0 ? '+' : ''}{spread_pct?.toFixed(3)}%
        </div>
      </div>

      <div className="flex gap-4 mb-3 text-xs">
        <div>
          <p className="text-text-muted mb-0.5">Spot</p>
          <p className="font-mono text-text-primary">${fmt(spot_price)}</p>
        </div>
        <div>
          <p className="text-text-muted mb-0.5">Futures</p>
          <p className="font-mono text-text-primary">${fmt(futures_price)}</p>
        </div>
        {funding_rate != null && (
          <div>
            <p className="text-text-muted mb-0.5">Funding 8h</p>
            <p className={clsx('font-mono', funding_rate >= 0 ? 'text-accent-green' : 'text-accent-red')}>
              {funding_rate >= 0 ? '+' : ''}{funding_rate?.toFixed(4)}%
            </p>
          </div>
        )}
      </div>

      <div className="text-xs text-text-muted">
        <span className="font-mono">Strategy: </span>
        <span className="text-text-secondary">
          {direction === 'long_spot_short_futures'
            ? 'Long Spot → Short Futures'
            : 'Short Spot → Long Futures'}
        </span>
        {funding_rate_annual != null && (
          <span className="ml-2 text-accent-yellow">~{funding_rate_annual?.toFixed(1)}%/yr</span>
        )}
      </div>
    </div>
  )
}

function FundingCard({ item }) {
  const { exchange, symbol, funding_rate, funding_rate_annual } = item
  const isPositive = funding_rate >= 0

  return (
    <div className="rounded-2xl border border-bg-border bg-bg-card p-4 mb-2 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-bold font-mono text-text-primary">{symbol?.split('/')[0]}</span>
          <span className="text-text-muted text-xs ml-1 font-mono">{exchange?.toUpperCase()}</span>
        </div>
        <div className="text-right">
          <div className={clsx(
            'font-bold font-mono text-base',
            isPositive ? 'text-accent-green' : 'text-accent-red'
          )}>
            {isPositive ? '+' : ''}{funding_rate?.toFixed(4)}%
          </div>
          <div className="text-text-muted text-xs font-mono">
            {funding_rate_annual?.toFixed(1)}%/yr
          </div>
        </div>
      </div>
      <div className="mt-2 text-xs text-text-muted">
        {isPositive ? '🐂 Longs pay shorts' : '🐻 Shorts pay longs'}
      </div>
    </div>
  )
}

function FuturesSkeleton() {
  return <>
    {Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="rounded-2xl border border-bg-border bg-bg-card p-4 mb-2 animate-pulse">
        <div className="flex justify-between mb-3">
          <div className="h-5 w-24 bg-bg-hover rounded" />
          <div className="h-6 w-16 bg-bg-hover rounded-xl" />
        </div>
        <div className="flex gap-4 mb-3">
          <div className="h-8 w-20 bg-bg-hover rounded" />
          <div className="h-8 w-20 bg-bg-hover rounded" />
          <div className="h-8 w-20 bg-bg-hover rounded" />
        </div>
        <div className="h-4 w-40 bg-bg-hover rounded" />
      </div>
    ))}
  </>
}

function EmptyState({ onRefresh }) {
  return (
    <div className="text-center py-16">
      <DollarSign size={28} className="text-text-muted mx-auto mb-3" />
      <p className="text-text-secondary text-sm mb-1">No data found</p>
      <button onClick={onRefresh} className="mt-3 px-4 py-2 bg-accent-blue/20 border border-accent-blue/30 rounded-xl text-accent-blue text-sm">
        Scan Now
      </button>
    </div>
  )
}
