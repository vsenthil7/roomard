/**
 * Route-component test for index.tsx — the daily brief / home route (CP-63).
 * Exercises the properties query, the auto-select-first-property side effect,
 * the brief query render (stats + items), and the no-brief error state.
 */
import { screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));
vi.mock('../src/lib/api.js', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../src/lib/api.js');
  return { ...actual, apiFetch: apiFetchMock };
});

import { Route as IndexRoute } from '../src/routes/index';

import { renderRouteComponent } from './helpers/renderRoute';

const brief = {
  brief: {
    id: 'b1',
    brief_date: '2026-05-20',
    total_arrivals: 3,
    vip_count: 1,
    attention_count: 1,
    generated_at: '2026-05-20T06:00:00.000Z',
  },
  items: [
    {
      id: 'bi-1',
      priority: 'vip',
      display_name: 'Ada Lovelace',
      room_number: '412',
      arrival_at: '2026-05-20T14:00:00.000Z',
      say_this_suggestion: 'Welcome back, Ms Lovelace.',
      preference_callouts: ['High floor room prepared'],
      recent_issues: [],
    },
  ],
};

describe('today brief (index) route', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    localStorage.clear();
  });

  it('auto-selects the first property and renders the brief stats + items', async () => {
    apiFetchMock.mockImplementation((url: string) => {
      if (url === '/v1/properties') {
        return Promise.resolve({ items: [{ id: 'p1', name: 'Demo Hotel' }] });
      }
      if (url.includes('/briefs/today')) {
        return Promise.resolve(brief);
      }
      return Promise.resolve({});
    });
    await renderRouteComponent(IndexRoute, '/');
    await waitFor(() => {
      expect(screen.getByTestId('brief-items')).toBeInTheDocument();
    });
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText(/Welcome back, Ms Lovelace/)).toBeInTheDocument();
    expect(screen.getByText('Total arrivals')).toBeInTheDocument();
    // The brief query targeted the auto-selected property.
    expect(apiFetchMock).toHaveBeenCalledWith('/v1/properties/p1/briefs/today');
  });

  it('shows the no-brief error state when the brief query fails', async () => {
    apiFetchMock.mockImplementation((url: string) => {
      if (url === '/v1/properties') {
        return Promise.resolve({ items: [{ id: 'p1', name: 'Demo Hotel' }] });
      }
      if (url.includes('/briefs/today')) {
        return Promise.reject(new Error('not found'));
      }
      return Promise.resolve({});
    });
    await renderRouteComponent(IndexRoute, '/');
    await waitFor(() => {
      expect(screen.getByText(/no brief for today yet/i)).toBeInTheDocument();
    });
  });
});
