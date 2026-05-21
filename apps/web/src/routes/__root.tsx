/**
 * Root route — the persistent shell. Contains the header, nav, and an Outlet
 * for nested routes. Redirects to /login if not authenticated.
 */
import { createRootRoute, Outlet, Link, useNavigate, redirect } from '@tanstack/react-router';
import { useEffect } from 'react';

import { useAuthStore } from '../stores/auth.js';

export const Route = createRootRoute({
  component: RootLayout,
  beforeLoad: ({ location }) => {
    const auth = useAuthStore.getState();
    const isLogin = location.pathname === '/login' || location.pathname === '/auth/sso/callback';
    if (!auth.accessToken && !isLogin) {
      throw redirect({ to: '/login', search: { redirect: location.pathname } });
    }
  },
});

function RootLayout() {
  const { principal, logout } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!useAuthStore.getState().accessToken) {
      navigate({ to: '/login' });
    }
  }, [navigate]);

  if (!principal) {
    return <Outlet />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-roomard-500 text-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-xl font-bold tracking-tight">
            Roomard
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link to="/" className="hover:underline">
              Brief
            </Link>
            <Link to="/guests" className="hover:underline">
              Guests
            </Link>
            <Link to="/captures/new" className="hover:underline">
              Capture
            </Link>
            <Link to="/exceptions" className="hover:underline">
              Exceptions
            </Link>
            <Link to="/onboarding" className="hover:underline">
              Set up
            </Link>
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span>{principal.displayName}</span>
            <button
              type="button"
              onClick={() => {
                logout();
                navigate({ to: '/login' });
              }}
              className="hover:underline"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>
      <footer className="text-xs text-roomard-700 text-center py-2">Roomard · v0.1</footer>
    </div>
  );
}
