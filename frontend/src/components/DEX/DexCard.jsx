/**
 * NEXARB Scanner - DexCard
 * Displays a single cross-chain DEX arbitrage opportunity
 */
import { ArrowRight } from 'lucide-react'
import clsx from 'clsx'

const CHAIN_COLORS = {
  ethereum: '#627EEA',
  bsc:      '#F0B90B',
  solana:   '#9945FF',
  arbitrum: '#28A0F0',
  polygon:  '#8247E5',
  base:     '#0052FF',
  ton:      '#0098EA',
  avalanche:'#E84142',
}

function ChainBadge({ chain }) {
  const color = CHAIN_COLORS[chain] || '#8888aa'
  return (
    <span
      className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-md border"
      style={{
        color,
        borderColor: `${color}40`,
        backgroundColor: `${color}15`,
      }}
    >
      {chain?.toUpperCase().slice(0, 3)}
    </span>
  )
}

function fmtPrice(p) {
  if (!p) return '—'
  if (p >= 1000) return `$${p.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
  if (p >= 1)    return `$${p.toFixed(4)}`
  return `$${p.toFixed(8)}`
}

function fmtLiquidity(v) {
  if (!v) return '—'
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}

export default function DexCard({ item, onClick }) {
  const {
    base_token, quote_token,
    chain_buy, chain_sell,
    dex_buy, dex_sell,
    price_buy, price_sell,
    spread_pct,
    liquidity_buy, liquidity_sell,
  } = item

  const minLiq = Math.min(liquidity_buy || 0, liquidity_sell || 0)
  const isCrossChain = chain_buy !== chain_sell

  return (
    <button
      onClick={() => onClick?.(item)}
      className="w-full text-left rounded-2xl border border-bg-border bg-bg-card p-4 mb-2 animate-slide-up active:scale-[0.98] transition-transform"
    >
      {/* Top row */}
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
        {/* Buy side */}
        <div className="flex-1">
          <div className="flex items-center gap-1 mb-1">
            <ChainBadge chain={chain_buy} />
            <span className="text-text-muted text-xs uppercase truncate">{dex_buy}</span>
          </div>
          <span className="font-mono text-accent-green text-xs">{fmtPrice(price_buy)}</span>
        </div>

        <ArrowRight size={14} className="text-text-muted shrink-0" />

        {/* Sell side */}
        <div className="flex-1 text-right">
          <div className="flex items-center gap-1 justify-end mb-1">
            <span className="text-text-muted text-xs uppercase truncate">{dex_sell}</span>
            <ChainBadge chain={chain_sell} />
          </div>
          <span className="font-mono text-accent-red text-xs">{fmtPrice(price_sell)}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs font-mono text-text-muted">
        <span>Min Liq: {fmtLiquidity(minLiq)}</span>
        {isCrossChain && (
          <span className="text-accent-yellow">⚠️ Bridge required</span>
        )}
      </div>
    </button>
  )
}
