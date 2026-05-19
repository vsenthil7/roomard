/**
 * useOfflineReplay — when the device comes back online, replay any queued
 * captures sequentially. Limits to 5 attempts per item; logs failures.
 */
import { useEffect } from 'react';

import { apiFetch } from '../lib/api.js';
import { listQueuedCaptures, markCaptureFailure, removeCapture } from '../lib/offline-queue.js';

const MAX_ATTEMPTS = 5;

export function useOfflineReplay(): void {
  useEffect(() => {
    const replay = async (): Promise<void> => {
      if (!navigator.onLine) return;
      const queued = await listQueuedCaptures();
      for (const q of queued) {
        if (q.attempts >= MAX_ATTEMPTS) continue;
        try {
          const fd = new FormData();
          fd.append('file', q.file, 'capture.jpg');
          fd.append('property_id', q.propertyId);
          if (q.guestId) fd.append('guest_id', q.guestId);
          fd.append('captured_at', q.capturedAt);
          fd.append('capture_surface', 'mobile_camera');
          if (q.notes) fd.append('notes', q.notes);
          await apiFetch('/v1/captures', { method: 'POST', body: fd });
          await removeCapture(q.id);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'replay failed';
          await markCaptureFailure(q.id, message);
        }
      }
    };
    window.addEventListener('online', replay);
    replay();
    return () => window.removeEventListener('online', replay);
  }, []);
}
