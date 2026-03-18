/**
 * NEXARB v2 - useTrading hook
 * Trading state and actions
 */
import { useCallback, useState } from 'react'
import { useStore } from '../store/useStore'
import { api } from '../api/client'
import toast from 'react-hot-toast'

export function useTrading() {
  const { user } = useStore()
  const [stats, setStats] = useState(null)
  const [history, setHistory] = useState([])
  const [calculation, setCalculation] = useState(null)
  const [calcLoading, setCalcLoading] = useState(false)
  const [executing, setExecuting] = useState(false)

  const loadStats = useCallback(async () => {
    if (!user?.telegram_id) return
    try {
      const { data } = await api.get(`/api/trading/${user.telegram_id}/stats`)
      setStats(data)
    } catch (_) {}
  }, [user])

  const loadHistory = useCallback(async (limit = 20) => {
    if (!user?.telegram_id) return
    try {
      const { data } = await api.get(`/api/trading/${user.telegram_id}/history?limit=${limit}`)
      setHistory(data.data || [])
    } catch (_) {}
  }, [user])

  const calculateTrade = useCallback(async ({
    symbol, exchangeBuy, exchangeSell, priceBuy, priceSell, amountUsdt
  }) => {
    setCalcLoading(true)
    setCalculation(null)
    try {
      const { data } = await api.post('/api/trading/calculate', {
        telegram_id: user.telegram_id,
        symbol,
        exchange_buy: exchangeBuy,
        exchange_sell: exchangeSell,
        price_buy: priceBuy,
        price_sell: priceSell,
        amount_usdt: amountUsdt,
      })
      setCalculation(data)
      return data
    } catch (e) {
      toast.error('Calculation failed')
      return null
    } finally {
      setCalcLoading(false)
    }
  }, [user])

  const executeTrade = useCallback(async ({
    symbol, exchangeBuy, exchangeSell, priceBuy, priceSell, amountUsdt, apiKeys
  }) => {
    setExecuting(true)
    try {
      const { data } = await api.post('/api/trading/confirm-execute', {
        telegram_id: user.telegram_id,
        symbol,
        exchange_buy: exchangeBuy,
        exchange_sell: exchangeSell,
        price_buy: priceBuy,
        price_sell: priceSell,
        amount_usdt: amountUsdt,
        api_keys: apiKeys,
      })
      if (data.success) {
        toast.success(`Trade executed! Profit: $${data.net_profit_usd?.toFixed(4)}`)
        await loadStats()
        await loadHistory()
      } else {
        throw new Error(data.error || 'Trade failed')
      }
      return data
    } catch (e) {
      toast.error(e.message)
      return { success: false, error: e.message }
    } finally {
      setExecuting(false)
    }
  }, [user, loadStats, loadHistory])

  return {
    stats,
    history,
    calculation,
    calcLoading,
    executing,
    loadStats,
    loadHistory,
    calculateTrade,
    executeTrade,
  }
}
