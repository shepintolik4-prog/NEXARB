import { useStore } from '../../store/useStore'
import { WebApp } from '../../telegram'
import { BarChart2, TrendingUp, Layers, Bell, Settings, Repeat, Users } from 'lucide-react'
import clsx from 'clsx'

const TABS = [
  { id: 'scanner',  label: 'CEX',      Icon: BarChart2   },
  { id: 'futures',  label: 'Futures',  Icon: TrendingUp  },
  { id: 'dex',      label: 'DEX',      Icon: Layers      },
  { id: 'trading',  label: 'Trading',  Icon: Repeat      }, // Новая вкладка
  { id: 'referral', label: 'Referral', Icon: Users       }, // Новая вкладка
  { id: 'alerts',   label: 'Alerts',   Icon: Bell        },
  { id: 'settings', label: 'Settings', Icon: Settings    },
]

export default function BottomNav() {
  const { activeTab, setActiveTab, alerts } = useStore()
  const activeAlerts = alerts.filter((a) => a.is_active).length

  const handleTab = (id) => {
    if (id === activeTab) return
    WebApp.haptic.selection()
    setActiveTab(id)
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-bg-primary/98 backdrop-blur border-t border-bg-border safe-bottom">
      <div className="flex items-center justify-around px-1 py-2">
        {TABS.map(({ id, label, Icon }) => {
          const isActive = activeTab === id
          const badge = id === 'alerts' && activeAlerts > 0 ? activeAlerts : null

          return (
            <button
              key={id}
              onClick={() => handleTab(id)}
              className={clsx(
                'relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all duration-150 min-w-[48px]',
                isActive
                  ? 'text-accent-blue'
                  : 'text-text-muted active:text-text-primary'
              )}
            >
              <div className={clsx(
                'relative p-1 rounded-lg transition-colors',
                isActive ? 'bg-accent-blue/15' : 'bg-transparent'
              )}>
                <Icon size={18} strokeWidth={isActive ? 2.5 : 1.8} />
                {badge && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent-red rounded-full text-[9px] font-bold text-white flex items-center justify-center">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </div>
              <span className={clsx(
                'text-[10px] font-medium transition-colors',
                isActive ? 'text-accent-blue' : 'text-text-muted'
              )}>
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}