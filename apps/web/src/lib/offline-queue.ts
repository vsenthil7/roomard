/**
 * Offline capture queue.
 *
 * When the device is offline (or the upload fails), card captures are stored
 * in IndexedDB and replayed on next online + auth window. The MVP uses
 * server-wins on conflict — guests/preferences modified server-side after
 * the offline capture override the queued mutation; the queued capture is
 * still uploaded as a new evidence row regardless.
 */
import { openDB, type IDBPDatabase } from 'idb';

interface RoomardDB {
  captures: {
    key: string;
    value: {
      id: string;
      tenantId: string;
      propertyId: string;
      guestId?: string;
      file: Blob;
      contentType: string;
      capturedAt: string;
      notes?: string;
      createdAt: string;
      attempts: number;
      lastError?: string;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<RoomardDB>> | null = null;

function db(): Promise<IDBPDatabase<RoomardDB>> {
  if (!dbPromise) {
    dbPromise = openDB<RoomardDB>('roomard', 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('captures')) {
          database.createObjectStore('captures', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export async function enqueueCapture(item: Omit<RoomardDB['captures']['value'], 'id' | 'createdAt' | 'attempts'>): Promise<string> {
  const id = crypto.randomUUID();
  const full = { ...item, id, createdAt: new Date().toISOString(), attempts: 0 };
  const conn = await db();
  await conn.put('captures', full);
  return id;
}

export async function listQueuedCaptures(): Promise<RoomardDB['captures']['value'][]> {
  const conn = await db();
  return conn.getAll('captures');
}

export async function removeCapture(id: string): Promise<void> {
  const conn = await db();
  await conn.delete('captures', id);
}

export async function markCaptureFailure(id: string, errMessage: string): Promise<void> {
  const conn = await db();
  const row = await conn.get('captures', id);
  if (!row) return;
  row.attempts += 1;
  row.lastError = errMessage;
  await conn.put('captures', row);
}
