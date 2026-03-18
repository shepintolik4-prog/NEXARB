import { useStore } from '../../store/useStore'
import { Activity, Wifi, WifiOff } from 'lucide-react'
import clsx from 'clsx'

const TAB_LABELS = {
  scanner: 'CEX Scanner',
  futures: 'Futures',
  dex: 'DEX',
  alerts: 'Alerts',
  settings: 'Settings',
}

export default function Header() {
  const { activeTab, wsConnected, wsLastUpdate, cexLastScan } = useStore()

  const lastUpdate = wsLastUpdate || cexLastScan
  const timeStr = lastUpdate
    ? lastUpdate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null

  return (
    <header className="sticky top-0 z-50 bg-bg-primary/95 backdrop-blur border-b border-bg-border px-4 py-3">
      <div className="flex items-center justify-between">
        {/* Logo + Title */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-accent-blue/20 border border-accent-blue/30 flex items-center justify-center">
            <Activity size={14} className="text-accent-blue" />
          </div>
          <div>
            <span className="font-bold text-sm text-text-primary font-mono tracking-wider">
              NEXARB
            </span>
            <span className="text-text-muted text-xs ml-1 font-sans">
              {TAB_LABELS[activeTab]}
            </span>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2">
          {timeStr && (
            <span className="text-text-muted font-mono text-xs">{timeStr}</span>
          )}
          <div className={clsx(
            'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono',
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
