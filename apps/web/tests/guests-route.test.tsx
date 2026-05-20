/**
 * Route-component test for guests.index.tsx (CP-62).
 * Exercises the useQuery list render, the empty state, and the debounced search
 * re-query. The internal <Link to="/guests/$id"> resolves via a stub path.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));
vi.mock('../src/lib/api.js', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../src/lib/api.js');
  return { ...actual, apiFetch: apiFetchMock };
});

import { Route as GuestsRoute } from '../src/routes/guests.index';

import { renderRouteComponent } from './helpers/renderRoute';

const guest = {
  id: 'g-1',
  displayName: 'Ada Lovelace',
  email: 'ada@example.com',
  activePreferenceCount: 4,
  upcomingArrivalAt: '2026-06-01T14:00:00.000Z',
};

describe('guests list route', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it('renders the guest list from the query', async () => {
    apiFetchMock.mockResolvedValue({ items: [guest], page: { hasMore: false, nextCursor: null } });
    await renderRouteComponent(GuestsRoute, '/guests', ['/guests/$id']);
    await waitFor(() => {
      expect(screen.getByTestId('guest-list')).toBeInTheDocument();
    });
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByText(/4 preferences/)).toBeInTheDocument();
  });

  it('shows the no-guests-match row when the list is empty', async () => {
    apiFetchMock.mockResolvedValue({ items: [], page: { hasMore: false, nextCursor: null } });
    await renderRouteComponent(GuestsRoute, '/guests', ['/guests/$id']);
    await waitFor(() => {
      expect(screen.getByText(/no guests match/i)).toBeInTheDocument();
    });
  });

  it('typing in the search box debounces and re-queries with q=', async () => {
    apiFetchMock.mockResolvedValue({ items: [], page: { hasMore: false, nextCursor: null } });
    await renderRouteComponent(GuestsRoute, '/guests', ['/guests/$id']);
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    const user = userEvent.setup();
    await user.type(screen.getByTestId('guest-search'), 'ada');
    await waitFor(
      () => {
        expect(apiFetchMock).toHaveBeenCalledWith(expect.stringContaining('q=ada'));
      },
      { timeout: 2000 },
    );
  });
});
