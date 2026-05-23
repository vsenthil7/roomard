/**
 * Clip 06 — UC-23 Exception queue: a low-confidence OCR field went to a human,
 * who resolves it — and that resolution is what writes the confirmed
 * preferences onto the guest. This is the second half of the capture lineage
 * (clip 04 creates the exception; clip 06 resolves it and the data lands).
 *
 * FOUR beats:
 *   1) TEST CASE   — scene card.
 *   2) SCREEN FLOW — its OWN storyboard beat: capture held the fields back at
 *                    0.62 -> they sit in the queue -> a human resolves ->
 *                    PATCH writes them to the guest. Lineage made explicit.
 *   3) LIVE TEST   — on the real /exceptions screen: the open item is shown,
 *                    resolved live (real PATCH), and shown moved to Resolved.
 *   4) VERDICT     — real assertions: the item is now 'resolved' AND the guest
 *                    it belonged to now has the preferences that were held back
 *                    (GET /v1/guests/{id}/preferences). Lineage proven on screen.
 *
 * Pairs with clip 04: record 04 then 06 with no cleanup between, so 06 resolves
 * the exact exception 04 created (Eleanor Whitcombe). If run standalone with no
 * such exception present, the _session/exception.sql seed provides a fallback
 * open low-OCR item so the clip is still self-contained.
 */
import { test, expect } from '@playwright/test';
import {
  showSceneCard, showStepBanner, showStoryboard, showVerdict, clearBanner, clearOverlay,
  signInAndGetToken, liveCall, pause,
  WEB_BASE,
} from './clip-helpers';

