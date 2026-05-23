/**
 * Clip 03 — UC-08 / UC-11 Know the guest: profile, history, and a live
 * "Say this" generation.
 *
 * Three beats:
 *   1) TEST CASE  — scene card.
 *   2) SCREEN FLOW — open the guest profile; a banner explains the preferences
 *                    and stay history; then the agent clicks "Generate Say this"
 *                    LIVE and the AI-written greeting card appears.
 *   3) LIVE TEST  — assert preferences exist, the say-this greeting is real, and
 *                   the complaint-trajectory analysis returns a decision.
 */
import { test, expect } from '@playwright/test';
import {
  showSceneCard, showStepBanner, showStoryboard, showVerdict, clearBanner, clearOverlay,
  scrollTopToBottom, signInAndGetToken, liveCall, highlightAndClick, pause,
  WEB_BASE,
} from './clip-helpers';

test('clip-03-guest', async ({ page, playwright }) => {
  test.setTimeout(120_000);
  const api = await playwright.request.newContext({ ignoreHTTPSErrors: true });

  await showSceneCard(page, {
    step: 'TEST CASE \u00b7 UC-08 / UC-11 \u00b7 KNOW THE GUEST',
    given: 'A returning guest is at the desk and the agent needs context fast',
    when: 'The agent opens the guest profile and asks for a greeting',
    then: 'Preferences, stay history, a live AI \u201cSay this\u201d line, and a complaint-trajectory read are all there',
    durationMs: 6_000,
  });
  await clearOverlay(page);

  const token = await signInAndGetToken(page, api);

  // Resolve James Patel's id (the flagged guest), then open his profile.
  const guests = await liveCall(api, token, 'GET', '/v1/guests');
  const arr = (guests.body as { items?: Array<{ id: string; display_name?: string }> })?.items ?? [];
  const james = arr.find((g) => (g.display_name ?? '').includes('James')) ?? arr[0];
  const gid = james?.id ?? '';

  // ---- SCREEN FLOW storyboard (its own beat, before the live profile) ----
  await showStoryboard(page, {
    title: 'SCREEN FLOW \u00b7 KNOW THE GUEST',
    steps: [
      { screen: 'PROFILE', blank: '[open guest]', filled: 'learned preferences + confidence', action: 'Read', produces: 'GET /guests/{id}/preferences => what we know' },
      { screen: 'HISTORY', blank: '[past stays]', filled: 'stays + issues', action: 'Review', produces: 'context the agent can rely on' },
      { screen: 'SAY THIS', blank: '[no script]', filled: 'top preferences', action: 'Generate', produces: 'ERNIE => a one-line greeting to use now' },
    ],
    outcome: 'The agent sounds like they remember the guest \u2014 because the system does',
    durationMs: 9_000,
  });
  await clearOverlay(page);

  await page.goto(`${WEB_BASE}/guests/${gid}`);
  await pause(page, 1_400);

  await showStepBanner(page, {
    stepLabel: 'PROFILE \u00b7 PREFERENCES & HISTORY',
    headline: 'Every preference Roomard has learned, each with a confidence score.',
    detail: 'Built up automatically from captures and stays \u2014 allergies, room, bedding, dietary.',
  });
  await scrollTopToBottom(page, 3_000);
  await pause(page, 700);

  await showStepBanner(page, {
    stepLabel: 'PROFILE \u00b7 GENERATE \u201cSAY THIS\u201d',
    headline: 'The agent asks Roomard for a greeting to use right now.',
    detail: 'Real AI call \u2014 ERNIE drafts a one-line greeting from the top preferences.',
  });
  await pause(page, 1_400);
  // Scroll back to top so the button + resulting card are in view.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'auto' }));
  await pause(page, 500);
  await highlightAndClick(page, 'say-this-button', 800);

  // Wait for the AI-written card to appear.
  const card = page.getByTestId('say-this-card');
  const cardShown = await card.waitFor({ state: 'visible', timeout: 20_000 }).then(() => true).catch(() => false);
  await pause(page, 2_400);
  await clearBanner(page);

  const prefs = await liveCall(api, token, 'GET', `/v1/guests/${gid}/preferences`);
  const sayThis = await liveCall(api, token, 'GET', `/v1/guests/${gid}/say-this`);
  const traj = await liveCall(api, token, 'GET', `/v1/guests/${gid}/trajectory`);
  const prefCount = Array.isArray((prefs.body as { items?: unknown[] })?.items)
    ? (prefs.body as { items: unknown[] }).items.length
    : Array.isArray(prefs.body) ? (prefs.body as unknown[]).length : 0;
  const greeting = (sayThis.body as { greeting?: string })?.greeting ?? '';
  const flagged = (traj.body as { flagged?: boolean })?.flagged;

  await showVerdict(page, {
    title: 'UC-08 / UC-11 \u00b7 GUEST PROFILE',
    request: 'GET /v1/guests/{id}/preferences \u00b7 say-this \u00b7 trajectory',
    assertions: [
      { label: 'Preferences on file', expected: '\u2265 1', actual: String(prefCount), pass: prefCount >= 1 },
      { label: '\u201cSay this\u201d card generated on screen', expected: 'shown', actual: cardShown ? 'shown' : 'no', pass: cardShown },
      { label: 'Greeting is real text', expected: 'non-empty', actual: greeting ? 'present' : 'empty', pass: !!greeting },
      { label: 'Trajectory decision returned', expected: 'true/false', actual: String(flagged), pass: typeof flagged === 'boolean' },
    ],
  });
  await pause(page, 5_000);
  await clearOverlay(page);

  // Hard assertions \u2014 a false verdict row fails the test.
  expect(prefCount, 'guest must have at least one preference').toBeGreaterThanOrEqual(1);
  expect(cardShown, 'the Say-this card must render on screen').toBe(true);
  expect(greeting, 'greeting must be real text').not.toBe('');
  expect(typeof flagged, 'trajectory must return a decision').toBe('boolean');
});
