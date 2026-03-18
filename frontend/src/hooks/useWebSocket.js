/**
 * NEXARB Scanner - WebSocket Hook
 * Connects to backend WS and streams live spread updates
 */
import { useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store/useStore'
import { WS_URL } from '../api/client'

export function useWebSocket(telegramId) {
  const wsRef = useRef(null)
  const reconnectTimer = useRef(null)
  const reconnectAttempts = useRef(0)
  const MAX_RECONNECT = 5

  const { setWsConnected, mergeLiveCexResults, setWsLastUpdate } = useStore()

  const connect = useCallback(() => {
    if (!telegramId) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    try {
      const ws = new WebSocket(`${WS_URL}/ws/${telegramId}`)
      wsRef.current = ws

      ws.onopen = () => {
        setWsConnected(true)
        reconnectAttempts.current = 0
        // Subscribe immediately
        ws.send(JSON.stringify({ type: 'subscribe_scan' }))
        // Keep-alive ping every 30s
        const pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }))
          } else {
            clearInterval(pingInterval)
          }
        }, 30000)
        ws._pingInterval = pingInterval
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'spread_update' && msg.data?.length) {
            mergeLiveCexResults(msg.data)
            setWsLastUpdate(new Date())
          }
        } catch (_) {}
      }

      ws.onclose = () => {
        setWsConnected(false)
        clearInterval(ws._pingInterval)
        // Exponential backoff reconnect
        if (reconnectAttempts.current < MAX_RECONNECT) {
          const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 30000)
          reconnectAttempts.current++
          reconnectTimer.current = setTimeout(connect, delay)
        }
      }

      ws.onerror = () => {
        ws.close()
      }
    } catch (_) {}
  }, [telegramId, setWsConnected, mergeLiveCexResults, setWsLastUpdate])

  const disconnect = useCallback(() => {
    clearTimeout(reconnectTimer.current)
    if (wsRef.current) {
      clearInterval(wsRef.current._pingInterval)
      wsRef.current.close()
      wsRef.current = null
    }
    setWsConnected(false)
  }, [setWsConnected])

  useEffect(() => {
    connect()
    return disconnect
  }, [connect, disconnect])

  return { disconnect }
}
