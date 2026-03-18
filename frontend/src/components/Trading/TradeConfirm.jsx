/**
 * NEXARB v2 - TradeConfirm
 * Shows trade details and requires explicit user confirmation before execution
 */
import { useState } from 'react'
import { AlertTriangle, CheckCircle, X, Zap } from 'lucide-react'
import clsx from 'clsx'
import { api } from '../../api/client'
import { WebApp } from '../../telegram'
import toast from 'react-hot-toast'

export default function TradeConfirm({ spread, calculation, amountUsdt, user, onClose, onSuccess }) {
  const [executing, setExecuting] = useState(false)
  const [apiKeys, setApiKeys] = useState({})
  const [step, setStep] = useState('review') // review | keys | executing | done

  const isProfit = calculation?.is_profitable
  const netProfit = calculation?.net_profit_usd || 0

  const handleExecute = async () => {
    // Validate API keys
    const hasBuyKeys = apiKeys[spread.exchange_buy]?.key && apiKeys[spread.exchange_buy]?.secret
    const hasSellKeys = apiKeys[spread.exchange_sell]?.key && apiKeys[spread.exchange_sell]?.secret

    if (!hasBuyKeys || !hasSellKeys) {
      toast.error(`API keys required for both exchanges`)
      setStep('keys')
      return
    }

    WebApp.haptic.notification('warning')
    setExecuting(true)
    setStep('executing')

    try {
      const { data } = await api.post('/api/trading/confirm-execute', {
        telegram_id: user.telegram_id,
        symbol: spread.symbol,
        exchange_buy: spread.exchange_buy,
        exchange_sell: spread.exchange_sell,
        price_buy: spread.price_buy,
        price_sell: spread.price_sell,
        amount_usdt: amountUsdt,
        api_keys: apiKeys,
      })

      if (data.success) {
        WebApp.haptic.notification('success')
        setStep('done')
        toast.success(`Trade executed! Profit: $${data.net_profit_usd?.toFixed(4)}`)
        setTimeout(() => onSuccess?.(), 2000)
      } else {
        throw new Error(data.error || 'Trade failed')
      }
    } catch (e) {
      toast.error(e.message)
      setStep('review')
    } finally {
      setExecuting(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-bg-secondary border-t border-bg-border rounded-t-2xl animate-slide-up pb-8 max-h-[90vh] overflow-y-auto">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-bg-border">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-accent-yellow" />
            <span className="font-bold text-text-primary">Confirm Trade</span>
          </div>
          <button onClick={onClose}><X size={18} className="text-text-muted" /></button>
        </div>

        {step === 'done' ? (
          <div className="px-4 py-8 text-center">
            <CheckCircle size={48} className="text-accent-green mx-auto mb-3" />
            <p className="font-bold text-text-primary text-lg mb-1">Trade Executed!</p>
            <p className="text-accent-green font-mono text-xl font-bold">
              +${calculation?.net_profit_usd?.toFixed(4)} USDT
            </p>
          </div>
        ) : step === 'executing' ? (
          <div className="px-4 py-8 text-center">
            <div className="w-12 h-12 border-2 border-accent-blue border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="font-bold text-text-primary">Executing orders...</p>
            <p className="text-text-muted text-sm mt-1">Placing orders on both exchanges simultaneously</p>
          </div>
        ) : step === 'keys' ? (
          <ApiKeysStep
            exchangeBuy={spread.exchange_buy}
            exchangeSell={spread.exchange_sell}
            apiKeys={apiKeys}
            onChange={setApiKeys}
            onBack={() => setStep('review')}
            onConfirm={handleExecute}
          />
        ) : (
          <ReviewStep
            spread={spread}
            calculation={calculation}
            amountUsdt={amountUsdt}
            onCancel={onClose}
            onConfirm={() => setStep('keys')}
          />
        )}
      </div>
    </>
  )
}

function ReviewStep({ spread, calculation, amountUsdt, onCancel, onConfirm }) {
  const profit = calculation?.net_profit_usd || 0
  const isProfit = profit > 0

  const rows = [
    ['Symbol', spread.symbol],
    ['Buy on', spread.exchange_buy?.toUpperCase()],
    ['Buy price', `$${spread.price_buy?.toFixed(6)}`],
    ['Sell on', spread.exchange_sell?.toUpperCase()],
    ['Sell price', `$${spread.price_sell?.toFixed(6)}`],
    ['Amount', `$${amountUsdt} USDT`],
    ['Base amount', `${calculation?.amount_base?.toFixed(6)} ${spread.symbol?.split('/')[0]}`],
    ['Est. fees', `$${calculation?.fee_usdt?.toFixed(4)}`],
    ['Gross profit', `$${calculation?.gross_profit_usd?.toFixed(4)}`],
  ]

  return (
    <div className="px-4 py-4">
      {/* P&L highlight */}
      <div className={clsx(
        'rounded-2xl p-4 mb-4 text-center border',
        isProfit
          ? 'bg-accent-green/10 border-accent-green/25'
          : 'bg-accent-red/10 border-accent-red/25'
      )}>
        <p className="text-text-secondary text-sm mb-1">Expected Net Profit</p>
        <p className={clsx('font-bold text-3xl font-mono', isProfit ? 'text-accent-green' : 'text-accent-red')}>
          {profit >= 0 ? '+' : ''}${profit.toFixed(4)}
        </p>
        <p className="text-text-muted text-xs mt-1">({calculation?.net_profit_pct?.toFixed(3)}% after fees)</p>
      </div>

      {/* Warning */}
      {calculation?.warning && (
        <div className="bg-accent-yellow/10 border border-accent-yellow/20 rounded-xl p-3 mb-4 flex items-start gap-2">
          <AlertTriangle size={14} className="text-accent-yellow shrink-0 mt-0.5" />
          <p className="text-accent-yellow text-xs">{calculation.warning}</p>
        </div>
      )}

      {/* Trade details */}
      <div className="space-y-2 mb-4">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between text-sm">
            <span className="text-text-muted">{label}</span>
            <span className="font-mono text-text-primary">{value}</span>
          </div>
        ))}
      </div>

      {/* Disclaimer */}
      <div className="bg-accent-red/5 border border-accent-red/15 rounded-xl p-3 mb-4 text-xs text-text-muted">
        ⚠️ Prices change rapidly. Actual profit may differ. This is NOT financial advice. Trade at your own risk.
      </div>

      {/* Buttons */}
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-3 bg-bg-card border border-bg-border rounded-xl text-text-secondary text-sm font-medium">
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={!isProfit}
          className="flex-2 flex-grow py-3 bg-accent-green rounded-xl text-bg-primary text-sm font-bold disabled:opacity-40"
        >
          Enter API Keys →
        </button>
      </div>
    </div>
  )
}

