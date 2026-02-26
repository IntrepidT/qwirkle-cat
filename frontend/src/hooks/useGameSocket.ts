import { useEffect, useRef, useCallback } from 'react'
import type { GameView, ChatMessage } from '../types'

interface WsMessage {
  type: 'game_state' | 'chat'
  payload: any
}

const RECONNECT_DELAY_MS = 3000
const MAX_RECONNECT_ATTEMPTS = 10

export function useGameSocket(
  gameId: string,
  playerId: string,
  onGameState: (data: GameView) => void,
  onChat: (msg: ChatMessage) => void,
) {
  const ws = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const attempts = useRef(0)
  const unmounted = useRef(false)

  // keep callbacks in refs so reconnect closure doesn't go stale
  const onGameStateRef = useRef(onGameState)
  const onChatRef = useRef(onChat)
  useEffect(() => { onGameStateRef.current = onGameState }, [onGameState])
  useEffect(() => { onChatRef.current = onChat }, [onChat])

  const connect = useCallback(() => {
    if (unmounted.current) return
    if (attempts.current >= MAX_RECONNECT_ATTEMPTS) {
      console.warn('[ws] max reconnect attempts reached, giving up')
      return
    }

    // relative path — Vite proxies /ws → localhost:8080
    const url = `/ws/games/${gameId}?player_id=${playerId}`
    // convert to ws:// using current page protocol/host
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}${url}`

    console.log(`[ws] connecting (attempt ${attempts.current + 1})`)
    const socket = new WebSocket(wsUrl)
    ws.current = socket

    socket.onopen = () => {
      console.log('[ws] connected')
      attempts.current = 0  // reset on successful connect
    }

    socket.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data)
        if (msg.type === 'game_state') {
          onGameStateRef.current(msg.payload as GameView)
        } else if (msg.type === 'chat') {
          onChatRef.current(msg.payload as ChatMessage)
        }
      } catch (e) {
        console.warn('[ws] failed to parse message', e)
      }
    }

    socket.onerror = () => {
      // onerror always fires before onclose — just log, let onclose handle reconnect
      console.log('[ws] error (will reconnect)')
    }

    socket.onclose = (event) => {
      console.log(`[ws] closed (code=${event.code})`)
      ws.current = null
      if (!unmounted.current) {
        attempts.current += 1
        const delay = RECONNECT_DELAY_MS * Math.min(attempts.current, 4) // backoff up to 12s
        console.log(`[ws] reconnecting in ${delay}ms`)
        reconnectTimer.current = setTimeout(connect, delay)
      }
    }
  }, [gameId, playerId]) // stable — callbacks accessed via refs

  useEffect(() => {
    unmounted.current = false
    attempts.current = 0
    connect()
    return () => {
      unmounted.current = true
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      ws.current?.close(1000, 'component unmounted')
    }
  }, [connect])

  const sendChat = useCallback((text: string) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(text)
    }
  }, [])

  return { sendChat }
}
