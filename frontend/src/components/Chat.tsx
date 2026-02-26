import { useState, useRef, useEffect, useMemo } from 'react'
import type { ChatMessage } from '../types'
import { GIF_MESSAGE_PREFIX } from '../assets/catAssets'

// Tenor v1 API — LIVDSRZULELA is Tenor's official public demo key, works without signup.
// For production set VITE_TENOR_KEY in your .env (free key at tenor.com/developer).
const TENOR_KEY: string = import.meta.env.VITE_TENOR_KEY || 'LIVDSRZULELA'
const GIF_LIMIT = 24

interface GifResult {
  id: string
  gifUrl: string
  previewUrl: string
}

async function searchGifs(query: string): Promise<GifResult[]> {
  try {
    const base = 'https://api.tenor.com/v1'
    const params = new URLSearchParams({
      key: TENOR_KEY,
      limit: String(GIF_LIMIT),
      media_filter: 'minimal',
      contentfilter: 'medium',
    })
    if (query.trim()) params.set('q', query.trim())
    const endpoint = query.trim()
      ? `${base}/search?${params}`
      : `${base}/trending?${params}`
    const res = await fetch(endpoint)
    if (!res.ok) throw new Error(`Tenor ${res.status}`)
    const json = await res.json()
    return (json.results ?? []).map((g: any) => {
      // v1 media is an array of objects; find the gif and tinyGif formats
      const formats: Record<string, any> = {}
      for (const mediaObj of (g.media ?? [])) {
        Object.assign(formats, mediaObj)
      }
      const gifUrl = formats.gif?.url ?? formats.mediumgif?.url ?? ''
      const previewUrl = formats.tinygif?.url ?? formats.nanogif?.url ?? gifUrl
      return { id: g.id, gifUrl, previewUrl }
    }).filter((g: GifResult) => g.gifUrl)
  } catch (err) {
    console.warn('Tenor fetch failed:', err)
    return []
  }
}

interface ChatProps {
  messages: ChatMessage[]
  myPlayerId: string
  myAvatarUrl?: string
  avatarMap?: Record<string, string>
  onSend: (text: string) => void
  disabled?: boolean
}

function isGifMessage(text: string) { return text.startsWith(GIF_MESSAGE_PREFIX) }
function getGifUrl(text: string) { return text.slice(GIF_MESSAGE_PREFIX.length) }

