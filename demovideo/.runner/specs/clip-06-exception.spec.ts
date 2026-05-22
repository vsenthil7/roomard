/**
 * Clip 06 — UC-23 Exception queue: low-confidence OCR goes to a human, who
 * resolves it. This clip RESOLVES the item live (not just views it).
 *
 * Three beats:
 *   1) TEST CASE  — scene card.
 *   2) SCREEN FLOW — the open queue with the real low-OCR item; a banner explains
 *                    it; the agent clicks Resolve LIVE; then we switch to the
 *                    Resolved tab and see it has moved.
 *   3) LIVE TEST  — assert via the API that the item's status is now 'resolved'.
 *
 * Re-runnable: a fresh open exception is seeded before each recording by the
 * _session/exception.sql helper, so there is always one to resolve.
 */
import { test } from '@playwright/test';
import {
  showSceneCard, showStepBanner, showVerdict, clearBanner, clearOverlay,
  signInAndGetToken, liveCall, highlightAndClick, pause,
  WEB_BASE,
} from './clip-helpers';

test('clip-06-exception', async ({ page, playwright }) => {
  test.setTimeout(150_000);
  const api = await playwright.request.newContext({ ignoreHTTPSErrors: true });

  // ---- BEAT 1 -------------------------------------------------------------
  await showSceneCard(page, {
    step: 'TEST CASE \u00b7 UC-23 \u00b7 RESOLVE A FLAGGED EXCEPTION',
    given: 'OCR read one field on the card below the confidence threshold',
    when: 'Rather than guess, Roomard queued it; an agent reviews and resolves it',
    then: 'The item leaves the open queue and is recorded as resolved (audit-tracked)',
    durationMs: 6_000,
  });
  await clearOverlay(page);

  const token = await signInAndGetToken(page, api);

  // Find the open low-OCR exception we will resolve.
  const before = await liveCall(api, token, 'GET', '/v1/exceptions?status=open&limit=100');
  const openItems = (before.body as { items?: Array<{ id: string; kind: string; title: string }> })?.items ?? [];
  const target = openItems.find((i) => i.kind === 'low_ocr_confidence') ?? openItems[0];
  const targetId = target?.id ?? '';

  // ---- BEAT 2: screen flow, explained, performed LIVE ----------------------
  await page.goto(`${WEB_BASE}/exceptions`);
  await pause(page, 1_200);

  await showStepBanner(page, {
    stepLabel: 'SCREEN 1 \u00b7 THE OPEN QUEUE',
    headline: 'The flagged card is waiting for a human, with its raw text and confidence.',
    detail: 'Nothing is saved to the guest until a person confirms it \u2014 no silent wrong guesses.',
  });
  await pause(page, 2_600);

  if (targetId) {
    await showStepBanner(page, {
      stepLabel: 'SCREEN 1 \u00b7 RESOLVE IT',
      headline: 'The agent confirms the reading and clicks Resolve.',
      detail: 'Real PATCH /v1/exceptions/{id} \u2014 status \u2192 resolved, with a resolution note + audit row.',
    });
    await pause(page, 1_400);
    await highlightAndClick(page, `resolve-${targetId}`, 800);
    await pause(page, 1_800);

    // Switch to the Resolved tab to show it has moved.
    await showStepBanner(page, {
      stepLabel: 'SCREEN 2 \u00b7 RESOLVED TAB',
      headline: 'The item has moved out of the open queue into Resolved.',
      detail: 'The queue stays clean; resolved items remain on record.',
    });
    await pause(page, 1_200);
    await highlightAndClick(page, 'tab-resolved', 700);
    await pause(page, 2_000);
  }
  await clearBanner(page);

  // ---- BEAT 3: live test that MATCHES the flow we just showed ---------------
  let nowStatus = 'n/a';
  if (targetId) {
    const after = await liveCall(api, token, 'GET', '/v1/exceptions?status=resolved&limit=100');
    const resolved = (after.body as { items?: Array<{ id: string; status: string }> })?.items ?? [];
    nowStatus = resolved.find((i) => i.id === targetId)?.status ?? 'not-in-resolved';
  }

  await showVerdict(page, {
    title: 'UC-23 \u00b7 EXCEPTION RESOLUTION',
    request: 'PATCH /v1/exceptions/{id}  \u00b7  GET /v1/exceptions?status=resolved',
    assertions: [
      { label: 'There was an open item to resolve', expected: 'present', actual: targetId ? 'present' : 'none', pass: !!targetId },
      { label: 'After Resolve, item is now resolved', expected: 'resolved', actual: nowStatus, pass: nowStatus === 'resolved' },
    ],
  });
  await pause(page, 5_000);
  await clearOverlay(page);
});
