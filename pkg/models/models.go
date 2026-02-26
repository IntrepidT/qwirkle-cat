package models

import (
	"github.com/google/uuid"
)

// ---------------------------------------------------------------------------
// Tile primitives
// ---------------------------------------------------------------------------

//Color type; enum representing the color of a card
type Color string

const (
	Red    Color = "red"
	Orange Color = "orange"
	Yellow Color = "yellow"
	Green  Color = "green"
	Blue   Color = "blue"
	Purple Color = "purple"
)

//Shape type; representing the 6 possible tile shapes
type Shape string

const (
	Circle  Shape = "circle"
	Clover  Shape = "clover"
	Diamond Shape = "diamond"
	Square  Shape = "square"
	Star4   Shape = "star4"
	Star8   Shape = "star8"
)

//All possible colors and shapes for validation and game setup
var Colors = []Color{Red, Orange, Yellow, Green, Blue, Purple}
var Shapes = []Shape{Circle, Clover, Diamond, Square, Star4, Star8}

//Tile represents a single Qwirkle tile, which has a color and shape
type Tile struct {
	Color Color `json:"color"`
	Shape Shape `json:"shape"`
}

//Position represents a coordinate on the board, with x and y values
type Position struct {
	X int `json:"x"`
	Y int `json:"y"`
}

//PlacedTile is a tile that has been placed on the board, and includes the tile and its position
type PlacedTile struct {
	Tile     Tile     `json:"tile"`
	Position Position `json:"position"`
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

//PlayerStatus enum representing the current status of a player
type PlayerStatus string

const (
	PlayerActive       PlayerStatus = "active"
	PlayerInactive     PlayerStatus = "inactive"
	PlayerDisconnected PlayerStatus = "disconnected"
)

//Player represents a game participant
type Player struct {
	ID     uuid.UUID    `json:"id"`
	Name   string       `json:"name"`
	Hand   []Tile       `json:"hand"`
	Score  int          `json:"score"`
	Status PlayerStatus `json:"status"`
}

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------

//GameStatus represents the lifecycle status of a game
type GameStatus string

const (
	GameWaiting  GameStatus = "waiting"
	GameActive   GameStatus = "active"
	GameFinished GameStatus = "finished"
)

//Board is a sparse map of positions to tiles
type Board map[Position]Tile

//Game is the full game state
type Game struct {
	ID          uuid.UUID    `json:"id"`
	Name        string       `json:"name"`
	Status      GameStatus   `json:"status"`
	Players     []*Player    `json:"players"`
	Board       Board        `json:"-"`          //serialized separately via BoardTiles
	BoardTiles  []PlacedTile `json:"board"`
	Bag         []Tile       `json:"-"`          //hidden from clients
	BagCount    int          `json:"bag_count"`  //number of tiles left in the bag
	CurrentTurn int          `json:"current_turn"` //index of the player whose turn it is
	TurnNumber  int          `json:"turn_number"`  //number of turns taken so far
}

//MaxPlayers is the maximum number of players per game
const MaxPlayers = 4

//HandSize is how many tiles each player holds
const HandSize = 6

//TilesPerCombo is the number of copies of each color/shape combination in the bag
const TilesPerCombo = 3

//QwirkleBonus is the bonus points awarded for completing a full 6-tile line
const QwirkleBonus = 6

// ---------------------------------------------------------------------------
// Turn actions
// ---------------------------------------------------------------------------

//TurnAction enumerates what a player can do on their turn
type TurnAction string

const (
	ActionPlace    TurnAction = "place"
	ActionExchange TurnAction = "exchange"
	ActionPass     TurnAction = "pass"
)

// ---------------------------------------------------------------------------
// Request payloads
// ---------------------------------------------------------------------------

//PlaceTilesRequest represents a player's request to place tiles on the board
type PlaceTilesRequest struct {
	PlayerID uuid.UUID    `json:"player_id"`
	Tiles    []PlacedTile `json:"tiles"`
}

//ExchangeTilesRequest is the payload for exchanging tiles from a player's hand with the bag
type ExchangeTilesRequest struct {
	PlayerID uuid.UUID `json:"player_id"`
	Tiles    []Tile    `json:"tiles"`
}

//PassRequest is the payload for passing a turn
type PassRequest struct {
	PlayerID uuid.UUID `json:"player_id"`
}

//JoinGameRequest is the payload for joining a game lobby
type JoinGameRequest struct {
	PlayerName string `json:"player_name"`
	Password   string `json:"password,omitempty"`
}

// ---------------------------------------------------------------------------
// Client-safe views (hide hands and bag from opponents)
// ---------------------------------------------------------------------------

//GameView is the client-safe view of a game, which hides sensitive information like the bag and other players' hands
type GameView struct {
	ID          uuid.UUID    `json:"id"`
	Name        string       `json:"name"`
	Status      GameStatus   `json:"status"`
	Players     []PlayerView `json:"players"`
	Board       []PlacedTile `json:"board"`
	BagCount    int          `json:"bag_count"`
	CurrentTurn int          `json:"current_turn"`
	TurnNumber  int          `json:"turn_number"`
	YourHand    []Tile       `json:"your_hand"`
  FinalHands  map[uuid.UUID][]Tile `json:"final_hands,omitempty"` //only included at game end, shows all players' hands for final scoring
}

//PlayerView is the client-safe view of a player, which hides their hand and other sensitive information
type PlayerView struct {
	ID        uuid.UUID    `json:"id"`
	Name      string       `json:"name"`
	HandCount int          `json:"hand_count"`
	Score     int          `json:"score"`
	Status    PlayerStatus `json:"status"`
}
