/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    globals: true,
    coverage: { provider: 'v8', reporter: ['text', 'lcov'], include: ['src/**/*.{ts,tsx}'] },
  },
});
