/**
 * NEXARB Scanner - Telegram WebApp SDK helper
 * Wraps window.Telegram.WebApp with safe fallbacks for dev mode
 */

const tg = typeof window !== 'undefined' && window.Telegram?.WebApp
  ? window.Telegram.WebApp
  : null

// ── Safe WebApp accessor ────────────────────────────────────────────────────

export const WebApp = {
  ready: () => tg?.ready(),
  expand: () => tg?.expand(),
  close: () => tg?.close(),

  // User data
  get user() {
    return tg?.initDataUnsafe?.user || {
      id: 0,
      first_name: 'Dev',
      last_name: 'User',
      username: 'devuser',
    }
  },

  get initData() {
    return tg?.initData || ''
  },

  // Theme
  get colorScheme() {
    return tg?.colorScheme || 'dark'
  },

  get themeParams() {
    return tg?.themeParams || {}
  },

  // Platform
  get platform() {
    return tg?.platform || 'unknown'
  },

  get version() {
    return tg?.version || '6.0'
  },

  // Viewport
  get viewportHeight() {
    return tg?.viewportHeight || window.innerHeight
  },

  get viewportStableHeight() {
    return tg?.viewportStableHeight || window.innerHeight
  },

  // Haptic feedback
  haptic: {
    impact: (style = 'medium') => tg?.HapticFeedback?.impactOccurred(style),
    notification: (type = 'success') => tg?.HapticFeedback?.notificationOccurred(type),
    selection: () => tg?.HapticFeedback?.selectionChanged(),
  },

  // Back button
  backButton: {
    show: () => tg?.BackButton?.show(),
    hide: () => tg?.BackButton?.hide(),
    onClick: (fn) => tg?.BackButton?.onClick(fn),
    offClick: (fn) => tg?.BackButton?.offClick(fn),
  },

  // Main button
  mainButton: {
    show: () => tg?.MainButton?.show(),
    hide: () => tg?.MainButton?.hide(),
    setText: (text) => tg?.MainButton?.setText(text),
    onClick: (fn) => tg?.MainButton?.onClick(fn),
    offClick: (fn) => tg?.MainButton?.offClick(fn),
    showProgress: () => tg?.MainButton?.showProgress(),
    hideProgress: () => tg?.MainButton?.hideProgress(),
    setParams: (params) => tg?.MainButton?.setParams(params),
  },

  // Open link
  openLink: (url) => tg?.openLink(url) || window.open(url, '_blank'),
  openTelegramLink: (url) => tg?.openTelegramLink(url) || window.open(url, '_blank'),

  // Events
  onEvent: (event, fn) => tg?.onEvent(event, fn),
  offEvent: (event, fn) => tg?.offEvent(event, fn),
}

// ── Init sequence ─────────────────────────────────────────────────────────────

export function initTelegramApp() {
  WebApp.ready()
  WebApp.expand()

  // Force dark theme styles to match TG dark mode
  if (tg) {
    document.documentElement.style.setProperty(
      '--tg-viewport-height',
      `${tg.viewportStableHeight}px`
    )
    tg.onEvent('viewportChanged', () => {
      document.documentElement.style.setProperty(
        '--tg-viewport-height',
        `${tg.viewportStableHeight}px`
      )
    })
  }
}

// ── Utility: is running inside Telegram? ──────────────────────────────────────

export const isTelegram = Boolean(tg)
export const telegramUser = WebApp.user
