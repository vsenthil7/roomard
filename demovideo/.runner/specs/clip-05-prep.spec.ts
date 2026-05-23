/**
 * Clip 05 — UC-09 Housekeeping prep cards.
 *
 * Three beats:
 *   1) TEST CASE  — scene card.
 *   2) SCREEN FLOW — open the prep cards; a banner explains the per-room cards
 *                    and the prep items (allergies, pillows, temperature) as the
 *                    screen scrolls through them.
 *   3) LIVE TEST  — assert one card per arriving room, each with real prep items.
 */
import { test, expect } from '@playwright/test';
import {
  showSceneCard, showStepBanner, showStoryboard, showVerdict, clearBanner, clearOverlay,
  scrollTopToBottom, signInAndGetToken, liveCall, pause,
  WEB_BASE, DEMO_PROPERTY_ID,
} from './clip-helpers';

function todayIso(): string { return new Date().toISOString().slice(0, 10); }
// Prep is generated D-1: prepDate covers arrivals on prepDate+1. The demo's
// arrivals are today, so the prep date that covers them is yesterday.
function prepDateIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

test('clip-05-prep', async ({ page, playwright }) => {
  test.setTimeout(120_000);
  const api = await playwright.request.newContext({ ignoreHTTPSErrors: true });

  await showSceneCard(page, {
    step: 'TEST CASE \u00b7 UC-09 \u00b7 HOUSEKEEPING PREP',
    given: 'Tomorrow\u2019s arrivals each need their room prepared to their preferences',
    when: 'Housekeeping opens their prep cards on a phone',
    then: 'One card per room \u2014 the prep items that matter (allergies, pillows, temperature) and a warm note',
    durationMs: 6_000,
  });
  await clearOverlay(page);

  const token = await signInAndGetToken(page, api);

  // Prep cards are produced on demand (D-1). Generate the ones covering the
  // demo's arrivals so the screen has real cards to show.
  await liveCall(api, token, 'POST', '/v1/prep-cards/generate', {
    propertyId: DEMO_PROPERTY_ID,
    prepDate: prepDateIso(),
    force: true,
    includeWarmNote: true,
  });

  // ---- SCREEN FLOW storyboard (its own beat, before the live prep cards) --
  await showStoryboard(page, {
    title: 'SCREEN FLOW \u00b7 HOUSEKEEPING PREP',
    steps: [
      { screen: 'ARRIVALS', blank: '[tomorrow\u2019s rooms]', filled: 'each room + guest', action: 'Build', produces: 'GET /prep-cards/{date} => one card per room' },
      { screen: 'PREFERENCES', blank: '[raw prefs]', filled: 'allergies, pillows, temp', action: 'Translate', produces: 'a room-prep checklist per card' },
      { screen: 'CARD', blank: '[empty]', filled: 'the items that matter', action: 'Show', produces: 'housekeeper sees exactly what to set up' },
    ],
    outcome: 'A captured \u201ctwo firm pillows\u201d flows straight onto the housekeeper\u2019s card',
    durationMs: 9_000,
  });
  await clearOverlay(page);

  await page.goto(`${WEB_BASE}/prep-cards`);
  await pause(page, 800);
  // The page defaults to today (empty here); set the date input to the D-1
  // date that has the generated cards so the real cards render on screen.
  const dateInput = page.getByTestId('prep-date');
  if (await dateInput.isVisible({ timeout: 6_000 }).catch(() => false)) {
    await dateInput.fill(prepDateIso());
    await dateInput.blur().catch(() => {});
  }
  await pause(page, 1_400);

  await showStepBanner(page, {
    stepLabel: 'PREP \u00b7 ONE CARD PER ROOM',
    headline: 'Each arriving room gets its own card \u2014 name, room number, arrival time.',
    detail: 'Generated the day before from the guest\u2019s preferences.',
  });
  await pause(page, 2_400);

  await showStepBanner(page, {
    stepLabel: 'PREP \u00b7 THE ITEMS THAT MATTER',
    headline: 'Allergies, pillows, temperature, dietary \u2014 turned into a room-prep checklist.',
    detail: 'A captured \u201cTwo firm pillows\u201d flows straight onto the housekeeper\u2019s card.',
  });
  await scrollTopToBottom(page, 3_400);
  await pause(page, 1_000);
  await clearBanner(page);

  const cards = await liveCall(api, token, 'GET', `/v1/properties/${DEMO_PROPERTY_ID}/prep-cards/${prepDateIso()}`);
  const items = (cards.body as { items?: Array<{ display_name?: string; prep_items?: string[] }> })?.items ?? [];
  const withItems = items.filter((c) => (c.prep_items?.length ?? 0) > 0).length;

  await showVerdict(page, {
    title: 'UC-09 \u00b7 PREP CARDS',
    request: 'GET /v1/properties/{id}/prep-cards/{date}',
    assertions: [
      { label: 'Cards loaded', expected: '200', actual: String(cards.status), pass: cards.status === 200 },
      { label: 'One card per arriving room', expected: '3', actual: String(items.length), pass: items.length === 3 },
      { label: 'Cards carry real prep items', expected: '\u2265 1', actual: String(withItems), pass: withItems >= 1 },
    ],
  });
  await pause(page, 4_800);
  await clearOverlay(page);

  // Hard assertions \u2014 a false verdict row fails the test.
  expect(cards.status, 'prep cards must load').toBe(200);
  expect(items.length, 'one card per arriving room (3)').toBe(3);
  expect(withItems, 'cards must carry real prep items').toBeGreaterThanOrEqual(1);
});
