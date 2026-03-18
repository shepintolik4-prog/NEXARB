import { useState } from 'react'
import { Key, Trash2, Check, User, Info, ExternalLink } from 'lucide-react'
import clsx from 'clsx'
import { useStore } from '../../store/useStore'
import { usersApi } from '../../api/client'
import { WebApp } from '../../telegram'
import toast from 'react-hot-toast'

const EXCHANGES = [
  { id: 'binance', label: 'Binance',  hasPassphrase: false },
  { id: 'okx',     label: 'OKX',      hasPassphrase: true  },
  { id: 'bybit',   label: 'Bybit',    hasPassphrase: false  },
]

export default function SettingsPage() {
  const { user, setUser } = useStore()
  const [activeSection, setActiveSection] = useState(null)

  const toggleNotifications = async () => {
    if (!user) return
    WebApp.haptic.impact('light')
    const newVal = !user.notifications_enabled
    try {
      await usersApi.updatePreferences(user.telegram_id, { notifications_enabled: newVal })
      setUser({ ...user, notifications_enabled: newVal })
      toast.success(newVal ? 'Notifications enabled' : 'Notifications disabled')
    } catch {
      toast.error('Failed to update preferences')
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-24">
      {/* User card */}
      {user && (
        <div className="mx-4 mt-4 rounded-2xl border border-bg-border bg-bg-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-blue/20 border border-accent-blue/30 flex items-center justify-center">
            <User size={18} className="text-accent-blue" />
          </div>
          <div>
            <p className="font-semibold text-text-primary text-sm">
              {user.first_name || user.username || 'Trader'}
            </p>
            <p className="text-text-muted text-xs font-mono">@{user.username || `id${user.telegram_id}`}</p>
          </div>
          <div className="ml-auto">
            <span className={clsx(
              'text-xs px-2 py-1 rounded-lg font-mono',
              user.notifications_enabled
                ? 'bg-accent-green/10 text-accent-green border border-accent-green/20'
                : 'bg-bg-hover text-text-muted border border-bg-border'
            )}>
              {user.notifications_enabled ? '🔔 On' : '🔕 Off'}
            </span>
          </div>
        </div>
      )}

      {/* Notifications toggle */}
      <Section title="Notifications">
        <SettingRow
          label="Telegram Alerts"
          description="Receive spread alerts in this chat"
          right={
            <Toggle
              value={user?.notifications_enabled ?? true}
              onChange={toggleNotifications}
            />
          }
        />
      </Section>

      {/* API Keys */}
      <Section title="Exchange API Keys" subtitle="Used for private-endpoint access (higher rate limits)">
        {EXCHANGES.map((ex) => {
          const hasKey = user?.[`has_${ex.id}_key`]
          return (
            <ApiKeyRow
              key={ex.id}
              exchange={ex}
              hasKey={hasKey}
              user={user}
              onSaved={(updated) => setUser({ ...user, ...updated })}
            />
          )
        })}
      </Section>

      {/* About */}
      <Section title="About">
        <SettingRow
          label="Version"
          right={<span className="font-mono text-text-muted text-sm">1.0.0</span>}
        />
        <SettingRow
          label="Backend"
          right={<span className="font-mono text-text-muted text-xs">FastAPI + Supabase</span>}
        />
        <SettingRow
          label="Data Sources"
          right={<span className="font-mono text-text-muted text-xs">CCXT · DexScreener · Jupiter</span>}
        />
        <SettingRow
          label="Open Scanner"
          right={<ExternalLink size={14} className="text-accent-blue" />}
          onClick={() => WebApp.openLink('https://nexarb-scanner.vercel.app')}
        />
      </Section>
    </div>
  )
}

function Section({ title, subtitle, children }) {
  return (
    <div className="mx-4 mt-4">
      <div className="mb-2 px-1">
        <p className="text-text-muted text-xs font-semibold uppercase tracking-wider">{title}</p>
        {subtitle && <p className="text-text-muted text-xs mt-0.5">{subtitle}</p>}
      </div>
      <div className="rounded-2xl border border-bg-border bg-bg-card overflow-hidden divide-y divide-bg-border">
        {children}
      </div>
    </div>
  )
}

function SettingRow({ label, description, right, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick && !right?.props?.onChange}
      className={clsx(
        'w-full flex items-center justify-between px-4 py-3',
        onClick && 'active:bg-bg-hover'
      )}
    >
      <div className="text-left">
        <p className="text-text-primary text-sm">{label}</p>
        {description && <p className="text-text-muted text-xs">{description}</p>}
      </div>
      <div className="ml-3 shrink-0">{right}</div>
    </button>
  )
}

