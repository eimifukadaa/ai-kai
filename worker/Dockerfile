FROM golang:1.22-bookworm AS builder

WORKDIR /app

# Copy go mod/sum files specifically for the worker
# Assuming build context is key.
# If build context is root:
COPY worker/go.mod worker/go.sum ./
RUN go mod download

COPY worker/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -o worker .

FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
    ca-certificates \
    poppler-utils \
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-ind \
    imagemagick \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/worker .
# Copy .env.local if needed or rely on ENV vars passed to container
# COPY .env.local . 

CMD ["./worker"]
