package api

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/IntrepidT/qwirkle-cat/internal/game"
	"github.com/IntrepidT/qwirkle-cat/internal/store"
	"github.com/IntrepidT/qwirkle-cat/internal/ws"
	"github.com/IntrepidT/qwirkle-cat/pkg/models"
)

func itoa(n int) string { return strconv.Itoa(n) }

type Handler struct {
	store *store.GameStore
	hub   *ws.Hub
}

func NewHandler(s *store.GameStore, h *ws.Hub) *Handler {
	return &Handler{store: s, hub: h}
}

func (h *Handler) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.RequestID)

	// All API routes live under /api so the built frontend can reach them directly.
	// In dev, Vite proxies /api → localhost:8080 and strips the prefix — but since
	// we now handle /api here, the rewrite in vite.config.ts should be removed or
	// the prefix kept. See vite.config.ts note below.
	r.Route("/api", func(r chi.Router) {
		r.Post("/games", h.CreateGame)
		r.Get("/games", h.ListGames)
		r.Get("/games/by-name/{name}", h.GetGameByName)
		r.Post("/games/by-name/{name}/join", h.JoinOrRejoinByName)
		r.Get("/games/{gameID}", h.GetGame)
		r.Post("/games/{gameID}/join", h.JoinGame)
		r.Post("/games/{gameID}/start", h.StartGame)
		r.Post("/games/{gameID}/place", h.PlaceTiles)
		r.Post("/games/{gameID}/exchange", h.ExchangeTiles)
		r.Get("/games/{gameID}/results", h.GetResults)
	})

	// WebSocket — not under /api so path matches Vite's /ws proxy
	r.Get("/ws/games/{gameID}", h.ServeWS)

	// Serve the built React app for everything else (SPA fallback).
	// In Docker the frontend is built to /app/frontend/dist.
	// Falls back to index.html for all non-file routes so React Router works.
	staticDir := os.Getenv("STATIC_DIR")
	if staticDir == "" {
		staticDir = "./frontend/dist"
	}
	r.Get("/*", spaHandler(staticDir))

	return r
}

// spaHandler serves static files from dir and falls back to index.html for
// any path that doesn't match a real file (supports client-side routing).
func spaHandler(dir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		path := filepath.Join(dir, filepath.Clean("/"+r.URL.Path))
		// If the file exists, serve it directly
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			http.ServeFile(w, r, path)
			return
		}
		// Otherwise serve index.html (SPA fallback)
		index := filepath.Join(dir, "index.html")
		if _, err := os.Stat(index); err != nil {
			http.Error(w, "frontend not found — run 'npm run build' in the frontend directory", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		// Prevent caching of index.html so new deploys are picked up
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		http.ServeFile(w, r, index)
	}
}

// ensure strings is used (imported for potential future middleware)
var _ = strings.HasPrefix

func (h *Handler) CreateGame(w http.ResponseWriter, r *http.Request) {
	var req models.JoinGameRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	hostID := uuid.New()
	g := game.NewGame(hostID)
	g.Players[0].Name = req.PlayerName
	h.store.Save(&g)
	respondJSON(w, http.StatusCreated, map[string]any{"game_id": g.ID, "game_name": g.Name, "player_id": hostID})
}

func (h *Handler) ListGames(w http.ResponseWriter, r *http.Request) {
	all := h.store.List()
	type lobbyEntry struct {
		ID          uuid.UUID         `json:"id"`
		Status      models.GameStatus `json:"status"`
		PlayerCount int               `json:"player_count"`
	}
	entries := make([]lobbyEntry, 0, len(all))
	for _, g := range all {
		if g.Status == models.GameWaiting {
			entries = append(entries, lobbyEntry{ID: g.ID, Status: g.Status, PlayerCount: len(g.Players)})
		}
	}
	respondJSON(w, http.StatusOK, entries)
}

func (h *Handler) GetGame(w http.ResponseWriter, r *http.Request) {
	g, err := h.store.Get(gameIDFromRequest(r))
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}
	playerID, err := uuid.Parse(r.URL.Query().Get("player_id"))
	if err != nil {
		respondJSON(w, http.StatusOK, g)
		return
	}
	view, err := game.GameViewFor(g, playerID)
	if err != nil {
		respondError(w, mapGameError(err), err.Error())
		return
	}
	respondJSON(w, http.StatusOK, view)
}

