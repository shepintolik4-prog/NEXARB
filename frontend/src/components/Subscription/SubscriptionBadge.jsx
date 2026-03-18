/**
 * NEXARB v2 - SubscriptionBadge
 * Shows VIP/Free badge + expiry in Header
 */
import { Crown, Lock } from 'lucide-react'
import clsx from 'clsx'
import { useStore } from '../../store/useStore'

export function SubscriptionBadge({ onUpgrade }) {
  const { subscription } = useStore()
  const isVip = subscription?.is_vip

  if (isVip) {
    const expiry = subscription.expires_at
      ? new Date(subscription.expires_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
      : null

    return (
      <div className="flex items-center gap-1 px-2 py-0.5 bg-accent-yellow/15 border border-accent-yellow/25 rounded-full">
        <Crown size={10} className="text-accent-yellow" />
        <span className="text-accent-yellow text-xs font-bold font-mono">VIP</span>
        {expiry && <span className="text-accent-yellow/70 text-xs">·{expiry}</span>}
      </div>
    )
  }

  return (
    <button
      onClick={onUpgrade}
      className="flex items-center gap-1 px-2 py-0.5 bg-bg-card border border-bg-border rounded-full active:bg-bg-hover"
    >
      <Lock size={10} className="text-text-muted" />
      <span className="text-text-muted text-xs font-mono">FREE</span>
    </button>
  )
}

/**
 * VIP gate overlay — shown over locked content
 */
export function VipGate({ feature = "this feature", onUpgrade }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-accent-yellow/15 border border-accent-yellow/25 flex items-center justify-center mb-4">
        <Crown size={24} className="text-accent-yellow" />
      </div>
      <p className="text-text-primary font-bold text-lg mb-1">VIP Required</p>
      <p className="text-text-muted text-sm mb-6">
        Upgrade to VIP to access {feature}
      </p>
      <button
        onClick={onUpgrade}
        className="px-6 py-3 bg-accent-yellow text-bg-primary font-bold rounded-xl"
      >
        Upgrade to VIP
      </button>
    </div>
  )
}
