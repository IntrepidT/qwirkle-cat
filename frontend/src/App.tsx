import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import LobbyPage from './pages/LobbyPage'
import GamePage from './pages/GamePage'

const queryClient = new QueryClient()

interface GameSession {
  gameId: string
  playerId: string
  playerName: string
  avatarUrl: string
}

function AppInner() {
  const [session, setSession] = useState<GameSession | null>(null)

  if (!session) {
    return (
      <LobbyPage
        onEnterGame={(gameId, playerId, playerName, avatarUrl) =>
          setSession({ gameId, playerId, playerName, avatarUrl })
        }
      />
    )
  }

  return (
    <GamePage
      gameId={session.gameId}
      playerId={session.playerId}
      playerName={session.playerName}
      avatarUrl={session.avatarUrl}
      onBackToLobby={() => setSession(null)}
    />
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  )
}
