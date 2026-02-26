import { useState } from 'react'
import { createGame } from '../api/client'
import { CAT_AVATARS } from '../assets/catAssets'

interface LobbyPageProps {
  onEnterGame: (gameId: string, playerId: string, playerName: string, avatarUrl: string) => void
}

// Single endpoint handles both new joins and reconnects by name-matching
async function joinOrRejoinByName(catName: string, playerName: string) {
  const res = await fetch(
    `/api/games/by-name/${encodeURIComponent(catName.trim().toLowerCase())}/join`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_name: playerName }),
    }
  )
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? 'Failed to join game')
  return body as { game_id: string; game_name: string; player_id: string; rejoined: boolean }
}

type Step = 'name' | 'avatar' | 'join'

export default function LobbyPage({ onEnterGame }: LobbyPageProps) {
  const [step, setStep] = useState<Step>('name')
  const [playerName, setPlayerName] = useState('')
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null)
  const [catName, setCatName] = useState('')
  const [action, setAction] = useState<'create' | 'join'>('create')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleNameNext = (nextAction: 'create' | 'join') => {
    if (!playerName.trim()) return
    setAction(nextAction)
    setStep('avatar')
  }

  const handleAvatarNext = () => {
    if (!selectedAvatar) return
    if (action === 'join') {
      setStep('join')
    } else {
      handleCreate()
    }
  }

  const handleCreate = async () => {
    if (!playerName.trim() || !selectedAvatar) return
    setLoading(true); setError(null)
    try {
      const res = await createGame(playerName.trim())
      onEnterGame(res.data.game_id, res.data.player_id, playerName.trim(), selectedAvatar)
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'Failed to create game')
      setStep('avatar')
    } finally { setLoading(false) }
  }

  const handleJoin = async () => {
    if (!playerName.trim() || !catName.trim() || !selectedAvatar) return
    setLoading(true); setError(null)
    try {
      const data = await joinOrRejoinByName(catName, playerName.trim())
      onEnterGame(data.game_id, data.player_id, playerName.trim(), selectedAvatar)
    } catch (e: any) {
      setError(e.message ?? 'Failed to join game')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md flex flex-col gap-6">

        <div className="text-center">
          <div className="text-5xl mb-2">🐱</div>
          <h1 className="text-5xl font-black tracking-tight text-white mb-1">QWIRKLE</h1>
          <p className="text-slate-400 text-sm">Match colors. Match shapes. Score big.</p>
        </div>

        {/* Step 1 — enter name + choose action */}
        {step === 'name' && (
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 flex flex-col gap-4">
            <div>
              <label className="text-xs uppercase tracking-widest text-slate-400 font-semibold block mb-1">Your Name</label>
              <input
                type="text"
                value={playerName}
                autoFocus
                onChange={e => setPlayerName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleNameNext('create')}
                placeholder="Enter your name"
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
            <button
              onClick={() => handleNameNext('create')}
              disabled={!playerName.trim()}
              className="w-full py-3 bg-amber-500 text-black font-bold text-sm rounded-lg hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              🐾 Create New Game
            </button>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-700" />
              <span className="text-slate-500 text-xs">or</span>
              <div className="flex-1 h-px bg-slate-700" />
            </div>
            <button
              onClick={() => handleNameNext('join')}
              disabled={!playerName.trim()}
              className="w-full py-3 bg-slate-700 text-white font-semibold text-sm rounded-lg hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Join a Game
            </button>
          </div>
        )}

        {/* Step 2 — pick your cat avatar */}
        {step === 'avatar' && (
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 flex flex-col gap-4">
            <div className="text-center">
              <p className="text-white font-bold text-lg mb-0.5">Choose your cat, {playerName}!</p>
              <p className="text-slate-400 text-xs">This will be your avatar for the game</p>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {CAT_AVATARS.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedAvatar(cat.url)}
                  className={[
                    'relative rounded-xl overflow-hidden aspect-square border-2 transition-all',
                    selectedAvatar === cat.url
                      ? 'border-amber-400 scale-105 shadow-lg shadow-amber-400/30'
                      : 'border-slate-700 hover:border-slate-500',
                  ].join(' ')}
                >
                  <img
                    src={cat.url}
                    alt={cat.label}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {selectedAvatar === cat.url && (
                    <div className="absolute inset-0 bg-amber-400/20 flex items-end justify-center pb-1">
                      <span className="text-[10px] text-amber-300 font-bold bg-black/50 px-1 rounded">{cat.label}</span>
                    </div>
                  )}
                </button>
              ))}
            </div>

            {error && <p className="text-red-400 text-sm text-center">{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={() => { setStep('name'); setError(null) }}
                className="px-4 py-2 bg-slate-800 text-slate-400 text-sm rounded-lg hover:bg-slate-700 transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={handleAvatarNext}
                disabled={!selectedAvatar || loading}
                className="flex-1 py-2 bg-amber-500 text-black font-bold text-sm rounded-lg hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Loading...' : action === 'create' ? '🐾 Create Game' : 'Next →'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — join by cat name (only for join flow) */}
        {step === 'join' && (
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 flex flex-col gap-4">
            {/* avatar preview */}
            {selectedAvatar && (
              <div className="flex items-center gap-3">
                <img src={selectedAvatar} alt="your cat" className="w-12 h-12 rounded-full border-2 border-amber-400 object-cover" />
                <div>
                  <p className="text-white font-semibold text-sm">{playerName}</p>
                  <p className="text-slate-400 text-xs">ready to join</p>
                </div>
              </div>
            )}

            <div>
              <label className="text-xs uppercase tracking-widest text-slate-400 font-semibold block mb-1">🐾 Cat Game Name</label>
              <input
                type="text"
                value={catName}
                autoFocus
                onChange={e => setCatName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                placeholder="e.g. fluffy-whiskers-cat"
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500 font-mono text-sm"
              />
              <p className="text-slate-600 text-xs mt-1">
                Ask the host for their game's cat name. If you were already in the game, use your exact original name to reconnect automatically.
              </p>
            </div>

            {error && <p className="text-red-400 text-sm text-center">{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={() => { setStep('avatar'); setError(null) }}
                className="px-4 py-2 bg-slate-800 text-slate-400 text-sm rounded-lg hover:bg-slate-700 transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={handleJoin}
                disabled={loading || !catName.trim()}
                className="flex-1 py-2 bg-amber-500 text-black font-bold text-sm rounded-lg hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Joining...' : '🐱 Join Game'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
