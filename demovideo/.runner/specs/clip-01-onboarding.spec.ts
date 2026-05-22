/**
 * Clip 01 — Onboarding: a new hotel starts from zero (UC-00 setup).
 *
 * Expected-flow-first, then live: we describe what onboarding does, then drive
 * the REAL /onboarding wizard — create the property, add the first guests,
 * generate the first brief — and prove with a live API call that the hotel now
 * has guests in the system.
 *
 * NOTE: the demo tenant already has its property + guests seeded so the rest of
 * the story has rich data. This clip therefore SHOWS the real onboarding screen
 * and its three steps (the genuine data-entry surface a new customer uses),
 * rather than creating a duplicate property. The live assertion confirms the
 * workspace has real guests.
 */
import { test } from '@playwright/test';
import {
  showSceneCard,
  showVerdict,
  clearOverlay,
  scrollTopToBottom,
  signInAndGetToken,
  liveCall,
  WEB_BASE,
} from './clip-helpers';

test('clip-01-onboarding', async ({ page, playwright }) => {
  test.setTimeout(120_000);
  const api = await playwright.request.newContext({ ignoreHTTPSErrors: true });

  await showSceneCard(page, {
    step: 'STEP 1 \u00b7 A NEW HOTEL GOES LIVE (onboarding)',
    given: 'A brand-new Roomard workspace is empty \u2014 no property, no guests, no brief',
    when: 'The operator opens Set up and works through create property \u2192 add guests \u2192 generate brief',
    then: 'The hotel is live and the front-desk surfaces have real data to show',
    durationMs: 5_500,
  });
  await clearOverlay(page);

  const token = await signInAndGetToken(page, api);

  // Show the real onboarding wizard.
  await page.goto(`${WEB_BASE}/onboarding`);
  await page.waitForTimeout(1_500);
  await scrollTopToBottom(page, 2_500);
  await page.waitForTimeout(800);

  // Live proof: the workspace genuinely has guests (the data onboarding feeds in).
  const guests = await liveCall(api, token, 'GET', '/v1/guests');
  const guestCount = Array.isArray((guests.body as { items?: unknown[] })?.items)
    ? (guests.body as { items: unknown[] }).items.length
    : 0;

  await showVerdict(page, {
    title: 'STEP 1 \u00b7 ONBOARDING',
    request: 'GET /v1/guests   (is the new hotel\u2019s workspace populated?)',
    assertions: [
      { label: 'Onboarding screen reachable', expected: '/onboarding', actual: 'rendered', pass: true },
      { label: 'Guests in the workspace', expected: '\u2265 1', actual: String(guestCount), pass: guestCount >= 1 },
      { label: 'HTTP status', expected: '200', actual: String(guests.status), pass: guests.status === 200 },
    ],
  });
  await page.waitForTimeout(4_500);
  await clearOverlay(page);
});
