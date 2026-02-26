import type { Tile, Color, Shape } from '../types'

const COLOR_CLASSES: Record<Color, string> = {
  red:    'bg-red-500 border-red-700',
  orange: 'bg-orange-400 border-orange-600',
  yellow: 'bg-yellow-300 border-yellow-500',
  green:  'bg-green-500 border-green-700',
  blue:   'bg-blue-500 border-blue-700',
  purple: 'bg-purple-500 border-purple-700',
}

function ShapeIcon({ shape }: { shape: Shape }) {
  switch (shape) {
    case 'circle':   return <circle cx="50" cy="50" r="35" />
    case 'diamond':  return <polygon points="50,10 90,50 50,90 10,50" />
    case 'square':   return <rect x="15" y="15" width="70" height="70" />
    case 'clover':
      return <g>
        <circle cx="50" cy="25" r="18" /><circle cx="75" cy="50" r="18" />
        <circle cx="50" cy="75" r="18" /><circle cx="25" cy="50" r="18" />
        <rect x="35" y="35" width="30" height="30" />
      </g>
    case 'star4':
      return <polygon points="50,5 61,35 95,35 68,57 79,91 50,70 21,91 32,57 5,35 39,35" />
    case 'star8':
      return <g transform="translate(50,50)">
        <polygon points="0,-38 9,-9 38,0 9,9 0,38 -9,9 -38,0 -9,-9" />
        <polygon points="0,-38 9,-9 38,0 9,9 0,38 -9,9 -38,0 -9,-9" transform="rotate(45)" />
      </g>
    default: return <circle cx="50" cy="50" r="35" />
  }
}

interface TileProps {
  tile: Tile
  size?: 'sm' | 'md' | 'lg'
  selected?: boolean
  ghost?: boolean
  pending?: boolean
  onClick?: () => void
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: () => void
}

const SIZE_MAP = { sm: 'w-8 h-8', md: 'w-12 h-12', lg: 'w-14 h-14' }

// Inject keyframes once
const ANIM_STYLE = `
@keyframes tile-pop {
  0%   { transform: scale(0.5); opacity: 0; }
  70%  { transform: scale(1.15); }
  100% { transform: scale(1.05); opacity: 1; }
}
.tile-pop { animation: tile-pop 180ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
`

export default function TileComponent({ tile, size = 'md', selected, ghost, pending, onClick, draggable, onDragStart, onDragEnd }: TileProps) {
  const colorClass = COLOR_CLASSES[tile.color] ?? 'bg-gray-500 border-gray-700'

  return (
    <>
      {pending && <style>{ANIM_STYLE}</style>}
      <div
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onClick={onClick}
        onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick() } : undefined}
        className={[
          SIZE_MAP[size],
          'rounded-md border-2 flex items-center justify-center transition-all duration-150 select-none',
          colorClass,
          selected ? 'ring-4 ring-white ring-offset-2 ring-offset-slate-950 scale-110 shadow-lg' : '',
          pending ? 'tile-pop ring-4 ring-amber-400 ring-offset-1 ring-offset-slate-900 shadow-amber-400/40 shadow-lg' : '',
          ghost ? 'opacity-30' : '',
          onClick ? 'cursor-pointer hover:scale-105 active:scale-95' : '',
          draggable && !ghost ? 'cursor-grab active:cursor-grabbing' : '',
        ].filter(Boolean).join(' ')}
      >
        <svg viewBox="0 0 100 100" className="w-3/4 h-3/4 fill-white drop-shadow">
          <ShapeIcon shape={tile.shape} />
        </svg>
      </div>
    </>
  )
}
