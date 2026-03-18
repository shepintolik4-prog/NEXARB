import { useCallback } from 'react'
import { useStore } from '../store/useStore'
import { scannerApi } from '../api/client'
import toast from 'react-hot-toast'

export function useScanner() {
  const {
    cexFilters, setCexResults, setCexLoading, setCexError,
    cexResults, cexLoading, cexError, cexScannedExchanges,
    cexLastScan, cexCached,
  } = useStore()

  const scan = useCallback(async (overrides = {}) => {
    setCexLoading(true)
    try {
      const params = { ...cexFilters, ...overrides }
      const { data } = await scannerApi.scan(params)
      setCexResults(data.data || [], data.scanned_exchanges || [], data.cached)
      return data
    } catch (err) {
      setCexError(err.message)
      toast.error(`Scan failed: ${err.message}`)
    }
  }, [cexFilters, setCexResults, setCexLoading, setCexError])

  return { scan, cexResults, cexLoading, cexError, cexScannedExchanges, cexLastScan, cexCached, cexFilters }
}
