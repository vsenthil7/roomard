/**
 * Clip 03 — Mid-conversation guest lookup + trajectory (UC-08 / UC-11).
 * Open the arriving guest's profile; prove preferences, the say-this line and
 * the complaint-trajectory analysis are all real.
 */
import { test } from '@playwright/test';
import {
  showSceneCard, showVerdict, clearOverlay, scrollTopToBottom,
  signInAndGetToken, liveCall, WEB_BASE,
} from './clip-helpers';

test('clip-03-guest', async ({ page, playwright }) => {
  test.setTimeout(120_000);
  const api = await playwright.request.newContext({ ignoreHTTPSErrors: true });

  await showSceneCard(page, {
    step: 'STEP 3 \u00b7 KNOW THE GUEST (UC-08 / UC-11)',
    given: 'A returning guest is at the desk and the agent needs context fast',
    when: 'The agent opens the guest profile',
    then: 'Preferences, stay history, a say-this line and a complaint-trajectory read are all there',
    durationMs: 5_500,
  });
  await clearOverlay(page);

  const token = await signInAndGetToken(page, api);

  // Resolve James Patel's id, then open his profile.
  const guests = await liveCall(api, token, 'GET', '/v1/guests');
  const arr = (guests.body as { items?: Array<{ id: string; display_name?: string }> })?.items ?? [];
  const james = arr.find((g) => (g.display_name ?? '').includes('James')) ?? arr[0];
  const gid = james?.id ?? '';

  await page.goto(`${WEB_BASE}/guests/${gid}`);
  await page.waitForTimeout(1_500);
  await scrollTopToBottom(page, 3_000);
  await page.waitForTimeout(800);

  const prefs = await liveCall(api, token, 'GET', `/v1/guests/${gid}/preferences`);
  const sayThis = await liveCall(api, token, 'GET', `/v1/guests/${gid}/say-this`);
  const traj = await liveCall(api, token, 'GET', `/v1/guests/${gid}/trajectory`);
  const prefCount = Array.isArray((prefs.body as { items?: unknown[] })?.items)
    ? (prefs.body as { items: unknown[] }).items.length
    : Array.isArray(prefs.body) ? (prefs.body as unknown[]).length : 0;
  const greeting = (sayThis.body as { greeting?: string })?.greeting ?? '';
  const flagged = (traj.body as { flagged?: boolean })?.flagged;

  await showVerdict(page, {
    title: 'STEP 3 \u00b7 GUEST PROFILE',
    request: 'GET /v1/guests/{id}/preferences \u00b7 say-this \u00b7 trajectory',
    assertions: [
      { label: 'Preferences', expected: '\u2265 1', actual: String(prefCount), pass: prefCount >= 1 },
      { label: 'Say-this greeting', expected: 'non-empty', actual: greeting ? 'present' : 'empty', pass: !!greeting },
      { label: 'Trajectory analysis', expected: '200', actual: String(traj.status), pass: traj.status === 200 },
      { label: 'Flagged decision returned', expected: 'true/false', actual: String(flagged), pass: typeof flagged === 'boolean' },
    ],
  });
  await page.waitForTimeout(4_500);
  await clearOverlay(page);
});
