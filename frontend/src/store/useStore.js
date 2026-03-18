/**
 * NEXARB Scanner - Global State (Zustand)
 */
import { create } from 'zustand'

export const useStore = create((set, get) => ({
  // ── User ──────────────────────────────────────────────────────────────────
  user: null,
  setUser: (user) => set({ user }),

  // ── Active tab ────────────────────────────────────────────────────────────
  activeTab: 'scanner', // scanner | futures | dex | alerts | settings
  setActiveTab: (tab) => set({ activeTab: tab }),

  // ── CEX Scanner ───────────────────────────────────────────────────────────
  cexResults: [],
  cexLoading: false,
  cexError: null,
  cexScannedExchanges: [],
  cexLastScan: null,
  cexCached: false,
  setCexResults: (results, exchanges, cached = false) => set({
    cexResults: results,
    cexScannedExchanges: exchanges,
    cexLastScan: new Date(),
    cexCached: cached,
    cexError: null,
  }),
  setCexLoading: (v) => set({ cexLoading: v }),
  setCexError: (e) => set({ cexError: e, cexLoading: false }),

  // CEX Filters
  cexFilters: {
    minSpread: 0.5,
    minVolume: 50000,
    quote: 'USDT',
    limit: 100,
  },
  setCexFilters: (filters) => set((s) => ({
    cexFilters: { ...s.cexFilters, ...filters },
  })),

  // ── Futures ───────────────────────────────────────────────────────────────
  futuresResults: [],
  futuresLoading: false,
  futuresError: null,
  futuresLastScan: null,
  setFuturesResults: (results) => set({
    futuresResults: results,
    futuresLastScan: new Date(),
    futuresError: null,
  }),
  setFuturesLoading: (v) => set({ futuresLoading: v }),
  setFuturesError: (e) => set({ futuresError: e, futuresLoading: false }),

  // Funding rates
  fundingRates: [],
  fundingLoading: false,
  setFundingRates: (rates) => set({ fundingRates: rates }),
  setFundingLoading: (v) => set({ fundingLoading: v }),

  futuresFilters: {
    minSpread: 0.3,
    limit: 100,
    mode: 'spread', // spread | funding
  },
  setFuturesFilters: (filters) => set((s) => ({
    futuresFilters: { ...s.futuresFilters, ...filters },
  })),

  // ── DEX ───────────────────────────────────────────────────────────────────
  dexResults: [],
  dexLoading: false,
  dexError: null,
  dexLastScan: null,
  dexChainsScanned: [],
  setDexResults: (results, chains) => set({
    dexResults: results,
    dexChainsScanned: chains,
    dexLastScan: new Date(),
    dexError: null,
  }),
  setDexLoading: (v) => set({ dexLoading: v }),
  setDexError: (e) => set({ dexError: e, dexLoading: false }),

  dexFilters: {
    minSpread: 1.0,
    minLiquidity: 10000,
    limit: 100,
  },
  setDexFilters: (filters) => set((s) => ({
    dexFilters: { ...s.dexFilters, ...filters },
  })),

  // ── Alerts ────────────────────────────────────────────────────────────────
  alerts: [],
  alertsLoading: false,
  alertsError: null,
  setAlerts: (alerts) => set({ alerts, alertsError: null }),
  setAlertsLoading: (v) => set({ alertsLoading: v }),
  setAlertsError: (e) => set({ alertsError: e, alertsLoading: false }),
  addAlert: (alert) => set((s) => ({ alerts: [alert, ...s.alerts] })),
  removeAlert: (id) => set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
  updateAlert: (id, data) => set((s) => ({
    alerts: s.alerts.map((a) => (a.id === id ? { ...a, ...data } : a)),
  })),

  // ── WebSocket live data ────────────────────────────────────────────────────
  wsConnected: false,
  wsLastUpdate: null,
  setWsConnected: (v) => set({ wsConnected: v }),
  setWsLastUpdate: (d) => set({ wsLastUpdate: d }),

  // Merge live WS results into CEX results (only if newer and WS is source)
  mergeLiveCexResults: (results) => {
    set({
      cexResults: results,
      wsLastUpdate: new Date(),
    })
  },
}))
