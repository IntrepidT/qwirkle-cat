package main

import (
	"log"
	"net/http"
	"os"

	"github.com/IntrepidT/qwirkle-cat/internal/api"
	"github.com/IntrepidT/qwirkle-cat/internal/store"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	gameStore := store.NewGameStore()
	handler := api.NewHandler(gameStore)

	log.Printf("Qwirkle server listening on :%s", port)
	if err := http.ListenAndServe(":"+port, handler.Router()); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
