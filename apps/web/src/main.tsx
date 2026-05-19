/**
 * App entrypoint. Wires up:
 *   - QueryClient with sensible defaults (1-minute staleTime, 5-min cache, retry on 5xx only)
 *   - TanStack Router (file-based via routeTree)
 *   - Tailwind CSS
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import React from 'react';
import ReactDOM from 'react-dom/client';

import { routeTree } from './routes/routeTree.js';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => {
        const status = (error as { status?: number }).status;
        if (status && status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
