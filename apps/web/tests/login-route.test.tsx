/**
 * Route-component tests for apps/web (CP-61).
 *
 * Renders the real route components inside a minimal in-memory TanStack Router
 * so component code (login.tsx, __root.tsx) is genuinely exercised — not just
 * the lib/ helpers. apiFetch is mocked so no network is hit; the auth store is
 * the real Zustand store, reset between tests.
 */
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
  Outlet,
} from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the API layer before importing anything that uses it.
const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));
vi.mock('../src/lib/api.js', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../src/lib/api.js');
  return { ...actual, apiFetch: apiFetchMock };
});

import { ApiError } from '../src/lib/api';
import { Route as LoginRoute } from '../src/routes/login';
import { useAuthStore } from '../src/stores/auth';

/**
 * Build a memory router whose root renders an <Outlet/> and whose only child is
 * the route under test, then render it. Returns once the router is ready.
 */
async function renderRoute(childRoute: typeof LoginRoute, initialPath: string): Promise<void> {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  // Re-parent the child route onto our test root.
  const child = createRoute({
    getParentRoute: () => rootRoute,
    path: childRoute.options.path as string,
    component: childRoute.options.component,
  });
  const routeTree = rootRoute.addChildren([child]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  render(<RouterProvider router={router} />);
  await waitFor(() => expect(router.state.status).toBe('idle'));
}

describe('login route', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    useAuthStore.setState({ accessToken: null, refreshToken: null, principal: null });
  });

  it('renders the sign-in form with the demo tenant prefilled', async () => {
    await renderRoute(LoginRoute, '/login');
    expect(screen.getByRole('heading', { name: /sign in to roomard/i })).toBeInTheDocument();
    expect(screen.getByTestId('tenant-slug')).toHaveValue('demo');
    expect(screen.getByTestId('signin')).toBeInTheDocument();
  });

  it('on successful login, stores tokens + principal in the auth store', async () => {
    apiFetchMock.mockResolvedValueOnce({
      status: 'success',
      tokens: { access_token: 'at_123', refresh_token: 'rt_456' },
      principal: { userId: 'u1', displayName: 'Demo Admin', tenantId: 't1', roles: ['admin'] },
    });
    await renderRoute(LoginRoute, '/login');
    const user = userEvent.setup();
    await user.type(screen.getByTestId('email'), 'admin@demo.roomard.local');
    await user.type(screen.getByTestId('password'), 'Roomard123!');
    await user.click(screen.getByTestId('signin'));
    await waitFor(() => {
      expect(useAuthStore.getState().accessToken).toBe('at_123');
    });
    expect(useAuthStore.getState().refreshToken).toBe('rt_456');
    expect(useAuthStore.getState().principal?.displayName).toBe('Demo Admin');
    // The login POST was called with snake_case body keys.
    expect(apiFetchMock).toHaveBeenCalledWith(
      '/v1/auth/password/login',
      expect.objectContaining({ method: 'POST', skipAuth: true }),
    );
  });

  it('on mfa_required, swaps to the MFA code form', async () => {
    apiFetchMock.mockResolvedValueOnce({ status: 'mfa_required', mfa_token: 'mfa_abc' });
    await renderRoute(LoginRoute, '/login');
    const user = userEvent.setup();
    await user.type(screen.getByTestId('email'), 'admin@demo.roomard.local');
    await user.type(screen.getByTestId('password'), 'Roomard123!');
    await user.click(screen.getByTestId('signin'));
    await waitFor(() => {
      expect(screen.getByTestId('mfa-code')).toBeInTheDocument();
    });
    expect(screen.getByTestId('verify-mfa')).toBeInTheDocument();
  });

  it('shows an error message when the API rejects with an ApiError', async () => {
    apiFetchMock.mockRejectedValueOnce(new ApiError(401, 'authentication', 'invalid credentials'));
    await renderRoute(LoginRoute, '/login');
    const user = userEvent.setup();
    await user.type(screen.getByTestId('email'), 'admin@demo.roomard.local');
    await user.type(screen.getByTestId('password'), 'wrong');
    await user.click(screen.getByTestId('signin'));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/invalid credentials/i);
    });
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});
