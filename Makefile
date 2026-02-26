.PHONY: run build test lint docker-build docker-run tidy frontend-dev frontend-build

# ── Go backend ──────────────────────────────────────────────────────────────
run:
	go run ./cmd/server

build:
	go build -o bin/qwirkle ./cmd/server

test:
	go test ./...

lint:
	golangci-lint run ./...

tidy:
	go mod tidy

# ── Frontend (inside ./frontend) ────────────────────────────────────────────
frontend-dev:
	cd frontend && npm run dev

frontend-build:
	cd frontend && npm ci && npm run build

# ── Docker ──────────────────────────────────────────────────────────────────
docker-build:
	docker build -t qwirklecat:latest .

# Run the container — exposes port 8080 locally
docker-run:
	docker run --rm -p 8080:8080 qwirklecat:latest

# Build then run in one step
docker-up: docker-build docker-run
