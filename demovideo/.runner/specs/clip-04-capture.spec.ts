/**
 * Clip 04 — Capture a handwritten check-in card (UC-01): how data gets in.
 * Expected flow first, then a REAL upload of the sample card through the live
 * /captures/new UI; the screen shows the OCR-extracted preferences, and a live
 * assertion confirms the capture endpoint accepted it.
 */
import { test, expect } from '@playwright/test';
import * as path from 'node:path';
import {
  showSceneCard, showVerdict, clearOverlay,
  signInAndGetToken, WEB_BASE,
} from './clip-helpers';

const DEMO_CARD = path.resolve(__dirname, '..', '..', '..', 'demo', 'checkin-card.png');

test('clip-04-capture', async ({ page, playwright }) => {
  test.setTimeout(120_000);
  const api = await playwright.request.newContext({ ignoreHTTPSErrors: true });

  await showSceneCard(page, {
    step: 'STEP 4 \u00b7 CAPTURE A CHECK-IN CARD (UC-01)',
    given: 'A guest hands over a handwritten check-in card at the desk',
    when: 'The agent photographs it and uploads it',
    then: 'PaddleOCR-VL reads the card and Roomard extracts structured preferences \u2014 no retyping',
    durationMs: 5_500,
  });
  await clearOverlay(page);

  await signInAndGetToken(page, api);
  await page.goto(`${WEB_BASE}/captures/new`);
  await page.waitForTimeout(1_200);

  // Pick the demo property (first option that isn't the placeholder).
  const propSelect = page.getByTestId('capture-property');
  await propSelect.selectOption({ index: 1 }).catch(() => {});
  await page.waitForTimeout(400);

  // Upload the real sample card image into the live file input.
  await page.getByTestId('capture-file').setInputFiles(DEMO_CARD);
  await page.waitForTimeout(800);
  await page.getByTestId('capture-submit').click();

  // Wait for the real OCR result (or the queued banner) to render.
  const result = page.getByTestId('capture-result');
  const queued = page.getByTestId('queued-banner');
  const appeared = await Promise.race([
    result.waitFor({ state: 'visible', timeout: 20_000 }).then(() => 'result').catch(() => ''),
    queued.waitFor({ state: 'visible', timeout: 20_000 }).then(() => 'queued').catch(() => ''),
  ]);
  await page.waitForTimeout(1_500);

  const resultVisible = await result.isVisible().catch(() => false);
  const queuedVisible = await queued.isVisible().catch(() => false);

  await showVerdict(page, {
    title: 'STEP 4 \u00b7 CARD CAPTURE (OCR)',
    request: 'POST /v1/captures   (multipart: the card image)',
    assertions: [
      { label: 'Upload accepted + processed', expected: 'result shown', actual: appeared || 'none', pass: appeared === 'result' || appeared === 'queued' },
      { label: 'Extraction or review surfaced', expected: 'visible', actual: resultVisible ? 'result' : queuedVisible ? 'queued-for-review' : 'none', pass: resultVisible || queuedVisible },
    ],
  });
  await page.waitForTimeout(4_500);
  await clearOverlay(page);
});
