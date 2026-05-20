/**
 * Tests for the offline capture queue (apps/web/src/lib/offline-queue.ts).
 *
 * Uses fake-indexeddb to provide a real IndexedDB implementation in the
 * happy-dom test environment (happy-dom has no IndexedDB of its own). The
 * module memoises its DB connection at module scope, so we clear the object
 * store between tests rather than re-opening.
 */
import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { describe, it, expect, beforeEach } from 'vitest';

import {
  enqueueCapture,
  listQueuedCaptures,
  removeCapture,
  markCaptureFailure,
} from '../src/lib/offline-queue';

const baseItem = {
  tenantId: 't1',
  propertyId: 'p1',
  guestId: 'g1',
  file: new Blob(['fake-image-bytes'], { type: 'image/jpeg' }),
  contentType: 'image/jpeg',
  capturedAt: '2026-05-20T09:00:00.000Z',
  notes: 'check-in card',
};

async function clearStore(): Promise<void> {
  const conn = await openDB('roomard', 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('captures')) {
        db.createObjectStore('captures', { keyPath: 'id' });
      }
    },
  });
  await conn.clear('captures');
  conn.close();
}

describe('offline-queue', () => {
  beforeEach(async () => {
    await clearStore();
  });

  it('enqueueCapture stores an item and returns a generated id', async () => {
    const id = await enqueueCapture(baseItem);
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    const all = await listQueuedCaptures();
    expect(all).toHaveLength(1);
    const first = all[0];
    expect(first).toBeDefined();
    expect(first!.id).toBe(id);
    expect(first!.tenantId).toBe('t1');
    expect(first!.attempts).toBe(0);
    expect(typeof first!.createdAt).toBe('string');
  });

  it('listQueuedCaptures returns all queued items', async () => {
    await enqueueCapture(baseItem);
    await enqueueCapture({ ...baseItem, propertyId: 'p2' });
    const all = await listQueuedCaptures();
    expect(all).toHaveLength(2);
    expect(all.map((c) => c.propertyId).sort()).toEqual(['p1', 'p2']);
  });

  it('removeCapture deletes a queued item by id', async () => {
    const id = await enqueueCapture(baseItem);
    expect(await listQueuedCaptures()).toHaveLength(1);
    await removeCapture(id);
    expect(await listQueuedCaptures()).toHaveLength(0);
  });

  it('markCaptureFailure increments attempts and records the error', async () => {
    const id = await enqueueCapture(baseItem);
    await markCaptureFailure(id, 'network timeout');
    const [row] = await listQueuedCaptures();
    expect(row).toBeDefined();
    expect(row!.attempts).toBe(1);
    expect(row!.lastError).toBe('network timeout');
    // A second failure increments again.
    await markCaptureFailure(id, 'still down');
    const [row2] = await listQueuedCaptures();
    expect(row2).toBeDefined();
    expect(row2!.attempts).toBe(2);
    expect(row2!.lastError).toBe('still down');
  });

  it('markCaptureFailure is a no-op for an unknown id', async () => {
    await expect(markCaptureFailure('does-not-exist', 'err')).resolves.toBeUndefined();
    expect(await listQueuedCaptures()).toHaveLength(0);
  });
});
