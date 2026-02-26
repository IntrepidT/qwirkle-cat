import type { GameResults } from '../types'

interface GameOverProps {
  results: GameResults
  myPlayerId: string
  onBackToLobby: () => void
}

export default function GameOver({ results, myPlayerId, onBackToLobby }: GameOverProps) {
  const isWinner = results.winner.id === myPlayerId

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="mb-6">
          <p className="text-6xl mb-3">{isWinner ? '🏆' : '🎮'}</p>
          <h2 className="text-3xl font-black text-white">
            {isWinner ? 'You Won!' : `${results.winner.name} Won!`}
          </h2>
        </div>

        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 mb-6 flex flex-col gap-2">
          {results.results.map((p, i) => (
            <div
              key={p.id}
              className={[
                'flex items-center justify-between rounded-lg px-4 py-2',
                i === 0 ? 'bg-amber-500/20 border border-amber-500/40' : 'bg-slate-800',
              ].join(' ')}
            >
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-sm w-4">{i + 1}.</span>
                <span className={p.id === myPlayerId ? 'text-white font-bold' : 'text-slate-300'}>
                  {p.name}{p.id === myPlayerId ? ' (you)' : ''}
                </span>
              </div>
              <span className="font-mono font-bold text-white">{p.score}</span>
            </div>
          ))}
        </div>

        <button
          onClick={onBackToLobby}
          className="w-full py-3 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition-colors"
        >
          Back to Lobby
        </button>
      </div>
    </div>
  )
}
