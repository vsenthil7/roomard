/**
 * Route-component test for captures.new.tsx (CP-65).
 * Exercises the property/guest selects, the file-upload validation, the
 * online success path (result card with extracted preferences), and the
 * offline-queue fallback when the upload fails with a 5xx.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { apiFetchMock, enqueueMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  enqueueMock: vi.fn(),
}));
vi.mock('../src/lib/api.js', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../src/lib/api.js');
  return { ...actual, apiFetch: apiFetchMock };
});
vi.mock('../src/lib/offline-queue.js', () => ({
  enqueueCapture: enqueueMock,
}));

import { ApiError } from '../src/lib/api';
import { Route as CaptureRoute } from '../src/routes/captures.new';
import { useAuthStore } from '../src/stores/auth';

import { renderRouteComponent } from './helpers/renderRoute';

function makeFile(): File {
  return new File(['fake-image-bytes'], 'card.jpg', { type: 'image/jpeg' });
}

describe('captures.new route', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    enqueueMock.mockReset();
    localStorage.clear();
    useAuthStore.setState({
      accessToken: 'at',
      refreshToken: 'rt',
      principal: {
        userId: 'u1',
        tenantId: 't1',
        email: 'a@b',
        displayName: 'Admin',
        roles: ['admin'],
        permissions: ['*'],
        mfaVerified: true,
      },
    });
    // navigator.onLine defaults to true in happy-dom.
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('renders the capture form with property + guest selects populated', async () => {
    apiFetchMock.mockImplementation((url: string) => {
      if (url === '/v1/properties') return Promise.resolve({ items: [{ id: 'p1', name: 'Demo Hotel' }] });
      if (url === '/v1/guests') return Promise.resolve({ items: [{ id: 'g1', display_name: 'Ada Lovelace' }] });
      return Promise.resolve({});
    });
    await renderRouteComponent(CaptureRoute, '/captures/new');
    await waitFor(() => {
      expect(screen.getByText('Demo Hotel')).toBeInTheDocument();
    });
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    // Submit is disabled until a file is attached.
    expect(screen.getByTestId('capture-submit')).toBeDisabled();
  });

  it('uploads online and shows the accepted result card with preferences', async () => {
    apiFetchMock.mockImplementation((url: string) => {
      if (url === '/v1/properties') return Promise.resolve({ items: [{ id: 'p1', name: 'Demo Hotel' }] });
      if (url === '/v1/guests') return Promise.resolve({ items: [] });
      if (url === '/v1/captures') {
        // Snake_case to match the real API contract (G-53).
        return Promise.resolve({
          evidence_id: 'ev1',
          status: 'accepted',
          confidence: { value: 0.91 },
          extracted_preferences: [
            { kind: 'room_position', polarity: 'likes', detail: 'High floor', confidence: 0.9 },
          ],
        });
      }
      return Promise.resolve({});
    });
    await renderRouteComponent(CaptureRoute, '/captures/new');
    await waitFor(() => expect(screen.getByText('Demo Hotel')).toBeInTheDocument());
    const user = userEvent.setup();
    await user.selectOptions(screen.getByTestId('capture-property'), 'p1');
    await user.upload(screen.getByTestId('capture-file'), makeFile());
    await user.click(screen.getByTestId('capture-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('capture-result')).toBeInTheDocument();
    });
    expect(screen.getByText(/Capture accepted/)).toBeInTheDocument();
    expect(screen.getByText('High floor')).toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenCalledWith('/v1/captures', expect.objectContaining({ method: 'POST' }));
  });

  it('shows a validation error when submitting without a photo', async () => {
    apiFetchMock.mockResolvedValue({ items: [{ id: 'p1', name: 'Demo Hotel' }] });
    await renderRouteComponent(CaptureRoute, '/captures/new');
    await waitFor(() => expect(screen.getByText('Demo Hotel')).toBeInTheDocument());
    const user = userEvent.setup();
    await user.selectOptions(screen.getByTestId('capture-property'), 'p1');
    // Submit is disabled without a file; assert it stays disabled (cannot submit).
    expect(screen.getByTestId('capture-submit')).toBeDisabled();
  });

  it('queues the capture offline when the upload fails with a 5xx', async () => {
    apiFetchMock.mockImplementation((url: string) => {
      if (url === '/v1/properties') return Promise.resolve({ items: [{ id: 'p1', name: 'Demo Hotel' }] });
      if (url === '/v1/guests') return Promise.resolve({ items: [] });
      if (url === '/v1/captures') return Promise.reject(new ApiError(503, 'unavailable', 'service down'));
      return Promise.resolve({});
    });
    enqueueMock.mockResolvedValue('queued-id');
    await renderRouteComponent(CaptureRoute, '/captures/new');
    await waitFor(() => expect(screen.getByText('Demo Hotel')).toBeInTheDocument());
    const user = userEvent.setup();
    await user.selectOptions(screen.getByTestId('capture-property'), 'p1');
    await user.upload(screen.getByTestId('capture-file'), makeFile());
    await user.click(screen.getByTestId('capture-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('queued-banner')).toBeInTheDocument();
    });
    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({ propertyId: 'p1', tenantId: 't1' }),
    );
  });
});
