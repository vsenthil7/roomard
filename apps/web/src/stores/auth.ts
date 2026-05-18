/**
 * Auth store — holds access + refresh tokens and the decoded principal.
 * Persisted to localStorage so the user stays signed in across page reloads.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Principal {
  userId: string;
  tenantId: string;
  email: string;
  displayName: string;
  roles: string[];
  permissions: string[];
  mfaVerified: boolean;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  principal: Principal | null;
  setTokens: (access: string, refresh: string) => void;
  setPrincipal: (p: Principal | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      principal: null,
      setTokens: (access, refresh) => set({ accessToken: access, refreshToken: refresh }),
      setPrincipal: (p) => set({ principal: p }),
      logout: () => set({ accessToken: null, refreshToken: null, principal: null }),
    }),
    { name: 'roomard.auth' },
  ),
);
