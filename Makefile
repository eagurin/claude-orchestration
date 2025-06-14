# Claude Swarm Makefile

.PHONY: all build clean test bench proto deps help

# Variables
BINARY_DIR := bin
GO := go
GOFLAGS := -ldflags="-s -w"
PROTO_DIR := api/proto
PROTO_GO_OUT := api/proto

# Git information
GIT_COMMIT := $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_TIME := $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")

# Build flags
BUILD_FLAGS := -ldflags="-s -w \
	-X github.com/yourusername/claude_orchestration/internal/version.GitCommit=$(GIT_COMMIT) \
	-X github.com/yourusername/claude_orchestration/internal/version.BuildTime=$(BUILD_TIME) \
	-X github.com/yourusername/claude_orchestration/internal/version.Version=$(VERSION)"

# Default target
all: deps proto build

## help: Show this help message
help:
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@sed -n 's/^##//p' $(MAKEFILE_LIST) | column -t -s ':' | sed -e 's/^/ /'

## deps: Download and install dependencies
deps:
	@echo "Installing dependencies..."
	$(GO) mod download
	$(GO) mod tidy

## proto: Generate protobuf files
proto:
	@echo "Generating protobuf files..."
	@mkdir -p $(PROTO_GO_OUT)
	protoc --go_out=$(PROTO_GO_OUT) --go-grpc_out=$(PROTO_GO_OUT) \
		--go_opt=paths=source_relative --go-grpc_opt=paths=source_relative \
		$(PROTO_DIR)/*.proto

## build: Build all binaries
build: build-swarm build-agent build-tools

## build-swarm: Build orchestrator binary
build-swarm:
	@echo "Building swarm orchestrator..."
	@mkdir -p $(BINARY_DIR)
	$(GO) build $(BUILD_FLAGS) -o $(BINARY_DIR)/swarm ./cmd/swarm

## build-agent: Build agent binary
build-agent:
	@echo "Building agent..."
	@mkdir -p $(BINARY_DIR)
	$(GO) build $(BUILD_FLAGS) -o $(BINARY_DIR)/agent ./cmd/agent

## build-tools: Build tool server binary
build-tools:
	@echo "Building tool server..."
	@mkdir -p $(BINARY_DIR)
	$(GO) build $(BUILD_FLAGS) -o $(BINARY_DIR)/tools ./cmd/tools

## test: Run all tests
test:
	@echo "Running tests..."
	$(GO) test -v -race -coverprofile=coverage.out ./...
	$(GO) tool cover -html=coverage.out -o coverage.html

## test-short: Run short tests
test-short:
	@echo "Running short tests..."
	$(GO) test -v -short ./...

## bench: Run benchmarks
bench:
	@echo "Running benchmarks..."
	@mkdir -p benchmarks
	$(GO) test -bench=. -benchmem -benchtime=10s ./... | tee benchmarks/latest.txt

## lint: Run linters
lint:
	@echo "Running linters..."
	golangci-lint run ./...

## fmt: Format code
fmt:
	@echo "Formatting code..."
	$(GO) fmt ./...
	goimports -w .

## clean: Clean build artifacts
clean:
	@echo "Cleaning..."
	rm -rf $(BINARY_DIR)
	rm -rf dist/
	rm -f coverage.out coverage.html
	rm -rf benchmarks/*.txt

## install: Install binaries to GOPATH/bin
install: build
	@echo "Installing binaries..."
	$(GO) install $(BUILD_FLAGS) ./cmd/swarm
	$(GO) install $(BUILD_FLAGS) ./cmd/agent
	$(GO) install $(BUILD_FLAGS) ./cmd/tools

## docker: Build Docker images
docker:
	@echo "Building Docker images..."
	docker build -t claude-swarm:$(VERSION) -f docker/Dockerfile.swarm .
	docker build -t claude-agent:$(VERSION) -f docker/Dockerfile.agent .

## run: Run orchestrator locally
run: build
	@echo "Starting orchestrator..."
	./$(BINARY_DIR)/swarm start --dev

## setup: Initial project setup
setup: deps
	@echo "Setting up project..."
	@which protoc > /dev/null || (echo "protoc not found. Please install protobuf compiler." && exit 1)
	@which golangci-lint > /dev/null || go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
	@which goimports > /dev/null || go install golang.org/x/tools/cmd/goimports@latest
	@echo "Setup complete!"

## release: Create a new release
release: clean test build
	@echo "Creating release $(VERSION)..."
	@mkdir -p dist
	tar -czf dist/claude-swarm-$(VERSION)-linux-amd64.tar.gz -C $(BINARY_DIR) .
	@echo "Release created: dist/claude-swarm-$(VERSION)-linux-amd64.tar.gz"

# Development shortcuts
.PHONY: dev watch

## dev: Run in development mode with hot reload
dev:
	@echo "Starting development mode..."
	air -c .air.toml

## watch: Watch for changes and rebuild
watch:
	@echo "Watching for changes..."
	@while true; do \
		inotifywait -r -e modify,create,delete --exclude '(bin/|\.git/|\.swp)' .; \
		make build; \
	done