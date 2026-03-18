/**
 * NEXARB Scanner - App Root
 * Handles TMA init, user registration, tab routing
 */
import { useEffect, useState } from 'react'
import { Toaster } from 'react-hot-toast'
import { useStore } from './store/useStore'
import { usersApi } from './api/client'
import { initTelegramApp, telegramUser, WebApp } from './telegram'
import { useWebSocket } from './hooks/useWebSocket'

import Header   from './components/Layout/Header'
import BottomNav from './components/Layout/BottomNav'
import ScannerPage  from './components/Scanner/ScannerPage'
import FuturesPage  from './components/Futures/FuturesPage'
import DexPage      from './components/DEX/DexPage'
import AlertsPage   from './components/Alerts/AlertsPage'
import SettingsPage from './components/Settings/SettingsPage'

function AppContent() {
  const { activeTab, user } = useStore()

  // WebSocket — connect only when user is initialized
  useWebSocket(user?.telegram_id ? String(user.telegram_id) : null)

  return (
    <div className="flex flex-col h-screen bg-bg-primary overflow-hidden">
      <Header />

      {/* Page content */}
      <main className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
          {activeTab === 'scanner'  && <ScannerPage  />}
          {activeTab === 'futures'  && <FuturesPage  />}
          {activeTab === 'dex'      && <DexPage      />}
          {activeTab === 'alerts'   && <AlertsPage   />}
          {activeTab === 'settings' && <SettingsPage />}
        </div>
      </main>

      <BottomNav />

      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#16161f',
            color: '#f0f0f8',
            border: '1px solid #2a2a3a',
            borderRadius: '12px',
            fontSize: '13px',
            fontFamily: '"Space Grotesk", sans-serif',
            maxWidth: '320px',
          },
          success: { iconTheme: { primary: '#00e676', secondary: '#16161f' } },
          error:   { iconTheme: { primary: '#ff3d57', secondary: '#16161f' } },
        }}
      />
    </div>
  )
}

export default function App() {
  const { setUser } = useStore()
  const [booting, setBooting] = useState(true)
  const [bootError, setBootError] = useState(null)

  useEffect(() => {
    async function boot() {
      try {
        // 1. Init Telegram WebApp
        initTelegramApp()

        // 2. Get user from Telegram context
        const tgUser = telegramUser

        // 3. Register / fetch user from backend
        const { data } = await usersApi.init({
          telegram_id: tgUser.id || 0,
          username:    tgUser.username   || null,
          first_name:  tgUser.first_name || null,
          last_name:   tgUser.last_name  || null,
          init_data:   WebApp.initData   || 'dev',
        })

        setUser(data)

        // 4. Persist telegram_id for axios interceptor
        if (tgUser.id) {
          localStorage.setItem('nexarb_telegram_id', String(tgUser.id))
        }
      } catch (err) {
        console.warn('Boot error (non-fatal):', err.message)
        // Non-fatal — allow app to run in dev mode without a backend
        setUser({
          telegram_id: telegramUser.id || 0,
          username: telegramUser.username,
          first_name: telegramUser.first_name,
          notifications_enabled: true,
          preferred_quote: 'USDT',
        })
      } finally {
        setBooting(false)
      }
    }

    boot()
  }, [setUser])

  if (booting) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-bg-primary">
        <div className="w-12 h-12 rounded-2xl bg-accent-blue/20 border border-accent-blue/30 flex items-center justify-center mb-4 animate-pulse">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM17.5 14v7M14 17.5h7"
              stroke="#4d9fff" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <p className="text-text-muted text-sm font-mono tracking-widest">NEXARB</p>
        <p className="text-text-muted text-xs mt-1">Loading scanner…</p>
      </div>
    )
  }

  return <AppContent />
}
