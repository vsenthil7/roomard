/**
 * Test for the useOfflineReplay hook (CP-66).
 * Renders a trivial component that calls the hook, with the offline-queue
 * functions and apiFetch mocked, and asserts the replay behaviour: success
 * removes the item, failure marks it, maxed-out items are skipped, and the
 * offline state is a no-op.
 */
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { apiFetchMock, listMock, removeMock, markMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  listMock: vi.fn(),
  removeMock: vi.fn(),
  markMock: vi.fn(),
}));
vi.mock('../src/lib/api.js', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../src/lib/api.js');
  return { ...actual, apiFetch: apiFetchMock };
});
vi.mock('../src/lib/offline-queue.js', () => ({
  listQueuedCaptures: listMock,
  removeCapture: removeMock,
  markCaptureFailure: markMock,
}));

import { useOfflineReplay } from '../src/hooks/useOfflineReplay';

function Harness(): null {
  useOfflineReplay();
  return null;
}

function queuedItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'q1',
    tenantId: 't1',
    propertyId: 'p1',
    guestId: 'g1',
    file: new Blob(['x'], { type: 'image/jpeg' }),
    contentType: 'image/jpeg',
    capturedAt: '2026-05-20T09:00:00.000Z',
    notes: 'note',
    createdAt: '2026-05-20T09:00:00.000Z',
    attempts: 0,
    ...overrides,
  };
}

describe('useOfflineReplay', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    listMock.mockReset();
    removeMock.mockReset();
    markMock.mockReset();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('replays a queued capture and removes it on success', async () => {
    listMock.mockResolvedValue([queuedItem()]);
    apiFetchMock.mockResolvedValue({ evidenceId: 'ev1' });
    render(<Harness />);
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith('/v1/captures', expect.objectContaining({ method: 'POST' }));
    });
    await waitFor(() => expect(removeMock).toHaveBeenCalledWith('q1'));
    expect(markMock).not.toHaveBeenCalled();
  });

  it('marks the capture as failed when the upload throws', async () => {
    listMock.mockResolvedValue([queuedItem()]);
    apiFetchMock.mockRejectedValue(new Error('still offline'));
    render(<Harness />);
    await waitFor(() => {
      expect(markMock).toHaveBeenCalledWith('q1', 'still offline');
    });
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('skips items that have already hit the max attempts', async () => {
    listMock.mockResolvedValue([queuedItem({ attempts: 5 })]);
    render(<Harness />);
    // Give the effect a tick to run.
    await new Promise((r) => setTimeout(r, 10));
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(removeMock).not.toHaveBeenCalled();
    expect(markMock).not.toHaveBeenCalled();
  });

  it('is a no-op when the device is offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    listMock.mockResolvedValue([queuedItem()]);
    render(<Harness />);
    await new Promise((r) => setTimeout(r, 10));
    expect(listMock).not.toHaveBeenCalled();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});
