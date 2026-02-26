import { useState } from 'react'
import type { Tile } from '../types'
import TileComponent from './Tile'

interface HandProps {
  tiles: Tile[]
  selectedIndices: number[]
  stagedIndices?: number[]
  onToggle: (index: number) => void
  onDragStart: (index: number, e: React.DragEvent) => void
  onReorder: (newTiles: Tile[]) => void
}

export default function Hand({
  tiles,
  selectedIndices = [],
  stagedIndices = [],
  onToggle,
  onDragStart,
  onReorder,
}: HandProps) {
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [internalDragIndex, setInternalDragIndex] = useState<number | null>(null)

  const safeTiles = tiles ?? []

  const handleInternalDragStart = (i: number, e: React.DragEvent) => {
    if (stagedIndices.includes(i)) return
    setInternalDragIndex(i)
    e.dataTransfer.setData('handReorder', String(i))
    e.dataTransfer.effectAllowed = 'move'
    // also notify parent for board drops
    onDragStart(i, e)
  }

  const handleDragOver = (i: number, e: React.DragEvent) => {
    const types = e.dataTransfer.types
    if (types.includes('handreorder') || types.includes('boardunstage')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (types.includes('handreorder')) setDragOverIndex(i)
    }
  }

  const handleDrop = (targetIndex: number, e: React.DragEvent) => {
    e.stopPropagation()
    // Board tile being dragged back to hand — just accept the drop so dropEffect !== 'none'
    if (e.dataTransfer.types.includes('boardunstage')) {
      setDragOverIndex(null)
      return
    }
    const fromStr = e.dataTransfer.getData('handReorder')
    if (!fromStr) return
    const fromIndex = parseInt(fromStr)
    if (isNaN(fromIndex) || fromIndex === targetIndex) {
      setDragOverIndex(null)
      setInternalDragIndex(null)
      return
    }
    const next = [...safeTiles]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(targetIndex, 0, moved)
    onReorder(next)
    setDragOverIndex(null)
    setInternalDragIndex(null)
  }

  const handleDragEnd = () => {
    setDragOverIndex(null)
    setInternalDragIndex(null)
  }

  return (
    <div
      className="flex flex-col items-center gap-2"
      onDragOver={(e) => { if (e.dataTransfer.types.includes('boardunstage')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } }}
      onDrop={(e) => { if (e.dataTransfer.types.includes('boardunstage')) { e.preventDefault(); e.stopPropagation() } }}
    >
      <p className="text-xs uppercase tracking-widest text-slate-400 font-semibold">Your Hand</p>
      <div className="flex gap-2 flex-wrap justify-center">
        {safeTiles.map((tile, i) => {
          const isStaged = stagedIndices.includes(i)
          const isSelected = selectedIndices.includes(i)
          const isBeingDragged = internalDragIndex === i
          const isDropTarget = dragOverIndex === i && !isBeingDragged

          return (
            <div
              key={i}
              onDragOver={(e) => handleDragOver(i, e)}
              onDrop={(e) => handleDrop(i, e)}
              className={[
                'transition-transform duration-100',
                isDropTarget ? 'scale-110 -translate-y-2' : '',
                isStaged ? 'opacity-0 pointer-events-none w-14 h-14' : '',
              ].join(' ')}
            >
              {!isStaged && (
                <TileComponent
                  tile={tile}
                  size="lg"
                  selected={isSelected}
                  onClick={() => onToggle(i)}
                  draggable={true}
                  onDragStart={(e) => handleInternalDragStart(i, e)}
                  onDragEnd={handleDragEnd}
                />
              )}
            </div>
          )
        })}
        {safeTiles.length === 0 && (
          <p className="text-slate-500 italic text-sm">No tiles</p>
        )}
      </div>
      {safeTiles.length > 1 && (
        <p className="text-slate-600 text-xs">Drag tiles to rearrange</p>
      )}
    </div>
  )
}
