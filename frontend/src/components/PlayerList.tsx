import type { PlayerView } from '../types/types'

interface PlayerListProps {
  players: PlayerView[]
  currentTurn: number
  myPlayerId: string
  avatarMap?: Record<string, string>
}

export default function PlayerList({ players, currentTurn, myPlayerId, avatarMap = {} }: PlayerListProps) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs uppercase tracking-widest text-slate-400 font-semibold mb-1">Players</p>
      {players.map((p, i) => {
        const isMe = String(p.id) === String(myPlayerId)
        const isTurn = i === currentTurn
        const avatar = avatarMap[String(p.id)]

        return (
          <div
            key={p.id}
            className={[
              'flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors',
              isTurn ? 'bg-amber-500/10 border border-amber-500/30' : 'border border-transparent',
            ].join(' ')}
          >
            {/* avatar */}
            {avatar ? (
              <img
                src={avatar}
                alt={p.name}
                className={[
                  'w-8 h-8 rounded-full object-cover shrink-0',
                  isTurn ? 'ring-2 ring-amber-400' : 'ring-1 ring-slate-600',
                ].join(' ')}
              />
            ) : (
              <div className={[
                'w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-sm shrink-0',
                isTurn ? 'ring-2 ring-amber-400' : 'ring-1 ring-slate-600',
              ].join(' ')}>
                {'\u{1F431}\uFE0F'}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 min-w-0">
                <span className={[
                  'text-sm font-medium truncate',
                  isMe ? 'text-amber-300' : 'text-white',
                ].join(' ')}>
                  {p.name}{isMe ? ' (you)' : ''}
                </span>
                {isTurn && <span className="text-amber-400 text-xs shrink-0">◀</span>}
              </div>
              <span className="text-xs text-slate-400 font-mono">{p.score} pts</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
