{
  "name": "roomard",
  "version": "0.1.0",
  "private": true,
  "description": "Roomard — AI Guest Memory Engine for Mid-Tier Hotel Groups",
  "license": "UNLICENSED",
  "engines": {
    "node": ">=20.10.0",
    "pnpm": ">=9.0.0"
  },
  "packageManager": "pnpm@9.12.0",
  "workspaces": [
    "apps/*",
    "packages/*",
    "services/*"
  ],
  "scripts": {
    "build": "pnpm -r build",
    "dev": "pnpm -r --parallel dev",
    "lint": "eslint . --max-warnings=0",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "test:unit": "pnpm -r test:unit",
    "test:integration": "pnpm -r test:integration",
    "test:e2e": "pnpm --filter @roomard/web-e2e test",
    "test:coverage": "pnpm -r test:coverage",
    "db:migrate": "pnpm --filter @roomard/db migrate",
    "db:seed": "pnpm --filter @roomard/db seed",
    "db:reset": "pnpm --filter @roomard/db reset",
    "up": "docker compose up -d",
    "down": "docker compose down",
    "logs": "docker compose logs -f",
    "clean": "pnpm -r exec rm -rf dist node_modules .turbo",
    "prepare": "husky install || true"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint": "^9.10.0",
    "eslint-config-prettier": "^9.1.0",
    "eslint-plugin-import": "^2.30.0",
    "husky": "^9.1.0",
    "lint-staged": "^15.2.0",
    "prettier": "^3.3.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  },
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,yml,yaml}": ["prettier --write"]
  }
}
