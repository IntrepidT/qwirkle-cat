import { useRef, useState, useCallback, useLayoutEffect } from 'react'
import type { PlacedTile, Position, Tile } from '../types'
import TileComponent from './Tile'

interface BoardProps {
  placedTiles: PlacedTile[]
  pendingPlacements: PlacedTile[]
  selectedTile: Tile | null
  onCellClick: (pos: Position) => void
  onDrop: (pos: Position) => void
  onUnstage: (pos: Position) => void
  onPendingClick: (pos: Position) => void
}

const CELL_SIZE = 56
const GAP = 4
const STEP = CELL_SIZE + GAP
const PAD = 3 // empty cells of breathing room around content

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

// Convert a board cell coordinate to pixel offset from grid top-left
function cellToPixel(boardX: number, boardY: number, minX: number, minY: number) {
  return {
    px: (boardX - minX) * STEP,
    py: (boardY - minY) * STEP,
  }
}

export default function Board({ placedTiles, pendingPlacements, selectedTile, onCellClick, onDrop, onUnstage, onPendingClick }: BoardProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Pan stored as the board-coordinate (in cells) at the center of the viewport.
  // Using world-space means grid resizes don't shift the visual camera.
  const [worldCenter, setWorldCenter] = useState<{ cx: number; cy: number } | null>(null)

  const isPanning = useRef(false)
  const panStart = useRef({ mouseX: 0, mouseY: 0, cx: 0, cy: 0 })
  const didPan = useRef(false)
  const [grabbing, setGrabbing] = useState(false)

  const allTiles = [...(placedTiles ?? []), ...(pendingPlacements ?? [])]
  const { minX, maxX, minY, maxY } = getBounds(allTiles)

  const cols = maxX - minX + 1
  const rows = maxY - minY + 1
  const gridW = cols * STEP - GAP
  const gridH = rows * STEP - GAP

  // On first render, center the world on (0,0) board coordinate
  useLayoutEffect(() => {
    if (worldCenter !== null) return
    setWorldCenter({ cx: 0, cy: 0 })
  }, [worldCenter])

  // Derive pixel pan from world center
  const getPan = () => {
    const container = containerRef.current
    if (!container || worldCenter === null) return { x: 0, y: 0 }
    const cw = container.clientWidth
    const ch = container.clientHeight
    // Where in the grid (pixels) does worldCenter land?
    const { px, py } = cellToPixel(worldCenter.cx, worldCenter.cy, minX, minY)
    // We want that point to be at the center of the container
    return {
      x: cw / 2 - px - CELL_SIZE / 2,
      y: ch / 2 - py - CELL_SIZE / 2,
    }
  }

  const pan = getPan()

  // ---------------------------------------------------------------------------
  // Mouse pan — only fires on the background, not on tiles
  // ---------------------------------------------------------------------------
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 && e.button !== 1) return
    // If a tile is selected, left-click places it (cell onClick handles it)
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
    // Convert pixel delta back to world-coordinate delta
    setWorldCenter({
      cx: panStart.current.cx - dx / STEP,
      cy: panStart.current.cy - dy / STEP,
    })
  }, [])

  const stopPan = useCallback(() => {
    isPanning.current = false
    setGrabbing(false)
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
    setWorldCenter({
      cx: touchStart.current.cx - dx / STEP,
      cy: touchStart.current.cy - dy / STEP,
    })
    e.preventDefault()
  }, [])

  // ---------------------------------------------------------------------------
  // Cell click — suppress if we just panned
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

  // The hand / GamePage needs to accept this drag. We expose it via onDrop on
  // the container itself — but actually the hand is outside this component.
  // Instead we fire onUnstage on dragEnd if the drop target was the hand.
  // Simpler: listen for drop on the board container itself with 'boardUnstage'
  // data absent, and let GamePage's hand accept the drop separately.
  // Actually the cleanest approach: fire onUnstage immediately on dragStart
  // and let the piece appear back in the hand. If the user drops somewhere other
  // than the hand they lose the tile — bad. Better: fire on dragEnd only when
  // the drag was successful (dropEffect !== 'none').
  const handlePendingDragEnd = useCallback((pos: Position, e: React.DragEvent) => {
    // dropEffect is 'none' when dropped outside any valid target
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

  const handleRecenter = () => {
    setWorldCenter({ cx: 0, cy: 0 })
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const cursor = grabbing ? 'grabbing' : selectedTile ? 'crosshair' : 'grab'

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full rounded-xl border border-slate-700 bg-slate-900 overflow-hidden select-none"
      style={{ cursor }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={stopPan}
      onMouseLeave={stopPan}
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
        <span className="text-slate-600 text-xs pointer-events-none">drag to pan</span>
      </div>

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
            const canDrop = !entry && selectedTile !== null

            return (
              <div
                key={key}
                style={{ width: CELL_SIZE, height: CELL_SIZE }}
                className={[
                  'flex items-center justify-center rounded-md transition-colors',
                  entry
                    ? entry.pending ? 'cursor-pointer' : ''
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
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                onDrop={e => { e.preventDefault(); if (!entry) onDrop({ x, y }) }}
              >
                {entry && (
                  <div
                    draggable={entry.pending}
                    onDragStart={entry.pending ? (e) => handlePendingDragStart({ x, y }, e) : undefined}
                    onDragEnd={entry.pending ? (e) => handlePendingDragEnd({ x, y }, e) : undefined}
                    title={entry.pending ? 'Click or drag to remove' : undefined}
                  >
                    <TileComponent
                      tile={entry.tile}
                      size="md"
                      pending={entry.pending}
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
