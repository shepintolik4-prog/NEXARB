import { useEffect, useState } from 'react'
import { RefreshCw, Layers, ArrowRight } from 'lucide-react'
import clsx from 'clsx'
import { useDex } from '../../hooks/useFutures'
import { WebApp } from '../../telegram'

const CHAIN_COLORS = {
  ethereum: '#627EEA', bsc: '#F0B90B', solana: '#9945FF',
  arbitrum: '#28A0F0', polygon: '#8247E5', base: '#0052FF',
  ton: '#0098EA', avalanche: '#E84142',
}

function chainColor(chain) {
  return CHAIN_COLORS[chain] || '#8888aa'
}

function ChainBadge({ chain }) {
  const color = chainColor(chain)
  const label = chain?.toUpperCase().slice(0, 3)
  return (
    <span
      className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-md border"
      style={{ color, borderColor: `${color}40`, backgroundColor: `${color}15` }}
    >
      {label}
    </span>
  )
}

export default function DexPage() {
  const { scan, dexResults, dexLoading, dexError, dexChainsScanned, dexFilters } = useDex()
  const [detail, setDetail] = useState(null)

  useEffect(() => { scan() }, [])

  const handleRefresh = () => {
    WebApp.haptic.impact('light')
    scan()
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="sticky top-[57px] z-30 bg-bg-primary/95 backdrop-blur border-b border-bg-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          {dexChainsScanned.slice(0, 5).map((c) => (
            <ChainBadge key={c} chain={c} />
          ))}
          {dexChainsScanned.length > 5 && (
            <span className="text-text-muted text-xs">+{dexChainsScanned.length - 5}</span>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={dexLoading}
          className="p-2 rounded-xl bg-bg-card border border-bg-border text-text-secondary active:bg-bg-hover disabled:opacity-40"
        >
          <RefreshCw size={15} className={clsx(dexLoading && 'animate-spin')} />
        </button>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-bg-border text-xs font-mono text-text-muted">
        <span>{dexResults.length} opportunities</span>
        {dexChainsScanned.length > 0 && <span>{dexChainsScanned.length} chains</span>}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-24">
        {dexLoading && <DexSkeleton />}

        {!dexLoading && dexError && (
          <div className="text-center py-12 text-accent-red text-sm">
            {dexError}
            <br />
            <button onClick={handleRefresh} className="text-accent-blue mt-3 underline">Retry</button>
          </div>
        )}

        {!dexLoading && !dexError && dexResults.length === 0 && (
          <EmptyState onRefresh={handleRefresh} />
        )}

        {dexResults.map((item, i) => (
          <DexCard
            key={`${item.symbol}-${item.chain_buy}-${item.chain_sell}-${i}`}
            item={item}
            onClick={() => setDetail(item)}
          />
        ))}
      </div>

      {detail && <DexDetailSheet item={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

function DexCard({ item, onClick }) {
  const { base_token, quote_token, chain_buy, chain_sell, dex_buy, dex_sell,
          price_buy, price_sell, spread_pct, liquidity_buy, liquidity_sell } = item

  const fmtPrice = (p) => {
    if (!p) return '—'
    if (p >= 1000) return `$${p.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
    if (p >= 1)    return `$${p.toFixed(4)}`
    return `$${p.toFixed(8)}`
  }
  const fmtLiq = (v) => {
    if (!v) return '—'
    return v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${(v / 1000).toFixed(0)}K`
  }

  const minLiq = Math.min(liquidity_buy || 0, liquidity_sell || 0)

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-2xl border border-bg-border bg-bg-card p-4 mb-2 animate-slide-up active:scale-[0.98] transition-transform"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="font-bold font-mono text-text-primary">{base_token}</span>
          <span className="text-text-muted text-xs">/{quote_token}</span>
        </div>
        <span className="bg-accent-purple/10 border border-accent-purple/25 text-accent-purple font-bold font-mono text-sm px-2.5 py-1 rounded-xl">
          +{spread_pct?.toFixed(2)}%
        </span>
      </div>

      {/* Chain path */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-1 mb-1">
            <ChainBadge chain={chain_buy} />
            <span className="text-text-muted text-xs uppercase">{dex_buy}</span>
          </div>
          <span className="font-mono text-accent-green text-xs">{fmtPrice(price_buy)}</span>
        </div>
        <ArrowRight size={14} className="text-text-muted shrink-0" />
        <div className="flex-1 text-right">
          <div className="flex items-center gap-1 justify-end mb-1">
            <span className="text-text-muted text-xs uppercase">{dex_sell}</span>
            <ChainBadge chain={chain_sell} />
          </div>
          <span className="font-mono text-accent-red text-xs">{fmtPrice(price_sell)}</span>
        </div>
      </div>

      <div className="text-xs text-text-muted font-mono">
        Min Liq: {fmtLiq(minLiq)}
        {chain_buy !== chain_sell && (
          <span className="ml-2 text-accent-yellow">⚠️ Bridge required</span>
        )}
      </div>
    </button>
  )
}

function DexDetailSheet({ item, onClose }) {
  const { base_token, chain_buy, chain_sell, dex_buy, dex_sell,
          price_buy, price_sell, spread_pct,
          liquidity_buy, liquidity_sell, volume_24h_buy, volume_24h_sell,
          pool_address_buy, pool_address_sell } = item

  const fmtVol = (v) => v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v?.toFixed(0)}`
  const shortAddr = (a) => a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—'

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-bg-secondary border-t border-bg-border rounded-t-2xl animate-slide-up pb-8">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-bg-border" />
        </div>
        <div className="px-4 py-3 border-b border-bg-border flex items-center justify-between">
          <span className="font-bold text-lg font-mono">{base_token}</span>
          <span className="text-accent-purple font-bold font-mono text-xl">+{spread_pct?.toFixed(2)}%</span>
        </div>
        <div className="px-4 py-4 space-y-3 text-sm">
          {[
            ['Buy on', `${dex_buy?.toUpperCase()} (${chain_buy?.toUpperCase()})`],
            ['Buy Price', `$${price_buy?.toFixed(6)}`],
            ['Buy Pool', shortAddr(pool_address_buy)],
            ['Liquidity (buy)', fmtVol(liquidity_buy)],
            ['Volume 24h (buy)', fmtVol(volume_24h_buy)],
            ['', ''],
            ['Sell on', `${dex_sell?.toUpperCase()} (${chain_sell?.toUpperCase()})`],
            ['Sell Price', `$${price_sell?.toFixed(6)}`],
            ['Sell Pool', shortAddr(pool_address_sell)],
            ['Liquidity (sell)', fmtVol(liquidity_sell)],
          ].filter(([k]) => k).map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <span className="text-text-muted">{k}</span>
              <span className="font-mono text-text-primary">{v}</span>
            </div>
          ))}
          {chain_buy !== chain_sell && (
            <div className="bg-accent-yellow/10 border border-accent-yellow/20 rounded-xl p-3 text-xs text-accent-yellow mt-2">
              ⚠️ Cross-chain arb requires a bridge. Account for fees and slippage.
            </div>
          )}
        </div>
        <div className="px-4">
          <button onClick={onClose} className="w-full py-3 bg-bg-card border border-bg-border rounded-xl text-text-secondary text-sm font-medium">
            Close
          </button>
        </div>
      </div>
    </>
  )
}

function DexSkeleton() {
  return <>
    {Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="rounded-2xl border border-bg-border bg-bg-card p-4 mb-2 animate-pulse">
        <div className="flex justify-between mb-3">
          <div className="h-5 w-16 bg-bg-hover rounded" />
          <div className="h-6 w-14 bg-bg-hover rounded-xl" />
        </div>
        <div className="flex items-center gap-2 mb-3">
          <div className="h-8 flex-1 bg-bg-hover rounded-lg" />
          <div className="h-4 w-4 bg-bg-hover rounded" />
          <div className="h-8 flex-1 bg-bg-hover rounded-lg" />
        </div>
        <div className="h-4 w-32 bg-bg-hover rounded" />
      </div>
    ))}
  </>
}

function EmptyState({ onRefresh }) {
  return (
    <div className="text-center py-16">
      <Layers size={28} className="text-text-muted mx-auto mb-3" />
      <p className="text-text-secondary text-sm mb-1">No DEX spreads found</p>
      <button onClick={onRefresh} className="mt-3 px-4 py-2 bg-accent-purple/20 border border-accent-purple/30 rounded-xl text-accent-purple text-sm">
        Scan Now
      </button>
    </div>
  )
}
