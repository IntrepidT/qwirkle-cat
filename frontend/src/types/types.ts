// ---------------------------------------------------------------------------
// Tile primitives
// ---------------------------------------------------------------------------

export type Color = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple'
export type Shape = 'circle' | 'clover' | 'diamond' | 'square' | 'star4' | 'star8'

export interface Tile {
  color: Color
  shape: Shape
}

export interface Position {
  x: number
  y: number
}

export interface PlacedTile {
  tile: Tile
  position: Position
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

export type PlayerStatus = 'active' | 'inactive' | 'disconnected'

export interface PlayerView {
  id: string
  name: string
  hand_count: number
  score: number
  status: PlayerStatus
}

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------

export type GameStatus = 'waiting' | 'active' | 'finished'

export interface GameView {
  id: string
  status: GameStatus
  players: PlayerView[]
  board: PlacedTile[]
  bag_count: number
  current_turn: number
  turn_number: number
  your_hand: Tile[]
  final_hands?: Record<string, Tile[]>
}

// ---------------------------------------------------------------------------
// WebSocket messages
// ---------------------------------------------------------------------------

export type MessageType = 'game_state' | 'chat'

export interface WsMessage<T = unknown> {
  type: MessageType
  payload: T
}

export interface ChatMessage {
  player_id: string
  player_name: string
  text: string
  sent_at: string
}

// ---------------------------------------------------------------------------
// API responses
// ---------------------------------------------------------------------------

export interface CreateGameResponse {
  game_id: string
  player_id: string
}

export interface PlaceTilesResponse {
  score_earned: number
  game: GameView
}

export interface LobbyEntry {
  id: string
  status: GameStatus
  player_count: number
}

export interface GameResults {
  game_id: string
  winner: { id: string; name: string; score: number }
  results: { id: string; name: string; score: number }[]
}