function Toggle({ value, onChange }) {
  return (
    <button
      onClick={onChange}
      className={clsx(
        'w-11 h-6 rounded-full transition-colors relative',
        value ? 'bg-accent-green' : 'bg-bg-border'
      )}
    >
      <span className={clsx(
        'absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform',
        value ? 'translate-x-5' : 'translate-x-0.5'
      )} />
    </button>
  )
}

function ApiKeyRow({ exchange, hasKey, user, onSaved }) {
  const [open, setOpen] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSave = async () => {
    if (!apiKey || !apiSecret) { toast.error('Key and secret required'); return }
    setLoading(true)
    try {
      await usersApi.saveApiKeys({
        telegram_id: user.telegram_id,
        exchange: exchange.id,
        api_key: apiKey,
        api_secret: apiSecret,
        passphrase: passphrase || undefined,
      })
      onSaved({ [`has_${exchange.id}_key`]: true })
      setOpen(false)
      setApiKey(''); setApiSecret(''); setPassphrase('')
      toast.success(`${exchange.label} keys saved`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    try {
      await usersApi.deleteApiKeys(user.telegram_id, exchange.id)
      onSaved({ [`has_${exchange.id}_key`]: false })
      toast.success(`${exchange.label} keys removed`)
    } catch {
      toast.error('Failed to remove keys')
    }
  }

  return (
    <div>
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-4 py-3 active:bg-bg-hover"
      >
        <div className="flex items-center gap-2">
          <Key size={14} className={hasKey ? 'text-accent-green' : 'text-text-muted'} />
          <span className="text-text-primary text-sm">{exchange.label}</span>
        </div>
        <div className="flex items-center gap-2">
          {hasKey && (
            <span className="text-xs text-accent-green bg-accent-green/10 border border-accent-green/20 px-2 py-0.5 rounded-full font-mono">
              ✓ Saved
            </span>
          )}
          <span className="text-text-muted text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 bg-bg-secondary">
          <input value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            placeholder="API Key" type="password"
            className="w-full bg-bg-card border border-bg-border rounded-xl px-3 py-2.5 text-sm font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue" />
          <input value={apiSecret} onChange={(e) => setApiSecret(e.target.value)}
            placeholder="API Secret" type="password"
            className="w-full bg-bg-card border border-bg-border rounded-xl px-3 py-2.5 text-sm font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue" />
          {exchange.hasPassphrase && (
            <input value={passphrase} onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Passphrase (OKX)" type="password"
              className="w-full bg-bg-card border border-bg-border rounded-xl px-3 py-2.5 text-sm font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue" />
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={handleSave} disabled={loading}
              className="flex-1 py-2.5 bg-accent-blue rounded-xl text-white text-sm font-bold disabled:opacity-50">
              {loading ? 'Saving…' : 'Save Keys'}
            </button>
            {hasKey && (
              <button onClick={handleDelete}
                className="p-2.5 bg-accent-red/10 border border-accent-red/20 text-accent-red rounded-xl">
                <Trash2 size={16} />
              </button>
            )}
          </div>
          <p className="text-text-muted text-xs">Read-only keys recommended. Never enable withdrawal permissions.</p>
        </div>
      )}
    </div>
  )
}