func (h *Handler) GetGameByName(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	all := h.store.List()
	for _, g := range all {
		if g.Name == name {
			respondJSON(w, http.StatusOK, map[string]any{"game_id": g.ID, "game_name": g.Name, "status": g.Status})
			return
		}
	}
	respondError(w, http.StatusNotFound, "no game found with that name")
}

// JoinOrRejoinByName looks up a game by its cat name, then either:
// - returns the existing player_id if a player with that name is already in the game (rejoin)
// - adds the player as a new participant if the game is still waiting (join)
func (h *Handler) JoinOrRejoinByName(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")

	var req models.JoinGameRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.PlayerName == "" {
		respondError(w, http.StatusBadRequest, "player_name is required")
		return
	}

	// find game by cat name
	all := h.store.List()
	var found *models.Game
	for _, g := range all {
		if g.Name == name {
			found = g
			break
		}
	}
	if found == nil {
		respondError(w, http.StatusNotFound, "no game found with that name — check the spelling!")
		return
	}

	// check if a player with this name already exists (rejoin)
	for _, p := range found.Players {
		if p.Name == req.PlayerName {
			respondJSON(w, http.StatusOK, map[string]any{
				"game_id":   found.ID,
				"game_name": found.Name,
				"player_id": p.ID,
				"rejoined":  true,
			})
			return
		}
	}

	// new join — only allowed while waiting
	if found.Status != models.GameWaiting {
		respondError(w, http.StatusUnprocessableEntity, "game has already started — if you were in this game, use your exact original name to rejoin")
		return
	}
	if len(found.Players) >= models.MaxPlayers {
		respondError(w, http.StatusUnprocessableEntity, "game is full")
		return
	}

	playerID := uuid.New()
	if err := game.AddPlayer(found, playerID); err != nil {
		respondError(w, mapGameError(err), err.Error())
		return
	}
	found.Players[len(found.Players)-1].Name = req.PlayerName
	h.store.Save(found)
	h.broadcastGameState(found)

	respondJSON(w, http.StatusOK, map[string]any{
		"game_id":   found.ID,
		"game_name": found.Name,
		"player_id": playerID,
		"rejoined":  false,
	})
}

func (h *Handler) JoinGame(w http.ResponseWriter, r *http.Request) {
	g, err := h.store.Get(gameIDFromRequest(r))
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}
	var req models.JoinGameRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	playerID := uuid.New()
	if err := game.AddPlayer(g, playerID); err != nil {
		respondError(w, mapGameError(err), err.Error())
		return
	}
	g.Players[len(g.Players)-1].Name = req.PlayerName
	h.store.Save(g)
	respondJSON(w, http.StatusOK, map[string]any{"game_id": g.ID, "game_name": g.Name, "player_id": playerID})
}

