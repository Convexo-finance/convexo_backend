# ═══════════════════════════════════════════════════════════════════════════════
# Convexo Backend — Makefile
# ═══════════════════════════════════════════════════════════════════════════════
#
# Ports
#   API server  → http://localhost:3001
#   Swagger UI  → http://localhost:3001/docs
#   Prisma Studio → http://localhost:5555
#   PostgreSQL  → localhost:5432
#   Redis       → localhost:6379
#
# Quick start:
#   make up       → start PostgreSQL + Redis (Docker)
#   make migrate  → apply DB migrations
#   make dev      → start API in watch mode
#
# ═══════════════════════════════════════════════════════════════════════════════

.PHONY: help up down restart logs dev build start clean \
        migrate migrate-prod studio reset-db generate \
        check lint install

# ─── Colors ───────────────────────────────────────────────────────────────────
GREEN  := \033[0;32m
YELLOW := \033[1;33m
CYAN   := \033[0;36m
RESET  := \033[0m

# ─── Default target ───────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "$(CYAN)Convexo Backend$(RESET)"
	@echo ""
	@echo "$(YELLOW)Infrastructure$(RESET)"
	@echo "  make up            Start PostgreSQL + Redis (detached)"
	@echo "  make down          Stop all Docker services"
	@echo "  make restart       Restart Docker services"
	@echo "  make logs          Follow Docker service logs"
	@echo "  make logs-db       Follow PostgreSQL logs only"
	@echo "  make logs-redis    Follow Redis logs only"
	@echo ""
	@echo "$(YELLOW)Development$(RESET)"
	@echo "  make dev           Start API in watch mode (tsx watch)"
	@echo "  make install       Install npm dependencies"
	@echo "  make check         TypeScript type check (src only)"
	@echo ""
	@echo "$(YELLOW)Database$(RESET)"
	@echo "  make migrate       Run prisma migrate dev (dev only)"
	@echo "  make migrate-prod  Run prisma migrate deploy (production)"
	@echo "  make generate      Regenerate Prisma client"
	@echo "  make studio        Open Prisma Studio at :5555"
	@echo "  make reset-db      ⚠️  Reset DB + re-migrate (destroys data)"
	@echo ""
	@echo "$(YELLOW)Production$(RESET)"
	@echo "  make build         Compile TypeScript → dist/"
	@echo "  make start         Run compiled server (dist/index.js)"
	@echo "  make clean         Remove dist/"
	@echo ""
	@echo "$(YELLOW)URLs$(RESET)"
	@echo "  API     → http://localhost:3001"
	@echo "  Swagger → http://localhost:3001/docs"
	@echo "  Studio  → http://localhost:5555"
	@echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# Infrastructure
# ═══════════════════════════════════════════════════════════════════════════════

up:
	@echo "$(GREEN)Starting PostgreSQL + Redis...$(RESET)"
	docker compose up -d postgres redis
	@echo "$(GREEN)Waiting for services to be healthy...$(RESET)"
	@sleep 2
	@docker compose ps postgres redis

down:
	@echo "$(YELLOW)Stopping all Docker services...$(RESET)"
	docker compose down

restart:
	docker compose restart postgres redis

logs:
	docker compose logs -f

logs-db:
	docker compose logs -f postgres

logs-redis:
	docker compose logs -f redis

# ═══════════════════════════════════════════════════════════════════════════════
# Development
# ═══════════════════════════════════════════════════════════════════════════════

install:
	npm install

dev:
	@echo "$(GREEN)Starting Convexo API in dev mode...$(RESET)"
	@echo "  API     → http://localhost:3001"
	@echo "  Swagger → http://localhost:3001/docs"
	npm run dev

check:
	@echo "$(CYAN)Type checking src/...$(RESET)"
	npx tsc --noEmit --skipLibCheck

# ═══════════════════════════════════════════════════════════════════════════════
# Database
# ═══════════════════════════════════════════════════════════════════════════════

migrate:
	@echo "$(GREEN)Running Prisma migrate dev...$(RESET)"
	npx prisma migrate dev

migrate-prod:
	@echo "$(GREEN)Running Prisma migrate deploy...$(RESET)"
	npx prisma migrate deploy

generate:
	@echo "$(GREEN)Generating Prisma client...$(RESET)"
	npx prisma generate

studio:
	@echo "$(GREEN)Opening Prisma Studio at http://localhost:5555$(RESET)"
	npx prisma studio

reset-db:
	@echo "$(YELLOW)⚠️  This will DESTROY all data and re-migrate. Continue? [y/N]$(RESET)"
	@read ans && [ "$$ans" = "y" ] || (echo "Aborted." && exit 1)
	npx prisma migrate reset

# ═══════════════════════════════════════════════════════════════════════════════
# Production Build
# ═══════════════════════════════════════════════════════════════════════════════

build:
	@echo "$(GREEN)Building TypeScript...$(RESET)"
	npm run build
	@echo "$(GREEN)Build complete → dist/$(RESET)"

start:
	@echo "$(GREEN)Starting production server...$(RESET)"
	node dist/index.js

clean:
	rm -rf dist/
	@echo "$(YELLOW)dist/ removed$(RESET)"
