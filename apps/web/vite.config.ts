import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico'],
      manifest: {
        name: 'Roomard',
        short_name: 'Roomard',
        description: 'AI Guest Memory Engine',
        theme_color: '#0a4a3f',
        background_color: '#0a4a3f',
        display: 'standalone',
        start_url: '/',
        icons: [],
      },
      workbox: {
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /\/api\/v1\/properties\/.+\/briefs\/today$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'briefs-today',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            urlPattern: /\/api\/v1\/guests\/[a-f0-9-]+$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'guests',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: { sourcemap: true },
});