func (h *Handler) StartGame(w http.ResponseWriter, r *http.Request) {
	g, err := h.store.Get(gameIDFromRequest(r))
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}
	if err := game.StartGame(g); err != nil {
		respondError(w, mapGameError(err), err.Error())
		return
	}
	h.store.Save(g)
	h.broadcastGameState(g)
	respondJSON(w, http.StatusOK, map[string]string{"status": "started"})
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func (h *Handler) ServeWS(w http.ResponseWriter, r *http.Request) {
	gameID := gameIDFromRequest(r)
	playerID, err := uuid.Parse(r.URL.Query().Get("player_id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "player_id required")
		return
	}
	playerName := ""
	if g, err := h.store.Get(gameID); err == nil {
		for _, p := range g.Players {
			if p.ID == playerID {
				playerName = p.Name
				break
			}
		}
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	client := ws.NewClient(gameID, playerID, playerName, conn)
	h.hub.Register(client)
	go client.WritePump()
	go client.ReadPump(h.hub)
}

func (h *Handler) PlaceTiles(w http.ResponseWriter, r *http.Request) {
	g, err := h.store.Get(gameIDFromRequest(r))
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}
	var req models.PlaceTilesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	result, err := game.PlaceTiles(g, req.PlayerID, req.Tiles)
	if err != nil {
		respondError(w, mapGameError(err), err.Error())
		return
	}
	h.store.Save(g)
	h.broadcastGameState(g)

	// Build a system chat message so ALL players see the score announcement
	playerName := ""
	for _, p := range g.Players {
		if p.ID == req.PlayerID {
			playerName = p.Name
			break
		}
	}
	tileWord := "tile"
	if len(req.Tiles) != 1 { tileWord = "tiles" }
	var scoreMsg string
	if result.FinishBonus > 0 {
		scoreMsg = strings.Join([]string{
			playerName, " placed ", itoa(len(req.Tiles)), " ", tileWord,
			" for ", itoa(result.Score), " pts + ", itoa(result.FinishBonus), " finish bonus = ",
			itoa(result.Score+result.FinishBonus), " pts!",
		}, "")
	} else {
		ptWord := "point"
		if result.Score != 1 { ptWord = "points" }
		scoreMsg = playerName + " placed " + itoa(len(req.Tiles)) + " " + tileWord + " for " + itoa(result.Score) + " " + ptWord + "!"
	}
	// Broadcast system message to all OTHER players (sender handles locally)
	h.hub.BroadcastSystemMessage(g.ID, req.PlayerID, scoreMsg)

	view, _ := game.GameViewFor(g, req.PlayerID)
	respondJSON(w, http.StatusOK, map[string]any{
		"score_earned":  result.Score,
		"qwirkles":      result.Qwirkles,
		"finish_bonus":  result.FinishBonus,
		"game":          view,
	})
}

func (h *Handler) ExchangeTiles(w http.ResponseWriter, r *http.Request) {
	g, err := h.store.Get(gameIDFromRequest(r))
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}
	var req models.ExchangeTilesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := game.ExchangeTiles(g, req.PlayerID, req.Tiles); err != nil {
		respondError(w, mapGameError(err), err.Error())
		return
	}
	h.store.Save(g)
	h.broadcastGameState(g)
	view, _ := game.GameViewFor(g, req.PlayerID)
	respondJSON(w, http.StatusOK, view)
}

func (h *Handler) GetResults(w http.ResponseWriter, r *http.Request) {
	g, err := h.store.Get(gameIDFromRequest(r))
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}
	if g.Status != models.GameFinished {
		respondError(w, http.StatusBadRequest, "game is not finished")
		return
	}
	type playerResult struct {
		ID    uuid.UUID `json:"id"`
		Name  string    `json:"name"`
		Score int       `json:"score"`
	}
	results := make([]playerResult, len(g.Players))
	for i, p := range g.Players {
		results[i] = playerResult{ID: p.ID, Name: p.Name, Score: p.Score}
	}
	sort.Slice(results, func(i, j int) bool { return results[i].Score > results[j].Score })
	respondJSON(w, http.StatusOK, map[string]any{"game_id": g.ID, "winner": results[0], "results": results})
}

// broadcastGameState sends each player their own personalized GameView
// so their hand is included in the broadcast
func (h *Handler) broadcastGameState(g *models.Game) {
	for _, p := range g.Players {
		view, err := game.GameViewFor(g, p.ID)
		if err != nil {
			continue
		}
		h.hub.BroadcastTo(g.ID, p.ID, ws.Message{
			Type:    ws.MsgGameState,
			Payload: view,
		})
	}
}

func gameIDFromRequest(r *http.Request) uuid.UUID {
	id, _ := uuid.Parse(chi.URLParam(r, "gameID"))
	return id
}

func respondJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v) //nolint:errcheck
}

func respondError(w http.ResponseWriter, status int, msg string) {
	respondJSON(w, status, map[string]string{"error": msg})
}

func mapGameError(err error) int {
	switch err {
	case store.ErrNotFound:
		return http.StatusNotFound
	case game.ErrGameFull, game.ErrGameNotWaiting, game.ErrNotYourTurn,
		game.ErrInvalidPlacement, game.ErrNotInHand, game.ErrBagEmpty,
		game.ErrBagTooSmall, game.ErrPositionOccupied:
		return http.StatusUnprocessableEntity
	default:
		return http.StatusInternalServerError
	}
}
