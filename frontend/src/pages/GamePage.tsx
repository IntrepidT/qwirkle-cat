import { useState, useCallback, useEffect, useRef } from 'react'
import { useGame } from '../hooks/useGame'
import { useQueryClient } from '@tanstack/react-query'
import { useGameSocket } from '../hooks/useGameSocket'
import { getResults } from '../api/client'
import Board from '../components/Board'
import Hand from '../components/Hand'
import PlayerList from '../components/PlayerList'
import Chat from '../components/Chat'
import GameOver from '../components/GameOver'
import QwirkleConfetti from '../components/QwirkleConfetti'
import type { ChatMessage, GameView, GameResults, PlacedTile, Position, Tile } from '../types/types'
import { AVATAR_MESSAGE_PREFIX } from '../assets/catAssets'

interface GamePageProps {
  gameId: string
  playerId: string
  playerName: string
  avatarUrl: string
  onBackToLobby: () => void
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 transition-colors shrink-0"
    >
      {copied ? '✓' : 'Copy'}
    </button>
  )
}

export default function GamePage({ gameId, playerId, playerName, avatarUrl, onBackToLobby }: GamePageProps) {
  const { game, refresh, placeTiles, isPlacing, exchangeTiles, isExchanging, startGame } = useGame(gameId, playerId)
  const queryClient = useQueryClient()

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [results, setResults] = useState<GameResults | null>(null)
  const [selectedHandIndices, setSelectedHandIndices] = useState<number[]>([])
  const [pendingPlacements, setPendingPlacements] = useState<PlacedTile[]>([])
  const [stagedHandIndices, setStagedHandIndices] = useState<number[]>([])
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [placeError, setPlaceError] = useState<string | null>(null)
  const [qwirkleCount, setQwirkleCount] = useState(0)
  const [localHand, setLocalHand] = useState<Tile[] | null>(null)
  const [lastPlayPositions, setLastPlayPositions] = useState<Position[]>([])
  const [placementValid, setPlacementValid] = useState(true)
  // Track the previous board so we can diff incoming state to find the last play's positions
  const prevBoardKeysRef = useRef<Set<string>>(new Set())
  // avatarMap: maps player_id → gif URL, populated when players announce their avatar
  const [avatarMap, setAvatarMap] = useState<Record<string, string>>(() => ({
    [playerId]: avatarUrl,
  }))

  // ---------------------------------------------------------------------------
  // WebSocket
  // ---------------------------------------------------------------------------

  const addSystemMessage = useCallback((text: string) => {
    setChatMessages(prev => [...prev, {
      player_id: 'system',
      player_name: 'Game',
      text,
      sent_at: new Date().toISOString(),
    } as ChatMessage])
  }, [])

  const onGameState = useCallback((data: GameView) => {
    // Always refresh so bag_count, scores, current_turn stay live
    refresh(data)

    // Diff the incoming board against the previous snapshot to find newly placed tiles.
    // This works for ALL players — the person who played AND observers.
    if (data.board && data.board.length > 0) {
      const newKeys = data.board.map((pt: PlacedTile) => `${pt.position.x},${pt.position.y}`)
      const newPositions = data.board
        .filter((pt: PlacedTile) => !prevBoardKeysRef.current.has(`${pt.position.x},${pt.position.y}`))
        .map((pt: PlacedTile) => pt.position)
      if (newPositions.length > 0) {
        setLastPlayPositions(newPositions)
      }
      prevBoardKeysRef.current = new Set(newKeys)
    }

    if (data.your_hand != null) {
      // Append new tiles to end rather than resetting order.
      // Compare incoming hand to current to find newly drawn tiles.
      setLocalHand(prev => {
        const incoming = data.your_hand ?? []
        if (!prev) return null  // no local order yet, let server order stand
        // Find tiles in incoming that aren't accounted for in prev (by color+shape count)
        const prevCounts = new Map<string, number>()
        for (const t of prev) {
          const k = `${t.color}-${t.shape}`
          prevCounts.set(k, (prevCounts.get(k) ?? 0) + 1)
        }
        const newTiles: Tile[] = []
        const remaining = new Map(prevCounts)
        for (const t of incoming) {
          const k = `${t.color}-${t.shape}`
          if ((remaining.get(k) ?? 0) > 0) {
            remaining.set(k, remaining.get(k)! - 1)
          } else {
            newTiles.push(t)
          }
        }
        if (newTiles.length === 0) return null  // hand shrank (tiles played), reset order
        // Keep existing tiles in their order, append new ones at end
        const kept = prev.filter(t => {
          const k = `${t.color}-${t.shape}`
          // keep tiles still present in incoming
          const incomingCount = incoming.filter(i => `${i.color}-${i.shape}` === k).length
          const prevCount = prev.filter(p => `${p.color}-${p.shape}` === k).length
          return incomingCount >= prevCount
        })
        return [...kept, ...newTiles]
      })
      setStagedHandIndices([])
      setSelectedHandIndices([])
      setPendingPlacements([])
    } else {
      queryClient.invalidateQueries({ queryKey: ['game', gameId, playerId] })
    }
    if (data.status === 'finished') {
      getResults(gameId).then(r => setResults(r.data))
    }
  }, [gameId, playerId, refresh, queryClient])

  const onChat = useCallback((msg: ChatMessage) => {
    // Avatar announcements are special — store in map, don't show in chat
    if (msg.text.startsWith(AVATAR_MESSAGE_PREFIX)) {
      const url = msg.text.slice(AVATAR_MESSAGE_PREFIX.length)
      setAvatarMap(prev => ({ ...prev, [msg.player_id]: url }))
      return
    }
    setChatMessages(prev => [...prev, msg])
  }, [])

  const { sendChat } = useGameSocket(gameId, playerId, onGameState, onChat)

  // Announce own avatar to other players once the socket is ready.
  // We delay slightly to ensure the connection is established first.
  const avatarAnnounced = useRef(false)
  useEffect(() => {
    if (avatarAnnounced.current || !sendChat) return
    const t = setTimeout(() => {
      sendChat(AVATAR_MESSAGE_PREFIX + avatarUrl)
      avatarAnnounced.current = true
    }, 500)
    return () => clearTimeout(t)
  }, [sendChat, avatarUrl])

  // wrap sendChat to also add message locally (since we don't echo back to sender)
  const handleSendChat = useCallback((text: string) => {
    // Avatar messages are internal — never add them to the visible chat list
    if (!text.startsWith(AVATAR_MESSAGE_PREFIX)) {
      const msg: ChatMessage = {
        player_id: playerId,
        player_name: playerName,
        text,
        sent_at: new Date().toISOString(),
      }
      setChatMessages(prev => [...prev, msg])
    }
    sendChat(text)
  }, [playerId, playerName, sendChat])

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const serverHand = game?.your_hand ?? []
  const hand = localHand ?? serverHand
  const board = game?.board ?? []
  const players = game?.players ?? []
  const isMyTurn = game ? game.players[game.current_turn]?.id === playerId : false

  // sync localHand when serverHand changes length (tiles were played/drawn)
  // but don't wipe a reorder the player just did
  const expectedHandSize = serverHand.length
  useEffect(() => {
    if (localHand && localHand.length !== expectedHandSize) {
      setLocalHand(null)
    }
  }, [serverHand, expectedHandSize, localHand])

  // ---------------------------------------------------------------------------
  // Hand reorder
  // ---------------------------------------------------------------------------

  const handleReorder = useCallback((newTiles: Tile[]) => {
    setLocalHand(newTiles)
    // remap staged/selected indices to match new order
    // (simplest: just clear staging — reorder shouldn't happen mid-placement)
  }, [])

  // ---------------------------------------------------------------------------
  // Tile staging (shared by click and drag)
  // ---------------------------------------------------------------------------

  const stageTile = (handIndex: number, pos: Position) => {
    if (!game) return
    if (pendingPlacements.some(p => p.position.x === pos.x && p.position.y === pos.y)) return
    const tile: Tile = hand[handIndex]
    setPendingPlacements(prev => [...prev, { tile, position: pos }])
    setStagedHandIndices(prev => [...prev, handIndex])
    setSelectedHandIndices(prev => prev.filter(i => i !== handIndex))
  }

  const toggleHandTile = (index: number) => {
    setSelectedHandIndices(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    )
  }

  const handleCellClick = (pos: Position) => {
    if (!isMyTurn || selectedHandIndices.length === 0) return
    stageTile(selectedHandIndices[0], pos)
  }

  const handleDragStart = (index: number, e: React.DragEvent) => {
    setDraggingIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDrop = (pos: Position) => {
    if (draggingIndex === null || !isMyTurn) return
    stageTile(draggingIndex, pos)
    setDraggingIndex(null)
  }

  // Remove a single pending placement and return that hand index to the hand
  const handleUnstage = useCallback((pos: Position) => {
    setPendingPlacements(prev => {
      const idx = prev.findIndex(p => p.position.x === pos.x && p.position.y === pos.y)
      if (idx === -1) return prev
      setStagedHandIndices(staged => staged.filter((_, i) => i !== idx))
      // intentionally do NOT re-select the tile — player can click it again deliberately
      return prev.filter((_, i) => i !== idx)
    })
  }, [])

  // ---------------------------------------------------------------------------
  // Submit / cancel / exchange
  // ---------------------------------------------------------------------------

  const handleSubmitPlacements = () => {
    if (pendingPlacements.length === 0 || !placementValid) return
    setPlaceError(null)
    placeTiles(pendingPlacements, {
      onSuccess: (data: any) => {
        const score = data?.score_earned ?? 0
        const qwirkles = data?.qwirkles ?? 0
        const finishBonus = data?.finish_bonus ?? 0
        const totalScore = score + finishBonus
        const msg = finishBonus > 0
          ? `${playerName} placed ${pendingPlacements.length} tile${pendingPlacements.length > 1 ? 's' : ''} for ${score} pts + ${finishBonus} finish bonus = ${totalScore} pts!`
          : `${playerName} placed ${pendingPlacements.length} tile${pendingPlacements.length > 1 ? 's' : ''} for ${score} point${score !== 1 ? 's' : ''}!`
        addSystemMessage(msg)
        if (qwirkles > 0) setQwirkleCount(qwirkles)
        setPendingPlacements([])
        setSelectedHandIndices([])
        setStagedHandIndices([])
        setLocalHand(null)
      },
      onError: (e: any) => {
        setPlaceError(e?.response?.data?.error ?? 'Invalid placement')
        setPendingPlacements([])
        setStagedHandIndices([])
        setSelectedHandIndices([])
      },
    })
  }

  const handleCancelPlacements = () => {
    setPendingPlacements([])
    setSelectedHandIndices([])
    setStagedHandIndices([])
    setPlaceError(null)
  }

  const handleExchange = () => {
    if (!game || selectedHandIndices.length === 0) return
    const tiles = selectedHandIndices.map(i => hand[i])
    exchangeTiles(tiles, {
      onSuccess: () => {
        addSystemMessage(`${playerName} exchanged ${tiles.length} tile${tiles.length > 1 ? 's' : ''}.`)
        setSelectedHandIndices([])
        setStagedHandIndices([])
        setLocalHand(null)
        setLastPlayPositions([])
      },
    })
  }

  // ---------------------------------------------------------------------------
  // Waiting lobby
  // ---------------------------------------------------------------------------

  if (game?.status === 'waiting') {
    const catName = (game as any).name as string | undefined
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="text-center max-w-md w-full">
          <div className="text-center">
              <div className="text-4xl mb-3">
                {avatarUrl
                  ? <img src={avatarUrl} alt="your cat" className="w-16 h-16 rounded-full border-2 border-amber-400 object-cover mx-auto" />
                  : '🐱'}
              </div>
            </div>
          <h2 className="text-2xl font-bold text-white mb-6">Waiting for players...</h2>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 flex flex-col gap-4">

            {/* Cat name — big and easy to share */}
            {catName && (
              <div>
                <p className="text-xs uppercase tracking-widest text-slate-400 font-semibold mb-1">🐾 Game Name</p>
                <div className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-3">
                  <p className="font-mono text-amber-400 text-base font-bold flex-1 text-left select-all">{catName}</p>
                  <CopyButton text={catName} />
                </div>
                <p className="text-slate-500 text-xs mt-1">Share this name so friends can find your game</p>
              </div>
            )}

            <p className="text-slate-400 text-sm">{players.length} / 4 players joined</p>

            {game.players[0]?.id === playerId ? (
              <button
                onClick={() => startGame()}
                disabled={game.players.length < 2}
                className="w-full py-3 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {game.players.length < 2 ? '😿 Need at least 2 players...' : '🐾 Start Game'}
              </button>
            ) : (
              <p className="text-slate-500 text-sm">Waiting for host to start...</p>
            )}
          </div>
          <button onClick={onBackToLobby} className="mt-4 text-slate-500 text-sm hover:text-slate-400 transition-colors">
            ← Back to lobby
          </button>
        </div>
      </div>
    )
  }

  if (results) {
    return <GameOver results={results} myPlayerId={playerId} onBackToLobby={onBackToLobby} />
  }

  if (!game) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-400">Loading...</p>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Active game
  // ---------------------------------------------------------------------------

  const selectedTile = selectedHandIndices.length > 0
    ? hand[selectedHandIndices[0]]
    : draggingIndex !== null ? hand[draggingIndex] : null

  const currentPlayerName = players[game.current_turn]?.name ?? '...'

  return (
    <div className="h-screen bg-slate-950 text-white flex flex-col overflow-hidden">
      {qwirkleCount > 0 && (
        <QwirkleConfetti
          qwirkles={qwirkleCount}
          onDone={() => setQwirkleCount(0)}
        />
      )}
      {/* top bar */}
      <div className="border-b border-slate-800 px-4 py-2 shrink-0 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 shrink-0">
          <h1 className="font-black tracking-tight text-lg">🐱 QWIRKLECAT</h1>
        </div>

        {/* cat game name */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-mono text-amber-400/80 text-xs truncate">{(game as any).name ?? gameId}</span>
          <CopyButton text={(game as any).name ?? gameId} />
        </div>

        <div className="flex items-center gap-3 text-sm text-slate-400 shrink-0">
          <span>Bag: <span className="text-white font-mono">{game.bag_count}</span></span>
          {isMyTurn
            ? <span className="bg-amber-500 text-black font-bold px-2 py-0.5 rounded text-xs">Your Turn</span>
            : <span className="text-slate-400 text-xs">{currentPlayerName}'s turn</span>
          }
          {avatarUrl && <img src={avatarUrl} alt="you" className="w-7 h-7 rounded-full object-cover border border-amber-400/50" />}
        </div>
      </div>

      {/* main layout */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-[2] overflow-hidden p-4 flex flex-col min-w-0">
          {placeError && (
            <div className="mb-3 px-4 py-2 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm flex justify-between items-center shrink-0">
              <span>{placeError}</span>
              <button onClick={() => setPlaceError(null)} className="text-red-400 hover:text-red-200 ml-2">✕</button>
            </div>
          )}
          <Board
            placedTiles={board}
            pendingPlacements={pendingPlacements}
            selectedTile={selectedTile}
            isMyTurn={isMyTurn}
            lastPlayPositions={lastPlayPositions}
            onCellClick={handleCellClick}
            onDrop={handleDrop}
            onUnstage={handleUnstage}
            onPendingClick={handleUnstage}
            onValidityChange={(valid, _score) => setPlacementValid(valid)}
          />
        </div>

        <div className="flex-[1] min-w-[280px] border-l border-slate-800 flex flex-col overflow-hidden p-4 gap-3">
          <div className="shrink-0">
            <PlayerList players={players} currentTurn={game.current_turn} myPlayerId={playerId} avatarMap={avatarMap} />
          </div>
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <Chat messages={chatMessages} myPlayerId={playerId} myAvatarUrl={avatarUrl} avatarMap={avatarMap} onSend={handleSendChat} />
          </div>
        </div>
      </div>

      {/* bottom bar */}
      <div className="border-t border-slate-800 p-4 shrink-0 flex flex-col items-center gap-3">
        <Hand
          tiles={hand}
          selectedIndices={selectedHandIndices}
          stagedIndices={stagedHandIndices}
          onToggle={toggleHandTile}
          onDragStart={handleDragStart}
          onReorder={handleReorder}
        />
        {isMyTurn && (
          <div className="flex gap-2 flex-wrap justify-center">
            {pendingPlacements.length > 0 && (
              <>
                <button
                  onClick={handleSubmitPlacements}
                  disabled={isPlacing || !placementValid}
                  className="px-4 py-2 bg-green-600 text-white font-semibold text-sm rounded-lg hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {!placementValid ? '✕ Illegal placement' : `Place ${pendingPlacements.length} tile${pendingPlacements.length > 1 ? 's' : ''}`}
                </button>
                <button
                  onClick={handleCancelPlacements}
                  className="px-4 py-2 bg-slate-700 text-white text-sm rounded-lg hover:bg-slate-600 transition-colors"
                >
                  Cancel
                </button>
              </>
            )}
            {selectedHandIndices.length > 0 && pendingPlacements.length === 0 && (
              <button
                onClick={handleExchange}
                disabled={isExchanging}
                className="px-4 py-2 bg-blue-600 text-white font-semibold text-sm rounded-lg hover:bg-blue-500 disabled:opacity-40 transition-colors"
              >
                Exchange {selectedHandIndices.length} tile{selectedHandIndices.length > 1 ? 's' : ''}
              </button>
            )}
          </div>
        )}
        {!isMyTurn && (
          <p className="text-slate-500 text-xs">Waiting for {currentPlayerName}...</p>
        )}
      </div>
    </div>
  )
}
