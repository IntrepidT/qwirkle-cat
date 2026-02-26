# ─── Stage 1: Build the React frontend ───────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend

# Cache npm install separately from source
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci

# Copy source and build
COPY frontend/ ./

# Vite bakes env vars starting with VITE_ into the bundle at build time.
# Pass your Tenor key: docker build --build-arg VITE_TENOR_KEY=yourkey .
ARG VITE_TENOR_KEY=LIVDSRZULELA
ENV VITE_TENOR_KEY=$VITE_TENOR_KEY

RUN npm run build
# Output is at /frontend/dist

# ─── Stage 2: Build the Go backend ────────────────────────────────────────────
FROM golang:1.22-alpine AS backend-builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /qwirkle ./cmd/server

# ─── Stage 3: Final lean image ────────────────────────────────────────────────
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

# Copy the Go binary
COPY --from=backend-builder /qwirkle .

# Copy the built frontend into the location the server expects
COPY --from=frontend-builder /frontend/dist ./frontend/dist

EXPOSE 8080
ENV PORT=8080
# STATIC_DIR tells the Go server where to find the built frontend
ENV STATIC_DIR=/app/frontend/dist

ENTRYPOINT ["/app/qwirkle"]
