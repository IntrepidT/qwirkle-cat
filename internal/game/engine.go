package game

import (
	"errors"
	"math/rand"

	"github.com/google/uuid"
	"github.com/IntrepidT/qwirkle-cat/pkg/models"
)

// ---------------------------------------------------------------------------
// Sentinel errors
// ---------------------------------------------------------------------------

var (
	ErrGameFull         = errors.New("game is full")
	ErrGameNotWaiting   = errors.New("game has already started or finished")
	ErrGameNotStarted   = errors.New("game has not started yet")
	ErrNotYourTurn      = errors.New("it is not your turn")
	ErrInvalidPlacement = errors.New("tile placement is invalid")
	ErrNotInHand        = errors.New("tile is not in player's hand")
	ErrBagEmpty         = errors.New("bag is empty")
	ErrBagTooSmall      = errors.New("bag does not have enough tiles to exchange")
	ErrPlayerNotFound   = errors.New("player not found in this game")
	ErrPositionOccupied = errors.New("board position is already occupied")
)

// ---------------------------------------------------------------------------
// Cat name generator
// ---------------------------------------------------------------------------

var catAdjectives = []string{
	"fluffy", "grumpy", "sleepy", "sneaky", "bouncy", "spooky", "chonky",
	"derpy", "sassy", "zesty", "wiggly", "soggy", "crispy", "wobbly",
	"smug", "dramatic", "suspicious", "confused", "chaotic", "tiny",
	"ancient", "majestic", "cursed", "blessed", "feral", "distinguished",
	"judgmental", "startled", "plotting", "loafing", "screaming", "vibrating",
	"invisible", "enormous", "suspicious", "disappointed", "legendary",
}

var catMiddles = []string{
	"whiskers", "mittens", "biscuit", "noodle", "mochi", "dumpling",
	"fluffington", "purrkins", "snuggles", "thunderpaws", "moonbeam",
	"fishstick", "spaghetti", "waffle", "pancake", "pretzel", "crouton",
	"nugget", "meatball", "tater", "pickles", "butterbean", "crinkle",
	"smudge", "mr-blorps", "captain", "professor", "doctor", "chairman",
	"duchess", "lord", "baron", "countess", "admiral",
}

// GenerateCatName returns a name always ending in "cat", e.g. "fluffy-whiskers-cat"
func GenerateCatName() string {
	adj  := catAdjectives[rand.Intn(len(catAdjectives))]
	mid  := catMiddles[rand.Intn(len(catMiddles))]
	return adj + "-" + mid + "-cat"
}

// ---------------------------------------------------------------------------
// Game lifecycle
// ---------------------------------------------------------------------------

//NewGame creates a new game with the given player as the host, and returns the game
func NewGame(hostID uuid.UUID) models.Game {
	g := models.Game{
		ID:          uuid.New(),
		Name:        GenerateCatName(),
		Players:     []*models.Player{{ID: hostID}},
		Board:       make(models.Board),
		Bag:         fillBag(),
		CurrentTurn: 0,
		Status:      models.GameWaiting,
	}
	shuffleBag(g.Bag)
	return g
}

//AddPlayer adds a player to the game, if the game is still waiting for players and not full
func AddPlayer(g *models.Game, playerID uuid.UUID) error {
	if g.Status != models.GameWaiting {
		return ErrGameNotWaiting
	}
	if len(g.Players) >= models.MaxPlayers {
		return ErrGameFull
	}
	g.Players = append(g.Players, &models.Player{ID: playerID}) // NOTE: pointer
	return nil
}

//StartGame starts the game, dealing 6 tiles to each player and changing the status to active
func StartGame(g *models.Game) error {
	//validate game is in correct state
	if g.Status != models.GameWaiting {
		return ErrGameNotWaiting
	}
	if len(g.Players) < 2 {
		return errors.New("need at least 2 players to start")
	}

	//deal tiles to players
	for i := range g.Players {
		tiles, err := drawTiles(g, models.HandSize)
		if err != nil {
			return err
		}
		g.Players[i].Hand = tiles
	}

	//determine first player randomly
	g.CurrentTurn = rand.Intn(len(g.Players))

	//set status to active
	g.Status = models.GameActive
  g.BagCount = len(g.Bag) // initialize bag count for game view consistency
	return nil
}

