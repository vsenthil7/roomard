/**
 * Route-component test for exceptions.tsx (CP-62).
 * Exercises the useQuery list render, the status-tab switching, the empty
 * state, and the resolve mutation (useMutation + queryClient.invalidate).
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));
vi.mock('../src/lib/api.js', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../src/lib/api.js');
  return { ...actual, apiFetch: apiFetchMock };
});

import { Route as ExceptionsRoute } from '../src/routes/exceptions';

import { renderRouteComponent } from './helpers/renderRoute';

const openItem = {
  id: 'ex-1',
  kind: 'review_link_ambiguous',
  status: 'open',
  severity: 3,
  title: 'Ambiguous review link',
  description: 'A review could match two guests.',
  created_at: '2026-05-20T08:00:00.000Z',
};

describe('exceptions route', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it('renders the open exceptions list from the query', async () => {
    apiFetchMock.mockResolvedValue({ items: [openItem] });
    await renderRouteComponent(ExceptionsRoute, '/exceptions');
    await waitFor(() => {
      expect(screen.getByTestId('exception-list')).toBeInTheDocument();
    });
    expect(screen.getByText('Ambiguous review link')).toBeInTheDocument();
    expect(screen.getByText(/SEV 3/)).toBeInTheDocument();
  });

  it('shows the empty state when there are no items', async () => {
    apiFetchMock.mockResolvedValue({ items: [] });
    await renderRouteComponent(ExceptionsRoute, '/exceptions');
    await waitFor(() => {
      expect(screen.getByText(/no exceptions in this state/i)).toBeInTheDocument();
    });
  });

  it('switching to the resolved tab re-queries with that status', async () => {
    apiFetchMock.mockResolvedValue({ items: [] });
    await renderRouteComponent(ExceptionsRoute, '/exceptions');
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    const user = userEvent.setup();
    await user.click(screen.getByTestId('tab-resolved'));
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(expect.stringContaining('status=resolved'));
    });
  });

  it('clicking Resolve fires a PATCH mutation for that item', async () => {
    apiFetchMock.mockResolvedValue({ items: [openItem] });
    await renderRouteComponent(ExceptionsRoute, '/exceptions');
    await waitFor(() => expect(screen.getByTestId('resolve-ex-1')).toBeInTheDocument());
    apiFetchMock.mockClear();
    apiFetchMock.mockResolvedValue({});
    const user = userEvent.setup();
    await user.click(screen.getByTestId('resolve-ex-1'));
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        '/v1/exceptions/ex-1',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });
});
