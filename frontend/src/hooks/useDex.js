/**
 * NEXARB Scanner - useDex Hook
 * DEX scan state and actions
 */
import { useCallback } from 'react'
import { useStore } from '../store/useStore'
import { dexApi } from '../api/client'
import toast from 'react-hot-toast'

export function useDex() {
  const {
    dexFilters, setDexResults, setDexLoading, setDexError,
    dexResults, dexLoading, dexError, dexLastScan, dexChainsScanned,
  } = useStore()

  const scan = useCallback(async (overrides = {}) => {
    setDexLoading(true)
    try {
      const params = { ...dexFilters, ...overrides }
      const { data } = await dexApi.scan(params)
      setDexResults(data.data || [], data.chains_scanned || [])
      return data
    } catch (err) {
      setDexError(err.message)
      toast.error(`DEX scan failed: ${err.message}`)
    }
  }, [dexFilters, setDexResults, setDexLoading, setDexError])

  return {
    scan,
    dexResults,
    dexLoading,
    dexError,
    dexLastScan,
    dexChainsScanned,
    dexFilters,
  }
}
