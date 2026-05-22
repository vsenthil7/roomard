/**
 * Route-component test for guests.$id.tsx (CP-63).
 * Uses the REAL route tree so Route.useParams() resolves and the __root layout
 * renders (auth store seeded so beforeLoad doesn't redirect). apiFetch is mocked
 * per-URL to drive the profile / preferences / history / say-this queries.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));
vi.mock('../src/lib/api.js', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../src/lib/api.js');
  return { ...actual, apiFetch: apiFetchMock };
});

import { routeTree } from '../src/routes/routeTree';
import { useAuthStore } from '../src/stores/auth';

import { renderRealTree } from './helpers/renderRoute';

function routeApi(url: string): unknown {
  if (url === '/v1/guests/g-1') {
    return {
      id: 'g-1',
      display_name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone_e164: '+447700900000',
      home_country_code: 'GB',
      loyalty_tiers: {},
      attention_flags: [],
    };
  }
  if (url === '/v1/guests/g-1/preferences') {
    return {
      items: [
        {
          id: 'pref-1',
          kind: 'room_position',
          polarity: 'likes',
          detail: 'High floor, away from lift',
          confidence: { value: 0.92, calibration: 'high' },
          reinforcement_count: 3,
          last_reinforced_at: '2026-05-01T00:00:00.000Z',
        },
      ],
    };
  }
  if (url === '/v1/guests/g-1/history') {
    return {
      stays: [
        {
          id: 'stay-1',
          property_id: 'p1',
          arrival_at: '2026-04-01T14:00:00.000Z',
          departure_at: '2026-04-03T11:00:00.000Z',
          status: 'checked_out',
          room_number: '412',
        },
      ],
      issues: [],
    };
  }
  if (url === '/v1/guests/g-1/say-this') {
    return {
      greeting: 'Welcome back, Ms Lovelace.',
      context: 'Returning guest',
      preference_callouts: ['High floor room prepared'],
      model_id: 'ernie-4.5-mock',
    };
  }
  return {};
}

describe('guest detail route', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((url: string) => Promise.resolve(routeApi(url)));
    // Seed auth so __root beforeLoad does not redirect to /login.
    useAuthStore.setState({
      accessToken: 'at',
      refreshToken: 'rt',
      principal: {
        userId: 'u1',
        tenantId: 't1',
        email: 'admin@demo',
        displayName: 'Demo Admin',
        roles: ['admin'],
        permissions: ['*'],
        mfaVerified: true,
      },
    });
  });

  it('renders the guest profile, preferences and stay history', async () => {
    await renderRealTree(routeTree, '/guests/g-1');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument();
    });
    expect(screen.getByText(/ada@example.com/)).toBeInTheDocument();
    expect(screen.getByTestId('preference-list')).toBeInTheDocument();
    expect(screen.getByText(/High floor, away from lift/)).toBeInTheDocument();
    expect(screen.getByText(/Room 412/)).toBeInTheDocument();
  });

  it('Generate "Say this" fetches and renders the suggestion card', async () => {
    await renderRealTree(routeTree, '/guests/g-1');
    await waitFor(() => expect(screen.getByTestId('say-this-button')).toBeInTheDocument());
    const user = userEvent.setup();
    await user.click(screen.getByTestId('say-this-button'));
    await waitFor(() => {
      expect(screen.getByTestId('say-this-card')).toBeInTheDocument();
    });
    expect(screen.getByText(/Welcome back, Ms Lovelace/)).toBeInTheDocument();
    expect(screen.getByText(/ernie-4.5-mock/)).toBeInTheDocument();
  });
});
