import { describe, it, expect, beforeEach } from 'vitest';

import { useAuthStore } from '../src/stores/auth.js';

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.getState().logout();
    localStorage.clear();
  });

  it('initial state is unauthenticated', () => {
    const s = useAuthStore.getState();
    expect(s.accessToken).toBeNull();
    expect(s.principal).toBeNull();
  });

  it('setTokens updates state', () => {
    useAuthStore.getState().setTokens('access-1', 'refresh-1');
    const s = useAuthStore.getState();
    expect(s.accessToken).toBe('access-1');
    expect(s.refreshToken).toBe('refresh-1');
  });

  it('logout clears state', () => {
    useAuthStore.getState().setTokens('a', 'r');
    useAuthStore.getState().setPrincipal({
      userId: 'u1',
      tenantId: 't1',
      email: 'x@y',
      displayName: 'X',
      roles: ['front_desk_agent'],
      permissions: ['guest.read'],
      mfaVerified: false,
    });
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().principal).toBeNull();
  });
});
