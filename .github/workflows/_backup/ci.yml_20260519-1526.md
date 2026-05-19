name: ci

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

env:
  PNPM_VERSION: 9.15.9
  NODE_VERSION: 20.10.0

jobs:
  lint-typecheck:
    name: Lint & typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9.15.9 }
      - uses: actions/setup-node@v4
        with:
          node-version: 20.10.0
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm run typecheck
      - run: pnpm run lint

  unit-tests:
    name: Unit tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9.15.9 }
      - uses: actions/setup-node@v4
        with:
          node-version: 20.10.0
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r --filter "@roomard/*" run test:coverage
      - name: Enforce coverage gate
        run: |
          set -e
          # Sum coverage from all lcov.info files and fail if statements coverage < 90%
          node -e "
            const fs = require('fs');
            const { globSync } = require('glob');
            const files = globSync('**/coverage/lcov.info', { ignore: 'node_modules/**' });
            let stmts = 0, hit = 0;
            for (const f of files) {
              const txt = fs.readFileSync(f, 'utf8');
              const ls = (txt.match(/^LF:(\\d+)/gm) || []).reduce((a, l) => a + parseInt(l.slice(3)), 0);
              const hs = (txt.match(/^LH:(\\d+)/gm) || []).reduce((a, l) => a + parseInt(l.slice(3)), 0);
              stmts += ls; hit += hs;
            }
            const pct = stmts === 0 ? 0 : (100 * hit / stmts);
            console.log('Coverage:', pct.toFixed(2) + '%');
            if (pct < 90) { console.error('Coverage gate failed (<90%)'); process.exit(1); }
          "
      - uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: '**/coverage/lcov.info'

  integration-tests:
    name: Integration tests (Postgres + Redis + MinIO)
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: roomard
          POSTGRES_PASSWORD: roomard-dev-password
          POSTGRES_DB: roomard
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U roomard"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
      redis:
        image: redis:7-alpine
        ports: ['6379:6379']
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s
      minio:
        image: minio/minio:latest
        ports: ['9000:9000']
        env:
          MINIO_ROOT_USER: roomard
          MINIO_ROOT_PASSWORD: roomard-dev-secret
        options: >-
          --health-cmd "curl -f http://localhost:9000/minio/health/live"
          --health-interval 10s
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9.15.9 }
      - uses: actions/setup-node@v4
        with:
          node-version: 20.10.0
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Build all packages
        run: pnpm run build
      - name: Run migrations
        env:
          DATABASE_URL: postgres://roomard:roomard-dev-password@localhost:5432/roomard
        run: pnpm --filter @roomard/db run migrate
      - name: Seed database
        env:
          DATABASE_URL: postgres://roomard:roomard-dev-password@localhost:5432/roomard
        run: pnpm --filter @roomard/db run seed
      - name: Run integration tests
        env:
          DATABASE_URL: postgres://roomard:roomard-dev-password@localhost:5432/roomard
          REDIS_URL: redis://localhost:6379
          OBJECT_STORE_ENDPOINT: http://localhost:9000
          OBJECT_STORE_ACCESS_KEY: roomard
          OBJECT_STORE_SECRET_KEY: roomard-dev-secret
        run: pnpm --filter @roomard/db run test

  e2e-tests:
    name: Playwright E2E
    runs-on: ubuntu-latest
    needs: [unit-tests]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9.15.9 }
      - uses: actions/setup-node@v4
        with:
          node-version: 20.10.0
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Start stack via docker compose
        run: docker compose -f docker-compose.yml up -d --wait
      - name: Run migrations & seed
        env:
          DATABASE_URL: postgres://roomard:roomard-dev-password@localhost:5432/roomard
        run: |
          pnpm --filter @roomard/db run migrate
          pnpm --filter @roomard/db run seed
      - name: Build and start services
        run: |
          pnpm run build
          pnpm run dev &
          sleep 30
      - name: Install Playwright browsers
        run: pnpm --filter @roomard/web-e2e exec playwright install --with-deps chromium
      - name: Run Playwright tests
        run: pnpm --filter @roomard/web-e2e test
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: apps/web-e2e/playwright-report

  security-scan:
    name: ZAP baseline scan
    runs-on: ubuntu-latest
    needs: [unit-tests]
    continue-on-error: true
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9.15.9 }
      - uses: actions/setup-node@v4
        with:
          node-version: 20.10.0
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Start stack
        run: docker compose up -d --wait
      - name: ZAP baseline
        uses: zaproxy/action-baseline@v0.12.0
        with:
          target: http://localhost:3000
          fail_action: false
          allow_issue_writing: false

  docker-build:
    name: Build container images
    runs-on: ubuntu-latest
    needs: [unit-tests]
    strategy:
      matrix:
        service: [api-gateway, auth, tenant, guest, capture, brief, exception, audit, ingest, ai-gateway]
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/build-push-action@v6
        with:
          context: .
          file: services/${{ matrix.service }}/Dockerfile
          push: false
          tags: roomard/${{ matrix.service }}:ci
          cache-from: type=gha
          cache-to: type=gha,mode=max
