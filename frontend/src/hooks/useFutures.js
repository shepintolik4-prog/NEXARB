import { useCallback } from 'react'
import { useStore } from '../store/useStore'
import { futuresApi, dexApi } from '../api/client'
import toast from 'react-hot-toast'

export function useFutures() {
  const {
    futuresFilters, setFuturesResults, setFuturesLoading, setFuturesError,
    setFundingRates, setFundingLoading,
    futuresResults, futuresLoading, futuresError, futuresLastScan,
    fundingRates, fundingLoading,
  } = useStore()

  const scanFutures = useCallback(async (overrides = {}) => {
    setFuturesLoading(true)
    try {
      const params = { ...futuresFilters, ...overrides }
      const { data } = await futuresApi.scan(params)
      setFuturesResults(data.data || [])
      return data
    } catch (err) {
      setFuturesError(err.message)
      toast.error(`Futures scan failed: ${err.message}`)
    }
  }, [futuresFilters, setFuturesResults, setFuturesLoading, setFuturesError])

  const scanFunding = useCallback(async () => {
    setFundingLoading(true)
    try {
      const { data } = await futuresApi.fundingRates({ limit: 100 })
      setFundingRates(data.data || [])
    } catch (err) {
      toast.error(`Funding rates failed: ${err.message}`)
    } finally {
      setFundingLoading(false)
    }
  }, [setFundingRates, setFundingLoading])

  return {
    scanFutures, scanFunding,
    futuresResults, futuresLoading, futuresError, futuresLastScan,
    fundingRates, fundingLoading, futuresFilters,
  }
}

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

  return { scan, dexResults, dexLoading, dexError, dexLastScan, dexChainsScanned, dexFilters }
}
