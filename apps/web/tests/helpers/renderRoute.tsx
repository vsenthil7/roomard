/**
 * Shared render harness for route-component tests (CP-62).
 *
 * Mounts a real route component inside a minimal in-memory TanStack Router with
 * a QueryClientProvider, so components using useQuery/useMutation and <Link>
 * render for real. Sibling "stub" paths can be registered so any <Link to=...>
 * inside the component resolves instead of throwing.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
  Outlet,
} from '@tanstack/react-router';
import { render, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { expect } from 'vitest';

interface RouteLike {
  options: { path?: unknown; component?: unknown };
}

/**
 * Render a route component under test.
 * @param routeUnderTest the real exported `Route` object (uses its path + component)
 * @param initialPath    the memory-history entry to start at
 * @param stubPaths      extra paths to register so internal <Link> targets resolve
 */
export async function renderRouteComponent(
  routeUnderTest: RouteLike,
  initialPath: string,
  stubPaths: string[] = [],
): Promise<void> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const child = createRoute({
    getParentRoute: () => rootRoute,
    path: routeUnderTest.options.path as string,
    component: routeUnderTest.options.component as () => ReactElement,
  });
  const stubs = stubPaths.map((p) =>
    createRoute({ getParentRoute: () => rootRoute, path: p, component: () => <div /> }),
  );
  const routeTree = rootRoute.addChildren([child, ...stubs]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(router.state.status).toBe('idle'));
}
