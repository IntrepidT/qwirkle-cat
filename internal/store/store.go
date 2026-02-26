package store

import (
	"errors"
	"sync"

	"github.com/google/uuid"
	"github.com/IntrepidT/qwirkle-cat/pkg/models"
)

var ErrNotFound = errors.New("game not found")

//GameStore is a thread-safe in-memory map of game ID to game state
type GameStore struct {
	mu    sync.RWMutex
	games map[uuid.UUID]*models.Game
}

//NewGameStore creates an empty GameStore
func NewGameStore() *GameStore {
	return &GameStore{
		games: make(map[uuid.UUID]*models.Game),
	}
}

//Save inserts or replaces a game
func (s *GameStore) Save(g *models.Game) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.games[g.ID] = g
}

//Get retrieves a game by ID
func (s *GameStore) Get(id uuid.UUID) (*models.Game, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	g, ok := s.games[id]
	if !ok {
		return nil, ErrNotFound
	}
	return g, nil
}

//Delete removes a game by ID
func (s *GameStore) Delete(id uuid.UUID) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.games, id)
}

//List returns all games
func (s *GameStore) List() []*models.Game {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]*models.Game, 0, len(s.games))
	for _, g := range s.games {
		out = append(out, g)
	}
	return out
}