test('clip-06-exception', async ({ page, playwright }) => {
  test.setTimeout(160_000);
  const api = await playwright.request.newContext({ ignoreHTTPSErrors: true });

  // ---- BEAT 1 -------------------------------------------------------------
  await showSceneCard(page, {
    step: 'TEST CASE \u00b7 UC-23 \u00b7 RESOLVE A FLAGGED EXCEPTION',
    given: 'OCR read one field on Eleanor\u2019s card below the confidence threshold',
    when: 'Rather than guess, Roomard queued it; an agent reviews and confirms',
    then: 'The item is resolved \u2014 and the confirmed preferences are written to the guest',
    durationMs: 6_500,
  });
  await clearOverlay(page);

  const token = await signInAndGetToken(page, api);

  // Find the open low-OCR exception to resolve. Prefer one tied to a guest
  // (the real capture lineage, e.g. Eleanor from clip 04); fall back to any.
  const before = await liveCall(api, token, 'GET', '/v1/exceptions?status=open&limit=100');
  const openItems =
    (before.body as { items?: Array<{ id: string; kind: string; guest_id?: string | null; title: string }> })
      ?.items ?? [];
  const target =
    openItems.find((i) => i.kind === 'low_ocr_confidence' && i.guest_id) ??
    openItems.find((i) => i.kind === 'low_ocr_confidence') ??
    openItems[0];
  const targetId = target?.id ?? '';
  let clickedId = targetId; // updated to the actually-clicked item's id below
  const targetGuestId = target?.guest_id ?? '';

  // Preferences on that guest BEFORE resolution (should be 0 for the held card).
  const prefsBefore = targetGuestId
    ? await liveCall(api, token, 'GET', `/v1/guests/${targetGuestId}/preferences`)
    : { body: { items: [] } };
  const countBefore = ((prefsBefore.body as { items?: unknown[] })?.items ?? []).length;

  // ---- BEAT 2: SCREEN FLOW STORYBOARD (its own beat, BEFORE the live run) ---
  await showStoryboard(page, {
    title: 'SCREEN FLOW \u00b7 REVIEW \u2192 RESOLVE \u2192 PREFERENCES LAND',
    steps: [
      {
        screen: 'CAPTURE',
        blank: '[card scanned]',
        filled: '5 fields read, lowest = 0.62',
        action: 'Hold',
        produces: 'below 0.75 => nothing written to the guest yet',
      },
      {
        screen: 'QUEUE',
        blank: '[open exception]',
        filled: 'the flagged card, with its fields',
        action: 'Review',
        produces: 'a human reads the card and confirms',
      },
      {
        screen: 'RESOLVE',
        blank: '[unconfirmed]',
        filled: 'agent clicks Resolve',
        action: 'Resolve',
        produces: 'PATCH /v1/exceptions/{id} => status resolved',
      },
      {
        screen: 'GUEST',
        blank: '[0 preferences]',
        filled: 'the confirmed fields',
        action: 'Persist',
        produces: 'preferences written to the guest (source: exception_resolution)',
      },
    ],
    outcome:
      'The shaky field was never silently trusted \u2014 once a human confirms, the data lands on the guest\u2019s profile',
    durationMs: 10_000,
  });
  await clearOverlay(page);

  // ---- BEAT 3: LIVE — show the queue, resolve, show it moved ---------------
  await page.goto(`${WEB_BASE}/exceptions`);
  await pause(page, 1_200);

  await showStepBanner(page, {
    stepLabel: 'SCREEN 1 \u00b7 THE OPEN QUEUE',
    headline: 'The flagged card is waiting for a human, with its fields and confidence.',
    detail: 'Nothing is saved to the guest until a person confirms it \u2014 no silent wrong guesses.',
  });
  await pause(page, 2_600);

  // The exceptions list is React-Query backed; on first paint its 'open' cache
  // can be empty even though the item exists. Wait for a Resolve button to
  // render, and reload once if it doesn't, so the click below always has a
  // real target. (This was the cause of earlier resolve-did-nothing runs.)
  const anyResolve = page.getByTestId('exception-list').getByRole('button', { name: 'Resolve' }).first();
  let listReady = await anyResolve.isVisible({ timeout: 6_000 }).catch(() => false);
  if (!listReady) {
    await page.reload();
    await pause(page, 1_500);
    listReady = await anyResolve.isVisible({ timeout: 8_000 }).catch(() => false);
  }

  if (targetId) {
    await showStepBanner(page, {
      stepLabel: 'SCREEN 1 \u00b7 RESOLVE IT',
      headline: 'The agent confirms the reading and clicks Resolve.',
      detail: 'Real PATCH /v1/exceptions/{id} \u2014 status \u2192 resolved, and the held fields are written to the guest.',
    });
    await pause(page, 1_400);

    // Click the Resolve button that is ACTUALLY RENDERED rather than trusting an
    // API-derived testid (the list's React-Query cache / ordering can differ from
    // the API call above, which previously caused a click that waited out the whole
    // timeout). Prefer the exact testid if present, else the first rendered Resolve
    // button in the list. Every step is timeout-guarded so nothing can hang.
    // Resolve the item ACTUALLY ON SCREEN, and read its id back FROM the button
    // it (testid `resolve-<id>`), so the API verification below checks the exact
    // same exception we clicked — immune to list ordering / cache differences.
    const exactBtn = page.getByTestId(`resolve-${targetId}`);
    const hasExact = await exactBtn.isVisible({ timeout: 4_000 }).catch(() => false);
    const resolveBtn = hasExact
      ? exactBtn
      : page.getByTestId('exception-list').getByRole('button', { name: 'Resolve' }).first();
    const clickedTestId = (await resolveBtn.getAttribute('data-testid').catch(() => null)) ?? '';
    clickedId = clickedTestId.startsWith('resolve-') ? clickedTestId.slice('resolve-'.length) : targetId;
    await resolveBtn.scrollIntoViewIfNeeded().catch(() => {});
    await pause(page, 500);
    await resolveBtn.click({ timeout: 10_000 });
    await pause(page, 1_800);

    await showStepBanner(page, {
      stepLabel: 'SCREEN 2 \u00b7 RESOLVED TAB',
      headline: 'The item has moved out of the open queue into Resolved.',
      detail: 'The queue stays clean; the guest now carries the confirmed preferences.',
    });
    await pause(page, 1_200);
    await clearBanner(page);
    await pause(page, 300);
    await page.getByTestId('tab-resolved').click({ timeout: 8_000 }).catch(() => {});
    await pause(page, 2_000);
  }
  await clearBanner(page);

  // ---- BEAT 4: live test that MATCHES the flow we just showed ---------------
  let nowStatus = 'n/a';
  let resolvedGuestId = targetGuestId;
  if (clickedId) {
    const after = await liveCall(api, token, 'GET', '/v1/exceptions?status=resolved&limit=100');
    const resolved =
      (after.body as { items?: Array<{ id: string; status: string; guest_id?: string | null }> })?.items ?? [];
    const rec = resolved.find((i) => i.id === clickedId);
    nowStatus = rec?.status ?? 'not-in-resolved';
    resolvedGuestId = rec?.guest_id ?? targetGuestId;
  }
  // The lineage payoff: the guest that owned the flagged card now has the
  // preferences that were held back until a human confirmed them.
  const prefsAfter = resolvedGuestId
    ? await liveCall(api, token, 'GET', `/v1/guests/${resolvedGuestId}/preferences`)
    : { body: { items: [] } };
  const countAfter = ((prefsAfter.body as { items?: unknown[] })?.items ?? []).length;
  const prefsLanded = !!resolvedGuestId && countAfter > countBefore;

  await showVerdict(page, {
    title: 'UC-23 \u00b7 EXCEPTION RESOLUTION',
    request: 'PATCH /v1/exceptions/{id}  \u00b7  GET /v1/guests/{id}/preferences',
    assertions: [
      { label: 'There was an open item to resolve', expected: 'present', actual: targetId ? 'present' : 'none', pass: !!targetId },
      { label: 'After Resolve, item is now resolved', expected: 'resolved', actual: nowStatus, pass: nowStatus === 'resolved' },
      { label: 'Confirmed preferences written to the guest', expected: `> ${countBefore}`, actual: `${countAfter} on profile`, pass: prefsLanded },
    ],
  });
  await pause(page, 5_500);
  await clearOverlay(page);

  // Hard assertions — a false verdict row fails the test (no green-badge lies).
  expect(targetId, 'there must be an open exception to resolve').not.toBe('');
  expect(nowStatus, 'the item must be resolved after clicking Resolve').toBe('resolved');
  if (targetGuestId) {
    expect(prefsLanded, 'resolving must write the held preferences to the guest').toBe(true);
  }
});