export default function Chat({ messages, myPlayerId, myAvatarUrl, avatarMap = {}, onSend, disabled }: ChatProps) {
  const [draft, setDraft] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [gifs, setGifs] = useState<GifResult[]>([])
  const [gifLoading, setGifLoading] = useState(false)
  const [gifError, setGifError] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Dedup by computing a stable set OUTSIDE render using useMemo.
  // Never mutate refs during render — that causes StrictMode to produce empty lists.
  const dedupedMessages = useMemo(() => {
    const seen = new Set<string>()
    return messages.filter(m => {
      const k = `${m.player_id}|${m.sent_at}|${m.text}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  }, [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [dedupedMessages.length])

  // Close picker on outside click
  useEffect(() => {
    if (!pickerOpen) return
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [pickerOpen])

  // Load trending GIFs when picker opens
  useEffect(() => {
    if (!pickerOpen) return
    if (gifs.length > 0) return  // already loaded
    setGifLoading(true)
    setGifError(false)
    searchGifs('').then(results => {
      setGifs(results)
      setGifLoading(false)
      if (results.length === 0) setGifError(true)
    })
  }, [pickerOpen])

  const runSearch = (q: string) => {
    setGifLoading(true)
    setGifError(false)
    searchGifs(q).then(results => {
      setGifs(results)
      setGifLoading(false)
      if (results.length === 0) setGifError(true)
    })
  }

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value
    setSearch(q)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => runSearch(q), 350)
  }

  const handleSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (searchTimer.current) clearTimeout(searchTimer.current)
      runSearch(search)
    }
  }

  const handleSend = () => {
    const text = draft.trim()
    if (!text) return
    onSend(text)
    setDraft('')
  }

  const handleSendGif = (gifUrl: string) => {
    onSend(GIF_MESSAGE_PREFIX + gifUrl)
    setPickerOpen(false)
    setSearch('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <p className="text-xs uppercase tracking-widest text-slate-400 font-semibold mb-2 shrink-0">Chat</p>

      {/* message list */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1 min-h-0">
        {dedupedMessages.length === 0 && (
          <p className="text-slate-600 italic text-xs text-center mt-4">No messages yet 🐱</p>
        )}
        {dedupedMessages.map((msg, i) => {
          const isMe = msg.player_id === myPlayerId
          const isSystem = msg.player_id === 'system'
          const gif = isGifMessage(msg.text)

          if (isSystem) {
            return (
              <div key={i} className="text-center">
                <span className="text-slate-500 text-xs italic">{msg.text}</span>
              </div>
            )
          }

          return (
            <div key={i} className={`flex items-end gap-1.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
              {isMe && myAvatarUrl ? (
                <img src={myAvatarUrl} alt="you" className="w-6 h-6 rounded-full object-cover shrink-0 mb-0.5" />
              ) : avatarMap[msg.player_id] ? (
                <img src={avatarMap[msg.player_id]} alt={msg.player_name} className="w-6 h-6 rounded-full object-cover shrink-0 mb-0.5" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs shrink-0 mb-0.5">🐱</div>
              )}
              <div className={`flex flex-col gap-0.5 max-w-[78%] ${isMe ? 'items-end' : 'items-start'}`}>
                {!isMe && <span className="text-xs text-slate-500 px-1">{msg.player_name}</span>}
                {gif ? (
                  <img
                    src={getGifUrl(msg.text)}
                    alt="gif"
                    className={['rounded-lg max-w-full', isMe ? 'rounded-tr-sm' : 'rounded-tl-sm'].join(' ')}
                    style={{ maxHeight: 140 }}
                  />
                ) : (
                  <div className={[
                    'rounded-lg px-3 py-1.5 text-sm break-words',
                    isMe ? 'bg-amber-500 text-black font-medium rounded-tr-sm' : 'bg-slate-700 text-slate-200 rounded-tl-sm',
                  ].join(' ')}>
                    {msg.text}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* GIF picker */}
      {pickerOpen && (
        <div
          ref={pickerRef}
          className="mb-2 bg-slate-900 border border-slate-600 rounded-xl shadow-2xl flex flex-col overflow-hidden"
          style={{ maxHeight: 300 }}
        >
          <div className="p-2 border-b border-slate-700 shrink-0">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={handleSearchChange}
              onKeyDown={handleSearchKey}
              placeholder="Search GIFs..."
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex-1 overflow-y-auto p-2 min-h-0">
            {gifLoading && (
              <div className="flex items-center justify-center h-24 text-slate-500 text-xs">Loading...</div>
            )}
            {!gifLoading && gifError && (
              <div className="flex flex-col items-center justify-center h-24 gap-2">
                <p className="text-slate-500 text-xs text-center">Couldn't load GIFs.<br/>Check your network or add a Giphy API key.</p>
                <button
                  onClick={() => { setGifError(false); runSearch(search) }}
                  className="text-xs text-amber-400 hover:text-amber-300 underline"
                >
                  Retry
                </button>
              </div>
            )}
            {!gifLoading && !gifError && gifs.length === 0 && (
              <div className="flex items-center justify-center h-24 text-slate-500 text-xs">No results</div>
            )}
            {!gifLoading && !gifError && gifs.length > 0 && (
              <div className="grid grid-cols-4 gap-1">
                {gifs.map(g => (
                  <button
                    key={g.id}
                    onClick={() => handleSendGif(g.gifUrl)}
                    className="rounded-md overflow-hidden aspect-square hover:ring-2 hover:ring-amber-400 transition-all bg-slate-800"
                  >
                    <img
                      src={g.previewUrl}
                      alt="gif"
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="px-2 py-1 border-t border-slate-700 shrink-0 flex justify-end">
            <span className="text-[10px] text-slate-500">Powered by <span className="text-slate-400 font-bold">Tenor</span></span>
          </div>
        </div>
      )}

      {/* input row */}
      <div className="flex gap-1.5 mt-2 shrink-0">
        <button
          onClick={() => setPickerOpen(o => !o)}
          disabled={disabled}
          title="Send a GIF"
          className={[
            'px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors',
            pickerOpen
              ? 'bg-amber-500/20 border-amber-500 text-amber-400'
              : 'bg-slate-800 border-slate-600 text-slate-400 hover:text-white hover:border-slate-500',
            disabled ? 'opacity-40 cursor-not-allowed' : '',
          ].join(' ')}
        >
          GIF
        </button>
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Say something..."
          className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500 disabled:opacity-40 min-w-0"
        />
        <button
          onClick={handleSend}
          disabled={disabled || !draft.trim()}
          className="px-3 py-1.5 bg-amber-500 text-black font-semibold text-sm rounded-lg hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          Send
        </button>
      </div>
    </div>
  )
}
