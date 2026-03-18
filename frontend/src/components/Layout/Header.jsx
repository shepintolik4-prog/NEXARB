import { useStore } from '../../store/useStore'
import { Activity, Wifi, WifiOff, Zap } from 'lucide-react'
import { WebApp } from '../../telegram'
import clsx from 'clsx'

const TAB_LABELS = {
  scanner: 'CEX Scanner',
  futures: 'Futures',
  dex: 'DEX',
  trading: 'Trading',
  referral: 'Referral',
  plans: 'Subscription Plans',
  alerts: 'Alerts',
  settings: 'Settings',
}

export default function Header() {
  const { activeTab, setActiveTab, wsConnected, wsLastUpdate, cexLastScan } = useStore()

  const lastUpdate = wsLastUpdate || cexLastScan
  const timeStr = lastUpdate
    ? lastUpdate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null

  const handlePlansClick = () => {
    WebApp.haptic.impact('light')
    setActiveTab('plans')
  }

  return (
    <header className="sticky top-0 z-50 bg-bg-primary/95 backdrop-blur border-b border-bg-border px-4 py-3">
      <div className="flex items-center justify-between">
        {/* Logo + Title */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-accent-blue/20 border border-accent-blue/30 flex items-center justify-center">
            <Activity size={14} className="text-accent-blue" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm text-text-primary font-mono tracking-wider">
                NEXARB
              </span>
              {/* FREE Badge */}
              <button 
                onClick={handlePlansClick}
                className="bg-accent-blue/10 border border-accent-blue/20 rounded px-1.5 py-0.5 flex items-center gap-0.5 active:scale-95 transition-transform"
              >
                <Zap size={8} className="text-accent-blue fill-accent-blue" />
                <span className="text-[9px] font-bold text-accent-blue uppercase tracking-tighter">Free</span>
              </button>
            </div>
            <span className="text-text-muted text-[10px] font-sans">
              {TAB_LABELS[activeTab] || 'NEXARB'}
            </span>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2">
          {timeStr && (
            <span className="text-text-muted font-mono text-[10px]">{timeStr}</span>
          )}
          <div className={clsx(
            'flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono',
            wsConnected
              ? 'bg-accent-green/10 text-accent-green border border-accent-green/20'
              : 'bg-text-muted/10 text-text-muted border border-text-muted/20'
          )}>
            {wsConnected
              ? <><Wifi size={10} /><span>LIVE</span></>
              : <><WifiOff size={10} /><span>OFF</span></>
            }
          </div>
        </div>
      </div>
    </header>
  )
}