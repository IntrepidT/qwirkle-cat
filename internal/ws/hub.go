package ws

import (
	"encoding/json"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// ---------------------------------------------------------------------------
// Message envelope
// ---------------------------------------------------------------------------

type MessageType string

const (
	MsgGameState MessageType = "game_state"
	MsgChat      MessageType = "chat"
)

type Message struct {
	Type    MessageType `json:"type"`
	Payload any         `json:"payload"`
}

type ChatPayload struct {
	PlayerID   uuid.UUID `json:"player_id"`
	PlayerName string    `json:"player_name"`
	Text       string    `json:"text"`
	SentAt     time.Time `json:"sent_at"`
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const (
	writeWait  = 10 * time.Second
	pongWait   = 60 * time.Second
	pingPeriod = (pongWait * 9) / 10
)

type Client struct {
	GameID     uuid.UUID
	PlayerID   uuid.UUID
	PlayerName string
	Send       chan []byte
	conn       *websocket.Conn
}

func NewClient(gameID, playerID uuid.UUID, playerName string, conn *websocket.Conn) *Client {
	return &Client{
		GameID:     gameID,
		PlayerID:   playerID,
		PlayerName: playerName,
		Send:       make(chan []byte, 256),
		conn:       conn,
	}
}

// WritePump pumps messages from the Send channel to the WebSocket connection
func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	for {
		select {
		case msg, ok := <-c.Send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			c.conn.WriteMessage(websocket.TextMessage, msg)
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// ReadPump reads incoming messages and re-broadcasts them as chat
func (c *Client) ReadPump(hub *Hub) {
	defer func() {
		hub.Unregister(c)
		c.conn.Close()
	}()
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})
	for {
		_, msg, err := c.conn.ReadMessage()
		if err != nil {
			break
		}
		// broadcast to all OTHER players; sender adds their own message locally
		hub.BroadcastToOthers(c.GameID, c.PlayerID, Message{
			Type: MsgChat,
			Payload: ChatPayload{
				PlayerID:   c.PlayerID,
				PlayerName: c.PlayerName,
				Text:       string(msg),
				SentAt:     time.Now(),
			},
		})
	}
}

// ---------------------------------------------------------------------------
// Hub
// ---------------------------------------------------------------------------

type Hub struct {
	mu      sync.RWMutex
	clients map[uuid.UUID][]*Client // gameID → clients
}

func NewHub() *Hub {
	return &Hub{
		clients: make(map[uuid.UUID][]*Client),
	}
}

// Register adds a client to a game room
func (h *Hub) Register(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[c.GameID] = append(h.clients[c.GameID], c)
}

// Unregister removes a client from a game room
func (h *Hub) Unregister(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	clients := h.clients[c.GameID]
	for i, existing := range clients {
		if existing == c {
			h.clients[c.GameID] = append(clients[:i], clients[i+1:]...)
			close(c.Send)
			break
		}
	}
}

// Broadcast sends a message to ALL clients in a game room
func (h *Hub) Broadcast(gameID uuid.UUID, msg any) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	data, _ := json.Marshal(msg)
	for _, c := range h.clients[gameID] {
		select {
		case c.Send <- data:
		default:
			close(c.Send)
		}
	}
}

// BroadcastToOthers sends to all clients in a game room EXCEPT the sender
func (h *Hub) BroadcastToOthers(gameID uuid.UUID, senderID uuid.UUID, msg any) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	data, _ := json.Marshal(msg)
	for _, c := range h.clients[gameID] {
		if c.PlayerID != senderID {
			select {
			case c.Send <- data:
			default:
				close(c.Send)
			}
		}
	}
}

// BroadcastTo sends a message only to a specific player
func (h *Hub) BroadcastTo(gameID uuid.UUID, playerID uuid.UUID, msg any) {
    h.mu.RLock()
    defer h.mu.RUnlock()
    data, _ := json.Marshal(msg)
    for _, c := range h.clients[gameID] {
        if c.PlayerID == playerID {
            select {
            case c.Send <- data:
            default:
                close(c.Send)
            }
        }
    }
}
