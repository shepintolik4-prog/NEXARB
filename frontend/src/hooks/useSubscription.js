/**
 * NEXARB v2 - useSubscription hook
 */
import { useCallback, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { api } from '../api/client'

export function useSubscription() {
  const { user, subscription, setSubscription } = useStore()

  const loadSubscription = useCallback(async () => {
    if (!user?.telegram_id) return
    try {
      const { data } = await api.get(`/api/subscriptions/${user.telegram_id}`)
      setSubscription(data)
    } catch (_) {}
  }, [user, setSubscription])

  useEffect(() => {
    loadSubscription()
  }, [loadSubscription])

  const isVip = subscription?.is_vip ?? false
  const canAccess = (module) => {
    if (isVip) return true
    const freeModules = ['cex']
    return freeModules.includes(module)
  }

  return { subscription, isVip, canAccess, refresh: loadSubscription }
}
