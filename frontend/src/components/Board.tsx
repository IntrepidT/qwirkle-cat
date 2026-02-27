import { useRef, useState, useCallback, useLayoutEffect, useEffect } from 'react'
import type { PlacedTile, Position, Tile } from '../types/types'
import TileComponent from './Tile'

interface BoardProps {
  placedTiles: PlacedTile[]
  pendingPlacements: PlacedTile[]
  selectedTile: Tile | null
  isMyTurn: boolean
  lastPlayPositions?: Position[]         // positions from the most recent committed play
  onCellClick: (pos: Position) => void
  onDrop: (pos: Position) => void
  onUnstage: (pos: Position) => void
  onPendingClick: (pos: Position) => void
  onValidityChange?: (valid: boolean, score: number) => void  // reports live validity + score up
}

const CELL_SIZE = 56
const GAP = 4
const STEP = CELL_SIZE + GAP
const PAD = 3

function getBounds(tiles: PlacedTile[]) {
  if (tiles.length === 0) return { minX: -5, maxX: 5, minY: -5, maxY: 5 }
  const xs = tiles.map(t => t.position.x)
  const ys = tiles.map(t => t.position.y)
  return {
    minX: Math.min(...xs) - PAD,
    maxX: Math.max(...xs) + PAD,
    minY: Math.min(...ys) - PAD,
    maxY: Math.max(...ys) + PAD,
  }
}

function cellToPixel(boardX: number, boardY: number, minX: number, minY: number) {
  return {
    px: (boardX - minX) * STEP,
    py: (boardY - minY) * STEP,
  }
}

// ---------------------------------------------------------------------------
// Qwirkle scoring — mirrors server logic client-side for live preview
// ---------------------------------------------------------------------------
function calcPendingScore(placed: PlacedTile[], board: PlacedTile[]): { score: number; valid: boolean; illegalPositions: Set<string> } {
  if (placed.length === 0) return { score: 0, valid: true, illegalPositions: new Set() }

  const allTiles = new Map<string, Tile>()
  for (const pt of board) allTiles.set(`${pt.position.x},${pt.position.y}`, pt.tile)
  for (const pt of placed) allTiles.set(`${pt.position.x},${pt.position.y}`, pt.tile)

  const illegalPositions = new Set<string>()

  // All pending must be in same row or same column
  const xs = placed.map(p => p.position.x)
  const ys = placed.map(p => p.position.y)
  const sameRow = ys.every(y => y === ys[0])
  const sameCol = xs.every(x => x === xs[0])

  if (!sameRow && !sameCol) {
    placed.forEach(p => illegalPositions.add(`${p.position.x},${p.position.y}`))
    return { score: 0, valid: false, illegalPositions }
  }

  // Check each line that a pending tile participates in
  function getLine(pos: Position, horizontal: boolean): Tile[] {
    const tiles: Tile[] = []
    const step = horizontal ? { dx: 1, dy: 0 } : { dx: 0, dy: 1 }
    // walk backward
    let cx = pos.x - step.dx, cy = pos.y - step.dy
    while (allTiles.has(`${cx},${cy}`)) { cx -= step.dx; cy -= step.dy }
    // walk forward
    cx = pos.x; cy = pos.y
    while (allTiles.has(`${cx},${cy}`)) {
      tiles.push(allTiles.get(`${cx},${cy}`)!)
      cx += step.dx; cy += step.dy
    }
    return tiles
  }

  function lineValid(tiles: Tile[]): boolean {
    if (tiles.length <= 1) return true
    const colors = new Set(tiles.map(t => t.color))
    const shapes = new Set(tiles.map(t => t.shape))
    // All same color, all different shapes OR all same shape, all different colors
    const allSameColor = colors.size === 1
    const allSameShape = shapes.size === 1
    const allDiffColors = colors.size === tiles.length
    const allDiffShapes = shapes.size === tiles.length
    if (!(allSameColor && allDiffShapes) && !(allSameShape && allDiffColors)) return false
    // No duplicates within a line
    const keys = new Set(tiles.map(t => `${t.color}-${t.shape}`))
    return keys.size === tiles.length
  }

  function lineScore(tiles: Tile[]): number {
    if (tiles.length === 0) return 0
    return tiles.length === 6 ? 12 : tiles.length  // 6 = qwirkle = double
  }

  let totalScore = 0
  let valid = true

  // Score each pending tile's contribution
  const scoredLines = new Set<string>()

  for (const pt of placed) {
    // horizontal line
    const hLine = getLine(pt.position, true)
    const hKey = `h:${Math.min(...hLine.length > 0 ? placed.map(p => p.position.x) : [pt.position.x])},${pt.position.y}`
    if (hLine.length > 1 && !scoredLines.has(hKey)) {
      scoredLines.add(hKey)
      if (!lineValid(hLine)) {
        illegalPositions.add(`${pt.position.x},${pt.position.y}`)
        valid = false
      } else {
        totalScore += lineScore(hLine)
      }
    }
    // vertical line
    const vLine = getLine(pt.position, false)
    const vKey = `v:${pt.position.x},${Math.min(...vLine.length > 0 ? placed.map(p => p.position.y) : [pt.position.y])}`
    if (vLine.length > 1 && !scoredLines.has(vKey)) {
      scoredLines.add(vKey)
      if (!lineValid(vLine)) {
        illegalPositions.add(`${pt.position.x},${pt.position.y}`)
        valid = false
      } else {
        totalScore += lineScore(vLine)
      }
    }
  }

  // If only 1 tile placed with no adjacent tiles, score = 1
  if (placed.length === 1) {
    const hLine = getLine(placed[0].position, true)
    const vLine = getLine(placed[0].position, false)
    if (hLine.length === 1 && vLine.length === 1) totalScore = 1
  }

  return { score: totalScore, valid: valid && illegalPositions.size === 0, illegalPositions }
}