function ApiKeysStep({ exchangeBuy, exchangeSell, apiKeys, onChange, onBack, onConfirm }) {
  const updateKeys = (exchange, field, value) => {
    onChange(prev => ({
      ...prev,
      [exchange]: { ...(prev[exchange] || {}), [field]: value }
    }))
  }

  const exchanges = [
    { id: exchangeBuy, label: `${exchangeBuy.toUpperCase()} (Buy)` },
    { id: exchangeSell, label: `${exchangeSell.toUpperCase()} (Sell)` },
  ].filter((v, i, arr) => arr.findIndex(x => x.id === v.id) === i)

  return (
    <div className="px-4 py-4">
      <p className="text-text-secondary text-sm mb-4">
        Enter API keys for execution. Use keys with <strong>trade permission only</strong>. Never enable withdrawal.
      </p>

      {exchanges.map(({ id, label }) => (
        <div key={id} className="mb-4">
          <p className="text-text-secondary text-sm font-semibold mb-2">{label}</p>
          <div className="space-y-2">
            <input
              type="password"
              placeholder="API Key"
              value={apiKeys[id]?.key || ''}
              onChange={e => updateKeys(id, 'key', e.target.value)}
              className="w-full bg-bg-card border border-bg-border rounded-xl px-3 py-2.5 text-sm font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue"
            />
            <input
              type="password"
              placeholder="API Secret"
              value={apiKeys[id]?.secret || ''}
              onChange={e => updateKeys(id, 'secret', e.target.value)}
              className="w-full bg-bg-card border border-bg-border rounded-xl px-3 py-2.5 text-sm font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue"
            />
            {id === 'okx' && (
              <input
                type="password"
                placeholder="Passphrase (OKX)"
                value={apiKeys[id]?.passphrase || ''}
                onChange={e => updateKeys(id, 'passphrase', e.target.value)}
                className="w-full bg-bg-card border border-bg-border rounded-xl px-3 py-2.5 text-sm font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue"
              />
            )}
          </div>
        </div>
      ))}

      <div className="flex gap-2 mt-4">
        <button onClick={onBack} className="flex-1 py-3 bg-bg-card border border-bg-border rounded-xl text-text-secondary text-sm">
          ← Back
        </button>
        <button
          onClick={onConfirm}
          className="flex-2 flex-grow py-3 bg-accent-red rounded-xl text-white text-sm font-bold"
        >
          ⚡ Execute Trade
        </button>
      </div>
    </div>
  )
}
