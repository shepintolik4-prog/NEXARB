/**
 * NEXARB v2 - PlansPage
 * VIP subscription plans + CryptoBot payment
 */
import { useState, useEffect } from 'react'
import { Crown, Check, Zap, Shield, Bell, BarChart2, ExternalLink, X } from 'lucide-react'
import clsx from 'clsx'
import { api } from '../../api/client'
import { useStore } from '../../store/useStore'
import { WebApp } from '../../telegram'
import toast from 'react-hot-toast'

export default function PlansPage({ onClose }) {
  const { user, subscription, setSubscription } = useStore()
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(null)
  const [invoice, setInvoice] = useState(null)

  useEffect(() => {
    loadPlans()
  }, [])

  const loadPlans = async () => {
    try {
      const { data } = await api.get('/api/payments/plans')
      setPlans(data.plans || [])
    } catch (e) {
      toast.error('Failed to load plans')
    } finally {
      setLoading(false)
    }
  }

  const handleBuy = async (plan) => {
    if (!user?.telegram_id) { toast.error('Please restart the app'); return }
    WebApp.haptic.impact('medium')
    setPaying(plan.id)

    try {
      const { data } = await api.post('/api/payments/create-invoice', {
        telegram_id: user.telegram_id,
        plan: plan.id,
        currency: 'USDT',
      })

      setInvoice({ ...data, plan })
      // Open CryptoBot payment
      WebApp.openTelegramLink(data.bot_invoice_url || data.pay_url)

      // Start polling for payment
      startPolling(data.invoice_id, plan)

    } catch (e) {
      toast.error(e.message || 'Payment failed')
    } finally {
      setPaying(null)
    }
  }

  const startPolling = (invoiceId, plan) => {
    const interval = setInterval(async () => {
      try {
        const { data } = await api.post('/api/payments/check', {
          telegram_id: user.telegram_id,
          invoice_id: invoiceId,
        })
        if (data.status === 'paid') {
          clearInterval(interval)
          setInvoice(null)
          WebApp.haptic.notification('success')
          toast.success('🎉 VIP Activated!')
          // Refresh subscription
          const subData = await api.get(`/api/subscriptions/${user.telegram_id}`)
          setSubscription(subData.data)
          onClose?.()
        }
      } catch (_) {}
    }, 3000)

    // Stop polling after 15 min
    setTimeout(() => clearInterval(interval), 15 * 60 * 1000)
  }

  const isVip = subscription?.is_vip

  return (
    <div className="fixed inset-0 z-50 bg-bg-primary flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-bg-border">
        <div className="flex items-center gap-2">
          <Crown size={20} className="text-accent-yellow" />
          <span className="font-bold text-text-primary">NEXARB VIP</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 text-text-muted">
            <X size={20} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {/* Current status */}
        {isVip && (
          <div className="mt-4 bg-accent-yellow/10 border border-accent-yellow/30 rounded-2xl p-4 flex items-center gap-3">
            <Crown size={20} className="text-accent-yellow" />
            <div>
              <p className="text-accent-yellow font-bold text-sm">VIP Active</p>
              <p className="text-text-muted text-xs">
                Expires: {subscription.expires_at
                  ? new Date(subscription.expires_at).toLocaleDateString('ru-RU')
                  : '—'}
              </p>
            </div>
          </div>
        )}

        {/* Feature comparison */}
        <div className="mt-6 mb-4">
          <h2 className="text-text-primary font-bold text-lg mb-1">Upgrade to VIP</h2>
          <p className="text-text-muted text-sm">Unlock all features and exchanges</p>
        </div>

        {/* Feature list */}
        <div className="bg-bg-card border border-bg-border rounded-2xl p-4 mb-6">
          {[
            { icon: BarChart2, text: '20+ exchanges (Free: 5)',         vip: true },
            { icon: Zap,       text: 'Realtime data (Free: 60s delay)', vip: true },
            { icon: Shield,    text: 'Futures + DEX scanner',           vip: true },
            { icon: Bell,      text: 'Unlimited alerts (Free: 3)',       vip: true },
            { icon: Crown,     text: 'Semi-auto trading',                vip: true },
            { icon: Check,     text: 'Custom token/exchange selection',  vip: true },
          ].map(({ icon: Icon, text, vip }) => (
            <div key={text} className="flex items-center gap-3 py-2 border-b border-bg-border last:border-0">
              <div className="w-6 h-6 rounded-lg bg-accent-yellow/15 flex items-center justify-center">
                <Icon size={13} className="text-accent-yellow" />
              </div>
              <span className="text-text-secondary text-sm flex-1">{text}</span>
              <Check size={14} className="text-accent-green" />
            </div>
          ))}
        </div>

        {/* Plans */}
        {loading ? (
          <PlansSkeleton />
        ) : (
          <div className="space-y-3">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                onBuy={() => handleBuy(plan)}
                loading={paying === plan.id}
                isVip={isVip}
              />
            ))}
          </div>
        )}

        {/* Payment note */}
        <div className="mt-4 bg-bg-card border border-bg-border rounded-xl p-3 text-xs text-text-muted">
          <p className="font-semibold text-text-secondary mb-1">💳 Payment via CryptoBot</p>
          <p>Pay with USDT, TON, BTC and more. Instant activation after payment confirmation.</p>
        </div>

        {/* Invoice pending */}
        {invoice && (
          <div className="mt-4 bg-accent-blue/10 border border-accent-blue/20 rounded-xl p-3">
            <p className="text-accent-blue text-sm font-semibold mb-1">⏳ Waiting for payment...</p>
            <p className="text-text-muted text-xs">Complete payment in CryptoBot. Page will update automatically.</p>
            <button
              onClick={() => WebApp.openTelegramLink(invoice.bot_invoice_url || invoice.pay_url)}
              className="mt-2 flex items-center gap-1 text-accent-blue text-xs underline"
            >
              <ExternalLink size={11} /> Reopen payment
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function PlanCard({ plan, onBuy, loading, isVip }) {
  return (
    <div className={clsx(
      'rounded-2xl border p-4 relative',
      plan.popular
        ? 'border-accent-yellow/40 bg-accent-yellow/5'
        : 'border-bg-border bg-bg-card'
    )}>
      {plan.popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent-yellow text-bg-primary text-xs font-bold px-3 py-1 rounded-full">
          MOST POPULAR
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="font-bold text-text-primary">{plan.label}</p>
          <p className="text-text-muted text-xs">{plan.description}</p>
        </div>
        <div className="text-right">
          <p className="font-bold text-xl text-text-primary">${plan.price_usdt}</p>
          <p className="text-text-muted text-xs">USDT</p>
        </div>
      </div>

      <button
        onClick={onBuy}
        disabled={loading}
        className={clsx(
          'w-full py-2.5 rounded-xl font-bold text-sm transition-all',
          plan.popular
            ? 'bg-accent-yellow text-bg-primary'
            : 'bg-accent-blue text-white',
          loading && 'opacity-50'
        )}
      >
        {loading ? 'Creating invoice...' : isVip ? 'Extend VIP' : 'Buy Now'}
      </button>
    </div>
  )
}

function PlansSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-2xl border border-bg-border bg-bg-card p-4 animate-pulse">
          <div className="flex justify-between mb-3">
            <div className="h-5 w-20 bg-bg-hover rounded" />
            <div className="h-6 w-16 bg-bg-hover rounded" />
          </div>
          <div className="h-10 bg-bg-hover rounded-xl" />
        </div>
      ))}
    </div>
  )
}
