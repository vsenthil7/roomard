/**
 * Route-component test for prep-cards.tsx (CP-65).
 * Exercises the properties auto-select, the ready/completed card split, the
 * two-tap complete flow (Mark complete → Confirm complete fires the mutation),
 * and the empty state.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));
vi.mock('../src/lib/api.js', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../src/lib/api.js');
  return { ...actual, apiFetch: apiFetchMock };
});

import { Route as PrepCardsRoute } from '../src/routes/prep-cards';

import { renderRouteComponent } from './helpers/renderRoute';

const readyCard = {
  id: 'pc-1',
  stay_id: 's1',
  guest_id: 'g1',
  display_name: 'Ada Lovelace',
  room_number: '412',
  arrival_at: '2026-05-21T14:00:00.000Z',
  prep_items: ['High floor room', 'Extra pillows'],
  attention_flags: ['vip'],
  warm_note: 'Welcome back, Ms Lovelace.',
  status: 'ready',
  completed_at: null,
};
const completedCard = {
  ...readyCard,
  id: 'pc-2',
  display_name: 'Alan Turing',
  status: 'completed',
  completed_at: '2026-05-21T09:00:00.000Z',
};

describe('prep-cards route', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    localStorage.clear();
  });

  it('auto-selects the property and renders ready + completed sections', async () => {
    apiFetchMock.mockImplementation((url: string) => {
      if (url === '/v1/properties') return Promise.resolve({ items: [{ id: 'p1', name: 'Demo Hotel' }] });
      if (url.includes('/prep-cards/')) {
        return Promise.resolve({ items: [readyCard, completedCard] });
      }
      return Promise.resolve({});
    });
    await renderRouteComponent(PrepCardsRoute, '/prep-cards', ['/guests/$id']);
    await waitFor(() => {
      expect(screen.getByTestId('prep-cards-ready')).toBeInTheDocument();
    });
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    // The warm note is wrapped in curly quotes in the markup, so match loosely.
    expect(screen.getByText(/Welcome back, Ms Lovelace/)).toBeInTheDocument();
    expect(screen.getByTestId('prep-items')).toBeInTheDocument();
    expect(screen.getByTestId('prep-cards-completed')).toBeInTheDocument();
    expect(screen.getByText('Alan Turing')).toBeInTheDocument();
  });

  it('two-tap complete: Mark complete then Confirm fires the complete mutation', async () => {
    apiFetchMock.mockImplementation((url: string) => {
      if (url === '/v1/properties') return Promise.resolve({ items: [{ id: 'p1', name: 'Demo Hotel' }] });
      if (url.includes('/prep-cards/') && !url.includes('/complete')) {
        return Promise.resolve({ items: [readyCard] });
      }
      if (url.includes('/complete')) return Promise.resolve({ ok: true });
      return Promise.resolve({});
    });
    await renderRouteComponent(PrepCardsRoute, '/prep-cards', ['/guests/$id']);
    await waitFor(() => expect(screen.getByTestId('prep-complete-btn')).toBeInTheDocument());
    const user = userEvent.setup();
    // First tap expands to the confirm + notes state.
    await user.click(screen.getByTestId('prep-complete-btn'));
    await waitFor(() => expect(screen.getByTestId('prep-notes')).toBeInTheDocument());
    expect(screen.getByText('Confirm complete')).toBeInTheDocument();
    // Second tap fires the mutation.
    apiFetchMock.mockClear();
    await user.click(screen.getByTestId('prep-complete-btn'));
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        '/v1/prep-cards/pc-1/complete',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('shows the empty state when there are no cards for the date', async () => {
    apiFetchMock.mockImplementation((url: string) => {
      if (url === '/v1/properties') return Promise.resolve({ items: [{ id: 'p1', name: 'Demo Hotel' }] });
      if (url.includes('/prep-cards/')) return Promise.resolve({ items: [] });
      return Promise.resolve({});
    });
    await renderRouteComponent(PrepCardsRoute, '/prep-cards', ['/guests/$id']);
    await waitFor(() => {
      expect(screen.getByText(/no prep cards for/i)).toBeInTheDocument();
    });
  });
});
