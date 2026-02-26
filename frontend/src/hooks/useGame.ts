import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getGame, placeTiles as apiPlaceTiles, exchangeTiles as apiExchangeTiles, startGame as apiStartGame } from '../api/client'
import type { GameView, PlacedTile, Tile } from '../types'

export function useGame(gameId: string, playerId: string) {
  const queryClient = useQueryClient()

  const { data: game } = useQuery<GameView>({
    queryKey: ['game', gameId, playerId],
    queryFn: () => getGame(gameId, playerId).then(r => r.data),
    refetchInterval: 2000,   // poll every 2s as WebSocket fallback
    enabled: !!gameId && !!playerId,
  })

  const refresh = (data: GameView) => {
    queryClient.setQueryData(['game', gameId, playerId], data)
  }

  const { mutate: placeTiles, isPending: isPlacing } = useMutation({
    mutationFn: (placements: PlacedTile[]) =>
      apiPlaceTiles(gameId, playerId, placements).then(r => r.data),
    onSuccess: (data) => {
      if (data.game) refresh(data.game)
      else queryClient.invalidateQueries({ queryKey: ['game', gameId, playerId] })
    },
  })

  const { mutate: exchangeTiles, isPending: isExchanging } = useMutation({
    mutationFn: (tiles: Tile[]) =>
      apiExchangeTiles(gameId, playerId, tiles).then(r => r.data),
    onSuccess: (data) => {
      refresh(data)
    },
  })

  const { mutate: startGame } = useMutation({
    mutationFn: () => apiStartGame(gameId).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['game', gameId, playerId] })
    },
  })

  return {
    game,
    refresh,
    placeTiles,
    isPlacing,
    exchangeTiles,
    isExchanging,
    startGame,
  }
}
