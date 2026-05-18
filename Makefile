.PHONY: help up down logs install build dev test test-unit test-integration test-e2e \
        test-coverage lint typecheck format db-migrate db-seed db-reset clean ci

help:
	@echo "Roomard development commands:"
	@echo "  make up               - Start infrastructure (postgres, redis, minio, mailpit)"
	@echo "  make down             - Stop infrastructure"
	@echo "  make logs             - Tail infrastructure logs"
	@echo "  make install          - Install dependencies"
	@echo "  make build            - Build all packages"
	@echo "  make dev              - Start all services in dev mode"
	@echo "  make test             - Run all tests"
	@echo "  make test-unit        - Run unit tests"
	@echo "  make test-integration - Run integration tests"
	@echo "  make test-e2e         - Run Playwright e2e tests"
	@echo "  make test-coverage    - Run tests with coverage"
	@echo "  make lint             - Lint all packages"
	@echo "  make typecheck        - Type-check all packages"
	@echo "  make format           - Format all code"
	@echo "  make db-migrate       - Run database migrations"
	@echo "  make db-seed          - Seed database with dev data"
	@echo "  make db-reset         - Reset database (drop + migrate + seed)"
	@echo "  make ci               - Run full CI pipeline locally"
	@echo "  make clean            - Clean all build artefacts"

up:
	docker compose up -d
	@echo "Waiting for services to be healthy..."
	@docker compose ps

down:
	docker compose down

logs:
	docker compose logs -f

install:
	pnpm install --frozen-lockfile

build:
	pnpm build

dev:
	pnpm dev

test:
	pnpm test

test-unit:
	pnpm test:unit

test-integration:
	pnpm test:integration

test-e2e:
	pnpm test:e2e

test-coverage:
	pnpm test:coverage

lint:
	pnpm lint

typecheck:
	pnpm typecheck

format:
	pnpm format

db-migrate:
	pnpm db:migrate

db-seed:
	pnpm db:seed

db-reset:
	pnpm db:reset

clean:
	pnpm clean
	rm -rf node_modules

ci: install lint typecheck test-coverage build
	@echo "CI pipeline complete"
