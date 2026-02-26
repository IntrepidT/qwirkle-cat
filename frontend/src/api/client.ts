import axios from 'axios'
import type {
  CreateGameResponse,
  GameView,
  GameResults,
  LobbyEntry,
  PlacedTile,
  PlaceTilesResponse,
  Tile,
} from './types'

const api = axios.create({ baseURL: '/api' })

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------

export const createGame = (playerName: string) =>
  api.post<CreateGameResponse>('/games', { player_name: playerName })

export const listGames = () =>
  api.get<LobbyEntry[]>('/games')

export const joinGame = (gameId: string, playerName: string) =>
  api.post<CreateGameResponse>(`/games/${gameId}/join`, { player_name: playerName })

export const startGame = (gameId: string) =>
  api.post<{ status: string }>(`/games/${gameId}/start`)

// ---------------------------------------------------------------------------
// Gameplay
// ---------------------------------------------------------------------------

export const getGame = (gameId: string, playerId: string) =>
  api.get<GameView>(`/games/${gameId}`, { params: { player_id: playerId } })

export const placeTiles = (gameId: string, playerId: string, tiles: PlacedTile[]) =>
  api.post<PlaceTilesResponse>(`/games/${gameId}/place`, { player_id: playerId, tiles })

export const exchangeTiles = (gameId: string, playerId: string, tiles: Tile[]) =>
  api.post<GameView>(`/games/${gameId}/exchange`, { player_id: playerId, tiles })

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export const getResults = (gameId: string) =>
  api.get<GameResults>(`/games/${gameId}/results`)
