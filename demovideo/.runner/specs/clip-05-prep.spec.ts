/**
 * Clip 05 — Housekeeping prep cards (UC-09).
 * Expected flow first, then the live prep-cards screen + assertion that cards
 * generated for tomorrow's arrivals.
 */
import { test } from '@playwright/test';
import {
  showSceneCard, showVerdict, clearOverlay, scrollTopToBottom,
  signInAndGetToken, liveCall, WEB_BASE, DEMO_PROPERTY_ID,
} from './clip-helpers';

function todayIso(): string { return new Date().toISOString().slice(0, 10); }

test('clip-05-prep', async ({ page, playwright }) => {
  test.setTimeout(120_000);
  const api = await playwright.request.newContext({ ignoreHTTPSErrors: true });

  await showSceneCard(page, {
    step: 'STEP 5 \u00b7 HOUSEKEEPING PREP (UC-09)',
    given: 'Tomorrow\u2019s arrivals each need their room prepared to their preferences',
    when: 'Housekeeping opens their prep cards on a phone',
    then: 'One card per room \u2014 prep items (allergies, pillows, temperature) and a warm note',
    durationMs: 5_500,
  });
  await clearOverlay(page);

  const token = await signInAndGetToken(page, api);
  await page.goto(`${WEB_BASE}/prep-cards`);
  await page.waitForTimeout(1_500);
  await scrollTopToBottom(page, 3_000);
  await page.waitForTimeout(800);

  const cards = await liveCall(api, token, 'GET', `/v1/properties/${DEMO_PROPERTY_ID}/prep-cards/${todayIso()}`);
  const items = (cards.body as { items?: Array<{ display_name?: string; prep_items?: string[] }> })?.items ?? [];
  const withItems = items.filter((c) => (c.prep_items?.length ?? 0) > 0).length;

  await showVerdict(page, {
    title: 'STEP 5 \u00b7 PREP CARDS',
    request: 'GET /v1/properties/{id}/prep-cards/{date}',
    assertions: [
      { label: 'Status', expected: '200', actual: String(cards.status), pass: cards.status === 200 },
      { label: 'Prep cards generated', expected: '3', actual: String(items.length), pass: items.length === 3 },
      { label: 'Cards with prep items', expected: '\u2265 1', actual: String(withItems), pass: withItems >= 1 },
    ],
  });
  await page.waitForTimeout(4_500);
  await clearOverlay(page);
});
