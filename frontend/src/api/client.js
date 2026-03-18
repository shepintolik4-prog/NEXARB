/**
 * NEXARB Scanner - API Client
 * Axios instance pointed at the FastAPI backend
 */
import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

// ── Request interceptor: attach telegram_id header ─────────────────────────
api.interceptors.request.use((config) => {
  const telegramId = localStorage.getItem('nexarb_telegram_id')
  if (telegramId) {
    config.headers['X-Telegram-Id'] = telegramId
  }
  return config
})

// ── Response interceptor: normalize errors ────────────────────────────────
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg = err.response?.data?.detail || err.message || 'Request failed'
    return Promise.reject(new Error(msg))
  }
)

// ── CEX Scanner ────────────────────────────────────────────────────────────

export const scannerApi = {
  scan: (params = {}) => api.post('/api/scanner/scan', {
    min_spread_pct: params.minSpread ?? 0.5,
    min_volume_24h: params.minVolume ?? 50000,
    quote_currency: params.quote ?? 'USDT',
    limit: params.limit ?? 100,
    symbols: params.symbols ?? null,
    exchanges: params.exchanges ?? null,
    user_api_keys: params.userApiKeys ?? null,
  }),

  getExchanges: () => api.get('/api/scanner/exchanges'),
  getSymbols: () => api.get('/api/scanner/symbols'),
}

// ── Futures ────────────────────────────────────────────────────────────────

export const futuresApi = {
  scan: (params = {}) => api.post('/api/futures/scan', {
    min_spread_pct: params.minSpread ?? 0.3,
    limit: params.limit ?? 100,
    symbols: params.symbols ?? null,
    exchanges: params.exchanges ?? null,
  }),

  fundingRates: (params = {}) => api.get('/api/futures/funding-rates', {
    params: {
      limit: params.limit ?? 50,
      exchanges: params.exchanges ?? null,
      symbols: params.symbols ?? null,
    },
  }),
}

// ── DEX ────────────────────────────────────────────────────────────────────

export const dexApi = {
  scan: (params = {}) => api.post('/api/dex/scan', {
    min_spread_pct: params.minSpread ?? 1.0,
    min_liquidity_usd: params.minLiquidity ?? 10000,
    limit: params.limit ?? 100,
    tokens: params.tokens ?? null,
    chains: params.chains ?? null,
  }),

  getChains: () => api.get('/api/dex/chains'),
}

// ── Alerts ─────────────────────────────────────────────────────────────────

export const alertsApi = {
  list: (telegramId) => api.get(`/api/alerts/${telegramId}`),

  create: (data) => api.post('/api/alerts/', data),

  update: (alertId, data) => api.patch(`/api/alerts/${alertId}`, data),

  delete: (alertId, telegramId) =>
    api.delete(`/api/alerts/${alertId}`, { params: { telegram_id: telegramId } }),

  history: (alertId, telegramId) =>
    api.get(`/api/alerts/${alertId}/history`, { params: { telegram_id: telegramId } }),
}

// ── Users ──────────────────────────────────────────────────────────────────

export const usersApi = {
  init: (data) => api.post('/api/users/init', data),

  get: (telegramId) => api.get(`/api/users/${telegramId}`),

  saveApiKeys: (data) => api.post('/api/users/api-keys', data),

  deleteApiKeys: (telegramId, exchange) =>
    api.delete(`/api/users/${telegramId}/api-keys/${exchange}`),

  updatePreferences: (telegramId, prefs) =>
    api.patch(`/api/users/${telegramId}/preferences`, null, { params: prefs }),
}

// ── Stats ──────────────────────────────────────────────────────────────────

export const statsApi = {
  get: () => api.get('/api/stats'),
}

export const WS_URL = BASE_URL.replace(/^http/, 'ws')