//
func GameViewFor(g *models.Game, playerID uuid.UUID) (*models.GameView, error) {
  player, _, err := findPlayer(g, playerID)
  if err != nil {
    return nil, err
  }

  //build the opponent views - hide hand and score for opponents
  playerViews := make([]models.PlayerView, len(g.Players))
  for i, p := range g.Players {
      pv := models.PlayerView{
          ID:        p.ID,
          Name:      p.Name,
          HandCount: len(p.Hand),
          Score:     p.Score,
          Status:    p.Status,
      }
      playerViews[i] = pv
  }

  return &models.GameView{
    ID:          g.ID,
    Name:        g.Name,
    Status:      g.Status,
    Players:     playerViews,
    Board:       g.BoardTiles,
    BagCount:    len(g.Bag),
    CurrentTurn: g.CurrentTurn,
    TurnNumber:  g.TurnNumber,
    YourHand:    player.Hand,
  }, nil
}

// ---------------------------------------------------------------------------
// Turn actions
// ---------------------------------------------------------------------------

//PlaceTiles handles a player's turn, validating the placements, calculating the score, updating the board and player's hand, and advancing the turn
func PlaceTiles(g *models.Game, playerID uuid.UUID, placements []models.PlacedTile) (int, error) {

	//validate it is the player's turn
	player, idx, err := findPlayer(g, playerID)
	if err != nil {
		return 0, err
	}
	if g.Status != models.GameActive {
		return 0, ErrGameNotStarted
	}
	if idx != g.CurrentTurn {
		return 0, ErrNotYourTurn
	}

	//validate no duplicate tiles in this placement batch (do this before mutating the hand)
	seen := make(map[models.Tile]bool)
	for _, p := range placements {
		if seen[p.Tile] {
			return 0, ErrInvalidPlacement
		}
		seen[p.Tile] = true
	}

	// 1. check all tiles exist in hand without mutating yet
	handCopy := make([]models.Tile, len(player.Hand))
	copy(handCopy, player.Hand)
	for _, p := range placements {
		found := false
		for i, t := range handCopy {
			if t == p.Tile {
				handCopy = append(handCopy[:i], handCopy[i+1:]...)
				found = true
				break
			}
		}
		if !found {
			return 0, ErrNotInHand
		}
	}

	// 2. all positions must be unoccupied
	for _, p := range placements {
		if _, ok := g.Board[p.Position]; ok {
			return 0, ErrPositionOccupied
		}
	}

	// 3. multi-tile moves must all share the same row or same column
	if len(placements) > 1 {
		sameRow, sameCol := true, true
		for i := 1; i < len(placements); i++ {
			if placements[i].Position.Y != placements[0].Position.Y {
				sameRow = false
			}
			if placements[i].Position.X != placements[0].Position.X {
				sameCol = false
			}
		}
		if !sameRow && !sameCol {
			return 0, ErrInvalidPlacement
		}
	}

	// 4. resulting lines must be valid (same color XOR same shape, no duplicates)
	for _, p := range placements {
		if hLine := getLine(g.Board, placements, p.Position, true); len(hLine) > 1 {
			if err := validateLine(hLine); err != nil {
				return 0, err
			}
		}
		if vLine := getLine(g.Board, placements, p.Position, false); len(vLine) > 1 {
			if err := validateLine(vLine); err != nil {
				return 0, err
			}
		}
	}

	// 5. at least one tile must touch the existing board (skip on first move)
	if len(g.Board) > 0 {
		adjacent := false
		for _, p := range placements {
			for _, d := range []models.Position{{X: 0, Y: -1}, {X: 0, Y: 1}, {X: -1, Y: 0}, {X: 1, Y: 0}} {
				if _, ok := g.Board[models.Position{X: p.Position.X + d.X, Y: p.Position.Y + d.Y}]; ok {
					adjacent = true
					break
				}
			}
			if adjacent { break }
		}
		if !adjacent {
			return 0, ErrInvalidPlacement
		}
	}

	// all checks passed — now actually remove tiles from hand
	for _, p := range placements {
		removeTileFromHand(player, []models.Tile{p.Tile})
	}

	//calculate score for the move
	score := scoreMove(g, placements)
  player.Score += score

	//update board with new placements
	for _, p := range placements { // NOTE: removed stray `return err` that was inside this loop
		g.Board[p.Position] = p.Tile
	}
	syncBoardTiles(g)

	//refill player's hand from bag, then advance turn
	player.Hand = drawUpToFull(g, player) // NOTE: player is now *models.Player so this persists
	advanceTurn(g)

  //after advancing the turn, check if the game is over (if the player has no tiles left after placing, or if the bag is empty and each player has had 1 turn)
  if checkGameOver(g) {
    g.Status = models.GameFinished
    //bonus: the player who emptied their hand
    if len(player.Hand) == 0 {
      player.Score += models.QwirkleBonus
    }
  }
  g.TurnNumber++

	return score, nil
}