export default function Board({
  placedTiles, pendingPlacements, selectedTile, isMyTurn,
  lastPlayPositions = [],
  onCellClick, onDrop, onUnstage, onPendingClick,
  onValidityChange,
}: BoardProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [worldCenter, setWorldCenter] = useState<{ cx: number; cy: number } | null>(null)
  const isPanning = useRef(false)
  const panStart = useRef({ mouseX: 0, mouseY: 0, cx: 0, cy: 0 })
  const didPan = useRef(false)
  const [grabbing, setGrabbing] = useState(false)

  // Turn-change flash
  const [turnFlash, setTurnFlash] = useState(false)
  const prevIsMyTurn = useRef(isMyTurn)
  useEffect(() => {
    if (!prevIsMyTurn.current && isMyTurn) {
      setTurnFlash(true)
      const t = setTimeout(() => setTurnFlash(false), 800)
      return () => clearTimeout(t)
    }
    prevIsMyTurn.current = isMyTurn
  }, [isMyTurn])

  const allTiles = [...(placedTiles ?? []), ...(pendingPlacements ?? [])]
  const { minX, maxX, minY, maxY } = getBounds(allTiles)
  const cols = maxX - minX + 1
  const rows = maxY - minY + 1
  const gridW = cols * STEP - GAP
  const gridH = rows * STEP - GAP

  // Clamp world center so user can't pan infinitely beyond the grid + a little breathing room
  const SCROLL_PAD = 2 // extra cells of slack beyond the grid edge
  const clampCenter = useCallback((cx: number, cy: number) => ({
    cx: Math.max(minX - SCROLL_PAD, Math.min(maxX + SCROLL_PAD, cx)),
    cy: Math.max(minY - SCROLL_PAD, Math.min(maxY + SCROLL_PAD, cy)),
  }), [minX, maxX, minY, maxY])

  // Live validity + score
  const { score: liveScore, valid: isValid, illegalPositions } = calcPendingScore(pendingPlacements, placedTiles)

  useEffect(() => {
    if (onValidityChange) onValidityChange(isValid, liveScore)
  }, [isValid, liveScore, onValidityChange])

  useLayoutEffect(() => {
    if (worldCenter !== null) return
    setWorldCenter({ cx: 0, cy: 0 })
  }, [worldCenter])

  const getPan = () => {
    const container = containerRef.current
    if (!container || worldCenter === null) return { x: 0, y: 0 }
    const cw = container.clientWidth
    const ch = container.clientHeight
    const { px, py } = cellToPixel(worldCenter.cx, worldCenter.cy, minX, minY)
    return {
      x: cw / 2 - px - CELL_SIZE / 2,
      y: ch / 2 - py - CELL_SIZE / 2,
    }
  }

  const pan = getPan()

  // ---------------------------------------------------------------------------
  // Mouse pan
  // ---------------------------------------------------------------------------
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 && e.button !== 1) return
    if (e.button === 0 && selectedTile !== null) return
    const wc = worldCenter ?? { cx: 0, cy: 0 }
    isPanning.current = true
    didPan.current = false
    panStart.current = { mouseX: e.clientX, mouseY: e.clientY, cx: wc.cx, cy: wc.cy }
    setGrabbing(true)
    e.preventDefault()
  }, [selectedTile, worldCenter])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return
    const dx = e.clientX - panStart.current.mouseX
    const dy = e.clientY - panStart.current.mouseY
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didPan.current = true
    setWorldCenter(clampCenter(
      panStart.current.cx - dx / STEP,
      panStart.current.cy - dy / STEP,
    ))
  }, [])

  const stopPan = useCallback(() => {
    isPanning.current = false
    setGrabbing(false)
  }, [])

  // ---------------------------------------------------------------------------
  // Trackpad / wheel scroll (two-finger pan)
  // ---------------------------------------------------------------------------
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setWorldCenter(prev => {
      const wc = prev ?? { cx: 0, cy: 0 }
      return clampCenter(wc.cx + e.deltaX / STEP, wc.cy + e.deltaY / STEP)
    })
  }, [])

  // ---------------------------------------------------------------------------
  // Touch pan
  // ---------------------------------------------------------------------------
  const touchStart = useRef({ touchX: 0, touchY: 0, cx: 0, cy: 0 })
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return
    const t = e.touches[0]
    const wc = worldCenter ?? { cx: 0, cy: 0 }
    touchStart.current = { touchX: t.clientX, touchY: t.clientY, cx: wc.cx, cy: wc.cy }
  }, [worldCenter])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return
    const t = e.touches[0]
    const dx = t.clientX - touchStart.current.touchX
    const dy = t.clientY - touchStart.current.touchY
    setWorldCenter(clampCenter(
      touchStart.current.cx - dx / STEP,
      touchStart.current.cy - dy / STEP,
    ))
    e.preventDefault()
  }, [])

  // ---------------------------------------------------------------------------
  // Cell click
  // ---------------------------------------------------------------------------
  const handleCellClick = useCallback((pos: Position) => {
    if (didPan.current) return
    onCellClick(pos)
  }, [onCellClick])

  // ---------------------------------------------------------------------------
  // Pending tile drag-off
  // ---------------------------------------------------------------------------
  const handlePendingDragStart = useCallback((pos: Position, e: React.DragEvent) => {
    e.dataTransfer.setData('boardUnstage', JSON.stringify(pos))
    e.dataTransfer.effectAllowed = 'move'
    e.stopPropagation()
  }, [])

  const handlePendingDragEnd = useCallback((pos: Position, e: React.DragEvent) => {
    if (e.dataTransfer.dropEffect !== 'none') {
      onUnstage(pos)
    }
  }, [onUnstage])

  // ---------------------------------------------------------------------------
  // Tilemap
  // ---------------------------------------------------------------------------
  const tileMap = new Map<string, { tile: Tile; pending: boolean }>()
  for (const pt of (placedTiles ?? [])) {
    tileMap.set(`${pt.position.x},${pt.position.y}`, { tile: pt.tile, pending: false })
  }
  for (const pt of (pendingPlacements ?? [])) {
    tileMap.set(`${pt.position.x},${pt.position.y}`, { tile: pt.tile, pending: true })
  }

  const lastPlaySet = new Set(lastPlayPositions.map(p => `${p.x},${p.y}`))

  const handleRecenter = () => setWorldCenter({ cx: 0, cy: 0 })

  const cursor = grabbing ? 'grabbing' : (selectedTile && isMyTurn) ? 'crosshair' : 'grab'

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full rounded-xl border border-slate-700 bg-slate-900 overflow-hidden select-none"
      style={{
        cursor,
        transition: turnFlash ? 'box-shadow 0.1s' : 'box-shadow 0.6s',
        boxShadow: turnFlash ? '0 0 0 3px #f59e0b, 0 0 32px 8px rgba(245,158,11,0.3)' : 'none',
      }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={stopPan}
      onMouseLeave={stopPan}
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
    >
      {/* controls */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={handleRecenter}
          className="text-slate-500 hover:text-slate-300 bg-slate-800/80 hover:bg-slate-700 border border-slate-700 rounded px-2 py-1 text-xs transition-colors"
          title="Re-center board"
        >
          ⊹ center
        </button>
        <span className="text-slate-600 text-xs pointer-events-none">drag or scroll to pan</span>
      </div>

      {/* live score preview */}
      {pendingPlacements.length > 0 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <div className={[
            'px-3 py-1.5 rounded-full text-sm font-bold border shadow-lg',
            isValid
              ? 'bg-green-900/80 border-green-500 text-green-300'
              : 'bg-red-900/80 border-red-500 text-red-300',
          ].join(' ')}>
            {isValid ? `+${liveScore} pts` : '✕ illegal placement'}
          </div>
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          left: pan.x,
          top: pan.y,
          width: gridW,
          height: gridH,
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, ${CELL_SIZE}px)`,
          gridTemplateRows: `repeat(${rows}, ${CELL_SIZE}px)`,
          gap: `${GAP}px`,
        }}
      >
        {Array.from({ length: rows }, (_, row) =>
          Array.from({ length: cols }, (_, col) => {
            const x = minX + col
            const y = minY + row
            const key = `${x},${y}`
            const entry = tileMap.get(key)
            const canDrop = !entry && selectedTile !== null && isMyTurn
            const isLastPlay = lastPlaySet.has(key) && entry && !entry.pending
            const isIllegal = illegalPositions.has(key)

            return (
              <div
                key={key}
                style={{ width: CELL_SIZE, height: CELL_SIZE }}
                className={[
                  'flex items-center justify-center rounded-md transition-colors',
                  entry
                    ? entry.pending
                      ? isIllegal
                        ? 'ring-2 ring-red-500 bg-red-900/20 cursor-pointer'
                        : 'cursor-pointer'
                      : isLastPlay
                        ? 'ring-2 ring-amber-400/70'
                        : ''
                    : canDrop
                      ? 'bg-amber-900/20 border border-dashed border-amber-600/50 hover:bg-amber-900/40 hover:border-amber-400 cursor-pointer'
                      : 'bg-slate-800',
                ].join(' ')}
                onMouseDown={entry ? (e) => e.stopPropagation() : undefined}
                onClick={(e) => {
                  e.stopPropagation()
                  if (entry?.pending) { onPendingClick({ x, y }); return }
                  if (!entry) handleCellClick({ x, y })
                }}
                onDragOver={e => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = (!entry || entry.pending) ? 'move' : 'none'
                }}
                onDrop={e => { e.preventDefault(); if (!entry) onDrop({ x, y }) }}
              >
                {entry && (
                  <div
                    draggable={entry.pending}
                    onDragStart={entry.pending ? (e) => handlePendingDragStart({ x, y }, e) : undefined}
                    onDragEnd={entry.pending ? (e) => handlePendingDragEnd({ x, y }, e) : undefined}
                    title={entry.pending ? 'Click or drag to remove' : undefined}
                    style={!entry.pending ? { pointerEvents: 'none' } : undefined}
                  >
                    <TileComponent
                      tile={entry.tile}
                      size="md"
                      pending={entry.pending}
                      disabled={!entry.pending}
                    />
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
