# ADR 009: Offline-first capture via IndexedDB queue

**Status:** Accepted · **Date:** 2026-05-14

## Context

Front-desk staff capture cards in places where Wi-Fi is unreliable — back of
house, in the lobby during peak check-in, on a smoke break. A capture that
fails because the network blipped is the worst possible UX: it's exactly the
moment when discarding the photo costs an irrecoverable preference.

Concurrent constraints:

- Storage limits in mobile browsers vary
- Service worker caching of API responses needs to be careful — stale-while-
  revalidate on guest detail is fine; on a write request it would be wrong
- The offline experience must degrade gracefully — read the cached brief and
  recent guests, but don't pretend captures have been processed when they
  haven't

## Decision

A purpose-built IndexedDB queue (`@roomard/web` `lib/offline-queue.ts`) for
captures only.

- On submit, if `navigator.onLine` is false or the POST returns a 5xx, the
  capture is stored with `{ id, file: Blob, propertyId, guestId?, notes?,
  capturedAt, attempts, createdAt }`.
- The `useOfflineReplay` hook fires on the `online` event and on app mount,
  draining the queue with one POST per item.
- Each item has an attempt counter, capped at 5; after that the user must
  manually retry from a (planned) "queued captures" pane.
- Successful uploads are removed from the queue.

The service worker caches read-only API responses with stale-while-revalidate
strategy and a short max-age — never POST/PATCH/DELETE.

Conflict resolution: server wins for any state changed server-side after the
offline capture. The queued capture is still uploaded as a new `evidence` row;
the OCR pipeline runs normally; preferences either get reinforced or land in
the exception queue if confidence is low. We expand on this in Sprint 5.

## Consequences

- **Pro:** front desk never loses a capture to a network blip.
- **Pro:** queue is observable in dev tools; reproducible bugs.
- **Pro:** the model (upload as evidence, normal pipeline) means offline and
  online flows differ only at the queue layer.
- **Con:** if the device storage fills up, captures may be evicted by the
  browser. Mitigation: we cap the queue at 50 items and surface a warning when
  more than 30 are queued.
- **Con:** conflict resolution is server-wins for MVP. A more sophisticated
  CRDT-like merge is possible but unnecessary for the workload (captures
  almost never conflict with concurrent edits in practice).

## Alternatives considered

- **Background Sync API:** support is patchy (Safari doesn't ship it). Could
  layer in as a progressive enhancement later.
- **HTTP retry only:** rejected. A page reload between attempts would lose
  the file.
