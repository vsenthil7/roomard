/**
 * Clip 02 — The daily arrival brief (UC-07).
 * Expected flow first, then the live brief screen + a real assertion that the
 * brief has the right number of ranked arrivals.
 */
import { test } from '@playwright/test';
import {
  showSceneCard, showVerdict, clearOverlay, scrollTopToBottom,
  signInAndGetToken, liveCall, WEB_BASE, DEMO_PROPERTY_ID,
} from './clip-helpers';

test('clip-02-brief', async ({ page, playwright }) => {
  test.setTimeout(120_000);
  const api = await playwright.request.newContext({ ignoreHTTPSErrors: true });

  await showSceneCard(page, {
    step: 'STEP 2 \u00b7 THE MORNING BRIEF (UC-07)',
    given: 'Three guests are arriving today, each with their own history and preferences',
    when: 'The front desk opens the daily brief',
    then: 'Each arrival is ranked, with a ready-to-say greeting, key preferences, and any recent issue flagged',
    durationMs: 5_500,
  });
  await clearOverlay(page);

  const token = await signInAndGetToken(page, api);
  await page.goto(`${WEB_BASE}/`);
  await page.waitForTimeout(1_500);
  await scrollTopToBottom(page, 3_000);
  await page.waitForTimeout(800);

  const brief = await liveCall(api, token, 'GET', `/v1/properties/${DEMO_PROPERTY_ID}/briefs/today`);
  const b = brief.body as { brief?: { total_arrivals?: number; attention_count?: number }; items?: unknown[] };
  const arrivals = b?.brief?.total_arrivals ?? 0;
  const attention = b?.brief?.attention_count ?? 0;
  const items = Array.isArray(b?.items) ? b.items.length : 0;

  await showVerdict(page, {
    title: 'STEP 2 \u00b7 DAILY BRIEF',
    request: `GET /v1/properties/{id}/briefs/today`,
    assertions: [
      { label: 'Brief status', expected: '200 ready', actual: String(brief.status), pass: brief.status === 200 },
      { label: 'Ranked arrivals', expected: '3', actual: String(arrivals), pass: arrivals === 3 },
      { label: 'Brief items rendered', expected: '3', actual: String(items), pass: items === 3 },
      { label: 'Flagged for attention', expected: '\u2265 1', actual: String(attention), pass: attention >= 1 },
    ],
  });
  await page.waitForTimeout(4_500);
  await clearOverlay(page);
});
