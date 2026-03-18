/**
 * NEXARB Scanner - FundingCard
 * Displays a single funding rate entry for a symbol on an exchange
 */
import clsx from 'clsx'

export default function FundingCard({ item }) {
  const { exchange, symbol, funding_rate, funding_rate_8h, funding_rate_annual, next_funding_time } = item

  const isPositive = (funding_rate ?? 0) >= 0
  const base = symbol?.split('/')[0] ?? symbol

  const nextFunding = next_funding_time
    ? new Date(next_funding_time).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  return (
    <div className="rounded-2xl border border-bg-border bg-bg-card p-4 mb-2 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-bold font-mono text-text-primary text-base">{base}</span>
          <span className="text-text-muted text-xs font-mono uppercase">{exchange}</span>
        </div>

        {/* Rate badge */}
        <div className={clsx(
          'px-2.5 py-1 rounded-xl border font-bold font-mono text-sm',
          isPositive
            ? 'bg-accent-green/10 border-accent-green/25 text-accent-green'
            : 'bg-accent-red/10   border-accent-red/25   text-accent-red'
        )}>
          {isPositive ? '+' : ''}{(funding_rate ?? funding_rate_8h ?? 0).toFixed(4)}%
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 text-xs font-mono">
        <div>
          <span className="text-text-muted">Annual </span>
          <span className={clsx(
            'font-semibold',
            isPositive ? 'text-accent-green' : 'text-accent-red'
          )}>
            ~{funding_rate_annual?.toFixed(1) ?? '—'}%
          </span>
        </div>
        {nextFunding && (
          <div>
            <span className="text-text-muted">Next </span>
            <span className="text-text-secondary">{nextFunding}</span>
          </div>
        )}
      </div>

      {/* Direction label */}
      <div className="mt-2 text-xs text-text-muted">
        {isPositive ? '🐂 Longs pay shorts — short futures to earn' : '🐻 Shorts pay longs — long futures to earn'}
      </div>
    </div>
  )
}
