/**
 * NEXARB v2 - ReferralPage
 * Referral link, stats, points balance, convert to VIP days
 */
import { useState, useEffect } from 'react'
import { Gift, Users, Crown, Copy, Share2, TrendingUp, ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import { api } from '../../api/client'
import { useStore } from '../../store/useStore'
import { WebApp } from '../../telegram'
import toast from 'react-hot-toast'

export default function ReferralPage() {
  const { user } = useStore()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [converting, setConverting] = useState(false)
  const [pointsToConvert, setPointsToConvert] = useState(100)

  useEffect(() => {
    if (user?.telegram_id) loadStats()
  }, [user])

  const loadStats = async () => {
    try {
      const { data } = await api.get(`/api/referrals/${user.telegram_id}/stats`)
      setStats(data)
    } catch (e) {
      toast.error('Failed to load referral data')
    } finally {
      setLoading(false)
    }
  }

  const handleCopyLink = async () => {
    if (!stats?.ref_link) return
    try {
      await navigator.clipboard.writeText(stats.ref_link)
      WebApp.haptic.impact('light')
      toast.success('Link copied!')
    } catch {
      toast.error('Copy failed')
    }
  }

  const handleShare = () => {
    if (!stats?.ref_link) return
    WebApp.haptic.impact('medium')
    const text = `🚀 Try NEXARB Scanner — real-time crypto arbitrage!\n\n${stats.ref_link}`
    WebApp.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(stats.ref_link)}&text=${encodeURIComponent(text)}`)
  }

  const handleConvert = async () => {
    if (pointsToConvert < 100) { toast.error('Minimum 100 points'); return }
    if (!stats || stats.points_balance < pointsToConvert) {
      toast.error('Not enough points')
      return
    }

    setConverting(true)
    try {
      const { data } = await api.post('/api/referrals/convert-points', {
        telegram_id: user.telegram_id,
        points: pointsToConvert,
      })

      if (data.success) {
        WebApp.haptic.notification('success')
        toast.success(`+${data.days_added} days VIP added!`)
        loadStats()
      }
    } catch (e) {
      toast.error(e.message)
    } finally {
      setConverting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const daysCanGet = Math.floor((stats?.points_balance || 0) / 100)

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-24">
      {/* Header */}
      <div className="sticky top-[57px] z-30 bg-bg-primary/95 backdrop-blur border-b border-bg-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Gift size={16} className="text-accent-purple" />
          <span className="text-text-primary font-semibold text-sm">Referral Program</span>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* How it works */}
        <div className="bg-bg-card border border-bg-border rounded-2xl p-4">
          <p className="text-text-primary font-semibold mb-3">How it works</p>
          <div className="space-y-2">
            {[
              { n: '1', text: 'Share your referral link' },
              { n: '2', text: 'Friend signs up and buys VIP' },
              { n: '3', text: 'You earn points automatically' },
              { n: '4', text: 'Convert 100 points = 1 day VIP' },
            ].map(({ n, text }) => (
              <div key={n} className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-accent-purple/20 text-accent-purple text-xs font-bold flex items-center justify-center shrink-0">
                  {n}
                </div>
                <span className="text-text-secondary text-sm">{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Points earned per plan */}
        <div className="bg-bg-card border border-bg-border rounded-2xl p-4">
          <p className="text-text-muted text-xs font-semibold uppercase mb-3">Points per referral</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { plan: 'Week', points: 200, days: 2 },
              { plan: 'Month', points: 600, days: 6 },
              { plan: 'Year', points: 3000, days: 30 },
            ].map(({ plan, points, days }) => (
              <div key={plan} className="bg-bg-hover rounded-xl p-2.5 text-center">
                <p className="text-text-muted text-xs">{plan}</p>
                <p className="text-accent-purple font-bold font-mono text-sm">+{points}</p>
                <p className="text-text-muted text-xs">{days}d VIP</p>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Referrals" value={stats?.total_referrals || 0} icon={Users} />
          <StatCard label="Converted" value={stats?.converted_referrals || 0} icon={TrendingUp} color="text-accent-green" />
          <StatCard label="Points" value={stats?.points_balance || 0} icon={Crown} color="text-accent-yellow" />
        </div>

        {/* Referral link */}
        <div className="bg-bg-card border border-bg-border rounded-2xl p-4">
          <p className="text-text-secondary text-sm font-semibold mb-3">Your Referral Link</p>
          <div className="bg-bg-primary border border-bg-border rounded-xl px-3 py-2 font-mono text-xs text-text-muted mb-3 break-all">
            {stats?.ref_link || '—'}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopyLink}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-bg-hover border border-bg-border rounded-xl text-text-secondary text-sm font-medium"
            >
              <Copy size={14} /> Copy
            </button>
            <button
              onClick={handleShare}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-accent-purple/20 border border-accent-purple/30 rounded-xl text-accent-purple text-sm font-medium"
            >
              <Share2 size={14} /> Share
            </button>
          </div>
        </div>

        {/* Convert points */}
        <div className="bg-bg-card border border-bg-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-text-secondary text-sm font-semibold">Convert Points to VIP</p>
            <span className="text-accent-yellow font-mono text-sm font-bold">
              {stats?.points_balance || 0} pts
            </span>
          </div>

          {daysCanGet > 0 ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-text-secondary text-sm">Points to spend</span>
                <span className="text-accent-purple font-mono text-sm">{pointsToConvert} pts = {Math.floor(pointsToConvert / 100)}d</span>
              </div>
              <input
                type="range"
                min="100"
                max={Math.floor((stats?.points_balance || 0) / 100) * 100}
                step="100"
                value={pointsToConvert}
                onChange={e => setPointsToConvert(parseInt(e.target.value))}
                className="w-full accent-accent-purple mb-3"
              />
              <button
                onClick={handleConvert}
                disabled={converting || (stats?.points_balance || 0) < 100}
                className="w-full py-3 bg-accent-purple rounded-xl text-white text-sm font-bold disabled:opacity-40"
              >
                {converting ? 'Converting...' : `Convert → +${Math.floor(pointsToConvert / 100)} days VIP`}
              </button>
            </>
          ) : (
            <div className="text-center py-4">
              <p className="text-text-muted text-sm">Earn 100+ points to convert</p>
              <p className="text-text-muted text-xs mt-1">Invite friends to earn points</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-bg-card border border-bg-border rounded-xl p-3 text-center">
      {Icon && <Icon size={16} className={clsx('mx-auto mb-1', color || 'text-text-muted')} />}
      <p className={clsx('font-bold font-mono text-sm', color || 'text-text-primary')}>{value}</p>
      <p className="text-text-muted text-xs">{label}</p>
    </div>
  )
}
