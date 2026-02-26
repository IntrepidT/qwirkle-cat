.PHONY: run build test lint docker-build docker-up tidy

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

docker-build:
	docker build -t qwirkle:latest .

docker-up:
	docker-compose up --build
