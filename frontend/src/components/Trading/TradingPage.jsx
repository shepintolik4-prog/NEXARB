/**
 * NEXARB v2 - TradingPage
 * Semi-automatic arbitrage execution
 */
import { useState, useEffect } from 'react'
import { Zap, TrendingUp, AlertTriangle, CheckCircle, Clock, DollarSign, Lock } from 'lucide-react'
import clsx from 'clsx'
import { api } from '../../api/client'
import { useStore } from '../../store/useStore'
import { WebApp } from '../../telegram'
import toast from 'react-hot-toast'
import TradeConfirm from './TradeConfirm'

export default function TradingPage({ onUpgrade }) {
  const { user, subscription, cexResults } = useStore()
  const [stats, setStats] = useState(null)
  const [history, setHistory] = useState([])
  const [selectedSpread, setSelectedSpread] = useState(null)
  const [amountUsdt, setAmountUsdt] = useState(100)
  const [calculation, setCalculation] = useState(null)
  const [calcLoading, setCalcLoading] = useState(false)

  const isVip = subscription?.is_vip

  useEffect(() => {
    if (user?.telegram_id) {
      loadStats()
      loadHistory()
    }
  }, [user])

  const loadStats = async () => {
    try {
      const { data } = await api.get(`/api/trading/${user.telegram_id}/stats`)
      setStats(data)
    } catch (_) {}
  }

  const loadHistory = async () => {
    try {
      const { data } = await api.get(`/api/trading/${user.telegram_id}/history?limit=10`)
      setHistory(data.data || [])
    } catch (_) {}
  }

  const handleSelectSpread = async (spread) => {
    if (!isVip) { onUpgrade?.(); return }
    setSelectedSpread(spread)
    setCalcLoading(true)

    try {
      const { data } = await api.post('/api/trading/calculate', {
        telegram_id: user.telegram_id,
        symbol: spread.symbol,
        exchange_buy: spread.exchange_buy,
        exchange_sell: spread.exchange_sell,
        price_buy: spread.price_buy,
        price_sell: spread.price_sell,
        amount_usdt: amountUsdt,
      })
      setCalculation(data)
    } catch (e) {
      toast.error('Calculation failed')
    } finally {
      setCalcLoading(false)
    }
  }

  // Top spreads from scanner (profitable opportunities)
  const topSpreads = cexResults
    .filter(s => s.spread_pct >= 0.5)
    .slice(0, 10)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-[57px] z-30 bg-bg-primary/95 backdrop-blur border-b border-bg-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-accent-yellow" />
            <span className="text-text-primary font-semibold text-sm">Semi-Auto Trading</span>
          </div>
          {!isVip && (
            <button
              onClick={onUpgrade}
              className="flex items-center gap-1 px-2.5 py-1 bg-accent-yellow/15 border border-accent-yellow/30 text-accent-yellow rounded-xl text-xs font-bold"
            >
              <Lock size={11} /> VIP Only
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-24">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-2 mb-4">
            <StatCard label="Trades" value={stats.total_trades} />
            <StatCard label="Profit" value={`$${(stats.total_profit_usd || 0).toFixed(2)}`} color="text-accent-green" />
            <StatCard label="Win Rate" value={`${(stats.win_rate || 0).toFixed(0)}%`} />
          </div>
        )}

        {/* Amount input */}
        <div className="bg-bg-card border border-bg-border rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-text-secondary text-sm">Trade Amount</label>
            <span className="text-accent-blue font-mono text-sm font-bold">${amountUsdt} USDT</span>
          </div>
          <input
            type="range" min="10" max="10000" step="10"
            value={amountUsdt}
            onChange={(e) => {
              setAmountUsdt(parseInt(e.target.value))
              setCalculation(null)
            }}
            className="w-full accent-accent-blue"
          />
          <div className="flex justify-between text-text-muted text-xs mt-1">
            <span>$10</span><span>$10,000</span>
          </div>
        </div>

        {/* Available opportunities */}
        <div className="mb-3">
          <p className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-2">
            Live Opportunities
          </p>
          {topSpreads.length === 0 ? (
            <div className="text-center py-8 text-text-muted text-sm">
              No spreads available — run CEX scan first
            </div>
          ) : (
            topSpreads.map((spread, i) => (
              <TradeOpportunityCard
                key={`${spread.symbol}-${i}`}
                spread={spread}
                isVip={isVip}
                onSelect={() => handleSelectSpread(spread)}
              />
            ))
          )}
        </div>

        {/* Trade history */}
        {history.length > 0 && (
          <div>
            <p className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-2">
              Recent Trades
            </p>
            {history.map((trade) => (
              <TradeHistoryCard key={trade.id} trade={trade} />
            ))}
          </div>
        )}
      </div>

      {/* Trade confirm modal */}
      {selectedSpread && calculation && (
        <TradeConfirm
          spread={selectedSpread}
          calculation={calculation}
          amountUsdt={amountUsdt}
          user={user}
          onClose={() => { setSelectedSpread(null); setCalculation(null) }}
          onSuccess={() => {
            setSelectedSpread(null)
            setCalculation(null)
            loadStats()
            loadHistory()
          }}
        />
      )}
    </div>
  )
}

function TradeOpportunityCard({ spread, isVip, onSelect }) {
  return (
    <button
      onClick={onSelect}
      className="w-full text-left rounded-2xl border border-bg-border bg-bg-card p-4 mb-2 active:scale-[0.98] transition-transform"
    >
      <div className="flex items-start justify-between mb-2">
        <span className="font-bold font-mono text-text-primary">{spread.symbol}</span>
        <div className="flex items-center gap-2">
          <span className="bg-accent-green/10 border border-accent-green/25 text-accent-green font-bold font-mono text-sm px-2.5 py-1 rounded-xl">
            +{spread.spread_pct?.toFixed(2)}%
          </span>
          {!isVip && <Lock size={13} className="text-text-muted" />}
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-text-muted font-mono">
        <span className="text-accent-green uppercase">{spread.exchange_buy}</span>
        <span>→</span>
        <span className="text-accent-red uppercase">{spread.exchange_sell}</span>
        <span className="ml-auto">Tap to calculate</span>
      </div>
    </button>
  )
}

function TradeHistoryCard({ trade }) {
  const isCompleted = trade.status === 'completed'
  const isProfit = (trade.net_profit_usd || 0) > 0
  const statusColor = {
    completed: 'text-accent-green',
    failed: 'text-accent-red',
    executing: 'text-accent-yellow',
    pending: 'text-text-muted',
    cancelled: 'text-text-muted',
  }[trade.status] || 'text-text-muted'

  return (
    <div className="rounded-2xl border border-bg-border bg-bg-card p-3 mb-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-text-primary text-sm font-bold">{trade.symbol}</span>
        {isCompleted && (
          <span className={clsx('font-mono text-sm font-bold', isProfit ? 'text-accent-green' : 'text-accent-red')}>
            {(trade.net_profit_usd || 0) >= 0 ? '+' : ''}${(trade.net_profit_usd || 0).toFixed(4)}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between mt-1 text-xs text-text-muted">
        <span>{trade.exchange_buy?.toUpperCase()} → {trade.exchange_sell?.toUpperCase()}</span>
        <span className={statusColor}>{trade.status}</span>
      </div>
    </div>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div className="bg-bg-card border border-bg-border rounded-xl p-3 text-center">
      <p className={clsx('font-bold font-mono text-sm', color || 'text-text-primary')}>{value}</p>
      <p className="text-text-muted text-xs mt-0.5">{label}</p>
    </div>
  )
}
