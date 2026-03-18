import { useEffect, useState } from 'react'
import { RefreshCw, Search, BarChart2 } from 'lucide-react'
import clsx from 'clsx'
import { useScanner } from '../../hooks/useScanner'
import { useStore } from '../../store/useStore'
import SpreadCard from './SpreadCard'
import { FilterPanel } from './FilterPanel'
import { WebApp } from '../../telegram'
import toast from 'react-hot-toast'

const CEX_FILTER_FIELDS = [
  { key: 'minSpread', label: 'Min Spread %', type: 'number', min: 0.1, max: 10, step: 0.1, suffix: '%', default: 0.5 },
  { key: 'minVolume', label: 'Min Volume 24h', type: 'number', min: 0, max: 5000000, step: 50000, suffix: '', default: 50000 },
  { key: 'limit',    label: 'Max Results',   type: 'number', min: 10, max: 200, step: 10, suffix: '', default: 100 },
  { key: 'quote',    label: 'Quote Currency', type: 'select',
    options: [
      { value: 'USDT', label: 'USDT' },
      { value: 'USDC', label: 'USDC' },
      { value: 'BTC',  label: 'BTC'  },
    ],
    default: 'USDT',
  },
]

export default function ScannerPage() {
  const { scan, cexResults, cexLoading, cexError,
          cexScannedExchanges, cexLastScan, cexFilters } = useScanner()
  const { setCexFilters, wsConnected } = useStore()
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState(null)

  // Auto-scan on mount
  useEffect(() => { scan() }, [])

  const filtered = cexResults.filter((r) =>
    !search || r.symbol.toLowerCase().includes(search.toLowerCase()) ||
    r.exchange_buy.includes(search) || r.exchange_sell.includes(search)
  )

  const handleRefresh = () => {
    WebApp.haptic.impact('light')
    scan()
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-3 sticky top-[57px] z-30 bg-bg-primary/95 backdrop-blur border-b border-bg-border">
        {/* Search */}
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="BTC, binance..."
            className="w-full bg-bg-card border border-bg-border rounded-xl pl-8 pr-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue font-mono"
          />
        </div>
        <FilterPanel
          filters={cexFilters}
          onChange={setCexFilters}
          onApply={scan}
          fields={CEX_FILTER_FIELDS}
        />
        <button
          onClick={handleRefresh}
          disabled={cexLoading}
          className="p-2 rounded-xl bg-bg-card border border-bg-border text-text-secondary active:bg-bg-hover disabled:opacity-40"
        >
          <RefreshCw size={15} className={clsx(cexLoading && 'animate-spin')} />
        </button>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-bg-border text-xs font-mono text-text-muted">
        <span className="text-text-secondary">{filtered.length} spreads</span>
        {cexScannedExchanges.length > 0 && (
          <span>{cexScannedExchanges.length} exchanges</span>
        )}
        {cexLastScan && (
          <span>{cexLastScan.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        )}
        {wsConnected && (
          <span className="text-accent-green animate-pulse-green ml-auto">● LIVE</span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-24">
        {cexLoading && cexResults.length === 0 && <ScannerSkeleton />}

        {cexError && !cexLoading && (
          <div className="text-center py-12 text-accent-red">
            <p className="text-sm">{cexError}</p>
            <button onClick={handleRefresh} className="mt-3 text-accent-blue text-sm underline">
              Retry
            </button>
          </div>
        )}

        {!cexLoading && !cexError && filtered.length === 0 && (
          <EmptyState onScan={handleRefresh} />
        )}

        {filtered.map((spread, i) => (
          <SpreadCard
            key={`${spread.symbol}-${spread.exchange_buy}-${spread.exchange_sell}-${i}`}
            spread={spread}
            onClick={setDetail}
          />
        ))}
      </div>

      {/* Detail sheet */}
      {detail && (
        <SpreadDetailSheet spread={detail} onClose={() => setDetail(null)} />
      )}
    </div>
  )
}

function ScannerSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-bg-border bg-bg-card p-4 mb-2 animate-pulse">
          <div className="flex justify-between mb-3">
            <div className="h-5 w-20 bg-bg-hover rounded" />
            <div className="h-6 w-14 bg-bg-hover rounded-xl" />
          </div>
          <div className="flex gap-2 mb-3">
            <div className="h-7 flex-1 bg-bg-hover rounded-lg" />
            <div className="h-4 w-4 bg-bg-hover rounded" />
            <div className="h-7 flex-1 bg-bg-hover rounded-lg" />
          </div>
          <div className="h-4 w-3/4 bg-bg-hover rounded" />
        </div>
      ))}
    </>
  )
}

function EmptyState({ onScan }) {
  return (
    <div className="text-center py-16">
      <div className="w-14 h-14 rounded-2xl bg-bg-card border border-bg-border flex items-center justify-center mx-auto mb-4">
        <BarChart2 size={24} className="text-text-muted" />
      </div>
      <p className="text-text-secondary text-sm mb-1">No spreads found</p>
      <p className="text-text-muted text-xs mb-4">Try lowering the minimum spread or volume</p>
      <button onClick={onScan} className="px-4 py-2 bg-accent-blue/20 border border-accent-blue/30 rounded-xl text-accent-blue text-sm font-medium">
        Scan Now
      </button>
    </div>
  )
}

function SpreadDetailSheet({ spread, onClose }) {
  const { symbol, exchange_buy, exchange_sell, price_buy, price_sell,
          spread_pct, spread_usd, volume_24h_buy, volume_24h_sell } = spread

  const fmt = (v, d = 6) => v?.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: 2 }) ?? '—'
  const fmtVol = (v) => {
    if (!v) return '—'
    return v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${(v / 1000).toFixed(0)}K`
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-bg-secondary border-t border-bg-border rounded-t-2xl animate-slide-up pb-8">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-bg-border" />
        </div>
        <div className="px-4 py-3 border-b border-bg-border">
          <div className="flex items-center justify-between">
            <span className="font-bold text-lg font-mono text-text-primary">{symbol}</span>
            <span className="text-2xl font-bold font-mono text-accent-green">+{spread_pct?.toFixed(2)}%</span>
          </div>
        </div>
        <div className="px-4 py-4 space-y-4">
          <Row label="Buy on"     value={exchange_buy.toUpperCase()}   color="text-accent-green" />
          <Row label="Buy Price"  value={`$${fmt(price_buy)}`}          />
          <Row label="Sell on"    value={exchange_sell.toUpperCase()}  color="text-accent-red"  />
          <Row label="Sell Price" value={`$${fmt(price_sell)}`}         />
          <div className="border-t border-bg-border pt-4 space-y-4">
            <Row label="Spread USD"    value={`$${fmt(spread_usd, 4)}`}          />
            <Row label="Vol Buy 24h"   value={fmtVol(volume_24h_buy)}            />
            <Row label="Vol Sell 24h"  value={fmtVol(volume_24h_sell)}           />
          </div>
        </div>
        <div className="px-4">
          <button
            onClick={onClose}
            className="w-full py-3 bg-bg-card border border-bg-border rounded-xl text-text-secondary text-sm font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </>
  )
}

function Row({ label, value, color }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-muted text-sm">{label}</span>
      <span className={clsx('font-mono text-sm font-semibold', color || 'text-text-primary')}>{value}</span>
    </div>
  )
}