//ExchangeTiles allows a player to exchange tiles from their hand with new tiles from the bag, if the bag has enough tiles
func ExchangeTiles(g *models.Game, playerID uuid.UUID, tilesToExchange []models.Tile) error {

	//validate it is the player's turn
	player, idx, err := findPlayer(g, playerID)
	if err != nil {
		return err
	}
	if g.Status != models.GameActive {
		return ErrGameNotStarted
	}
	if idx != g.CurrentTurn {
		return ErrNotYourTurn
	}

	//validate bag has enough tiles to exchange (check before touching the hand)
	if len(g.Bag) < len(tilesToExchange) {
		return ErrBagTooSmall
	}

	//validate all tiles are in the player's hand
	if err := removeTileFromHand(player, tilesToExchange); err != nil { // NOTE: pointer — no & needed
		return err
	}

	//draw new tiles for player
	newTiles, err := drawTiles(g, len(tilesToExchange))
	if err != nil {
		return err
	}
	player.Hand = append(player.Hand, newTiles...)

	//return exchanged tiles to bag and shuffle
	g.Bag = append(g.Bag, tilesToExchange...)
	shuffleBag(g.Bag)

	//advance turn to next player
	advanceTurn(g)

  g.BagCount = len(g.Bag)

	return nil
}

//checkGameOver checks if the game is over, which happens when a player has no tiles left after placing, or each player has gotten 1 turn after the bag is empty
func checkGameOver(g *models.Game) bool {
	//check if bag is empty and 1 player has no tiles left
	for _, p := range g.Players {
		if len(p.Hand) == 0 && len(g.Bag) == 0 {
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

//calculate the points for a set of placements
// each line containing newly placed tile is scored; a Qwirkle line is worth 12
func scoreMove(g *models.Game, placements []models.PlacedTile) int {
    score := 0
    
    // track which lines we've already scored to avoid double-counting
    // a line is uniquely identified by its axis and its fixed coordinate
    type lineKey struct {
        horizontal bool
        fixedCoord int  // Y if horizontal, X if vertical
    }
    scored := make(map[lineKey]bool)

    for _, p := range placements {
        // score horizontal line through this tile
        hKey := lineKey{true, p.Position.Y}
        if !scored[hKey] {
            line := getLine(g.Board, placements, p.Position, true)
            if len(line) > 1 {
                score += len(line)
                if len(line) == 6 {
                    score += models.QwirkleBonus
                }
            }
            scored[hKey] = true
        }

        // score vertical line through this tile
        vKey := lineKey{false, p.Position.X}
        if !scored[vKey] {
            line := getLine(g.Board, placements, p.Position, false)
            if len(line) > 1 {
                score += len(line)
                if len(line) == 6 {
                    score += models.QwirkleBonus
                }
            }
            scored[vKey] = true
        }
    }

    // a single tile with no neighbors scores 1
    if score == 0 {
        score = 1
    }

    return score
}

// ---------------------------------------------------------------------------
// Board helpers
// ---------------------------------------------------------------------------

//getLine returns all tiles existing and new in the horizontal or vertical line
// passing through pos, given the new placements
func getLine(board models.Board, placements []models.PlacedTile, pos models.Position, horizontal bool) []models.Tile {
	allTiles := make(map[models.Position]models.Tile)
	for k, v := range board {
		allTiles[k] = v
	}
	for _, p := range placements {
		allTiles[p.Position] = p.Tile
	}

	var line []models.Tile
	// scan left/up
	cur := pos
	for {
		if horizontal {
			cur.X--
		} else {
			cur.Y--
		}
		if t, ok := allTiles[cur]; ok {
			line = append(line, t)
		} else {
			break
		}
	}
	// add center tile
	if t, ok := allTiles[pos]; ok {
		line = append(line, t)
	}
	// scan right/down
	cur = pos
	for {
		if horizontal {
			cur.X++
		} else {
			cur.Y++
		}
		if t, ok := allTiles[cur]; ok {
			line = append(line, t)
		} else {
			break
		}
	}
	return line
}

//checks that a line of tiles is valid, meaning that all tiles are the same shape or color, and that there are no duplicates
//all share the same color XOR the same shape, and that there are no duplicates
func validateLine(tiles []models.Tile) error {
	if len(tiles) == 0 {
		return nil
	}

	colors := make(map[string]bool)
	shapes := make(map[string]bool)
	for _, t := range tiles {
		colors[string(t.Color)] = true
		shapes[string(t.Shape)] = true
	}
	//invalid: neither all same color nor all same shape
	if len(colors) > 1 && len(shapes) > 1 {
		return ErrInvalidPlacement
	}
	//invalid: duplicates (same color and same shape)
	seen := make(map[models.Tile]bool)
	for _, t := range tiles {
		if seen[t] {
			return ErrInvalidPlacement
		}
		seen[t] = true
	}
	return nil
}

//updates game.BoardTiles so the struct stays consistent with the placements
func syncBoardTiles(g *models.Game) {
	g.BoardTiles = g.BoardTiles[:0]
	for pos, tile := range g.Board {
		g.BoardTiles = append(g.BoardTiles, models.PlacedTile{Tile: tile, Position: pos})
	}
}

// ---------------------------------------------------------------------------
// Player helpers
// ---------------------------------------------------------------------------

//looks up the player by UUID in a game, returning a pointer to the player and its index
// NOTE: returns *models.Player so mutations (hand changes, score updates) persist on g.Players
func findPlayer(g *models.Game, playerID uuid.UUID) (*models.Player, int, error) {
	for i := range g.Players {
		if g.Players[i].ID == playerID {
			return g.Players[i], i, nil // NOTE: was returning value copy; now returns pointer
		}
	}
	return nil, -1, ErrPlayerNotFound
}

//removesTileFromHand removes the given tiles from a player's hand, returning ErrNotInHand if any tile is missing
func removeTileFromHand(player *models.Player, tiles []models.Tile) error {
	for _, t := range tiles {
		found := false
		for i, handTile := range player.Hand {
			if handTile == t {
				//remove tile from hand
				player.Hand = append(player.Hand[:i], player.Hand[i+1:]...)
				found = true
				break
			}
		}
		if !found {
			return ErrNotInHand
		}
	}
	return nil
}

//advance turn to the next player, looping back to the first player after the last
func advanceTurn(g *models.Game) {
	g.CurrentTurn = (g.CurrentTurn + 1) % len(g.Players)
}

// ---------------------------------------------------------------------------
// Bag helpers
// ---------------------------------------------------------------------------

//resets the bag for a new game, filling it with the standard 108 tiles
func fillBag() []models.Tile {
	var bag []models.Tile
	for _, color := range models.Colors {
		for _, shape := range models.Shapes {
			for i := 0; i < models.TilesPerCombo; i++ { // NOTE: was bare TilesPerCombo — needs models. prefix
				bag = append(bag, models.Tile{Color: color, Shape: shape})
			}
		}
	}
	return bag
}

//shuffles the bag of tiles
func shuffleBag(tiles []models.Tile) {
	rand.Shuffle(len(tiles), func(i, j int) {
		tiles[i], tiles[j] = tiles[j], tiles[i]
	})
}

//draws a given number of tiles; sliced from the front of g.Bag, and removes them from the bag
func drawTiles(g *models.Game, num int) ([]models.Tile, error) {
	if len(g.Bag) < num {
		return nil, ErrBagTooSmall
	}
	drawn := g.Bag[:num]
	g.Bag = g.Bag[num:]

  g.BagCount = len(g.Bag) // update bag count for game view consistency

	return drawn, nil
}

//draws tiles up to a full hand of 6 for the player, if the bag has enough tiles
func drawUpToFull(g *models.Game, player *models.Player) []models.Tile { // NOTE: takes pointer to match findPlayer return type
	numToDraw := models.HandSize - len(player.Hand)
	if numToDraw <= 0 {
		return player.Hand
	}
	newTiles, err := drawTiles(g, numToDraw)
	if err != nil {
		return player.Hand
	}
	return append(player.Hand, newTiles...)
}
