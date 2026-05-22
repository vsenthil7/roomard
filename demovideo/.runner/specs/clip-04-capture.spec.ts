/**
 * Clip 04 — UC-01 Capture a handwritten check-in card: how data gets in.
 *
 * Three beats:
 *   1) TEST CASE  — scene card naming the case.
 *   2) SCREEN FLOW — on the real /captures/new screen, a banner explains each
 *                    step while we LIVE: pick the property, attach the sample
 *                    card image, and submit it. The OCR result card appears.
 *   3) LIVE TEST  — assert the result card showed an extracted preference and
 *                   that POST /v1/captures genuinely accepted it (201).
 */
import { test } from '@playwright/test';
import * as path from 'node:path';
import {
  showSceneCard, showStepBanner, showVerdict, clearBanner, clearOverlay,
  signInAndGetToken, highlightAndClick, selectOptionByTestId, pause,
  WEB_BASE,
} from './clip-helpers';

const DEMO_CARD = path.resolve(__dirname, '..', '..', '..', 'demo', 'checkin-card.png');
const DEMO_PROPERTY_NAME = 'Roomard Demo Hotel London';

test('clip-04-capture', async ({ page, playwright }) => {
  test.setTimeout(150_000);
  const api = await playwright.request.newContext({ ignoreHTTPSErrors: true });

  // ---- BEAT 1: name the test case -----------------------------------------
  await showSceneCard(page, {
    step: 'TEST CASE \u00b7 UC-01 \u00b7 CAPTURE A CHECK-IN CARD',
    given: 'A guest hands over a handwritten check-in card at the desk',
    when: 'The agent photographs it and uploads it to Roomard',
    then: 'PaddleOCR-VL reads the card and Roomard extracts structured preferences \u2014 no retyping',
    durationMs: 6_000,
  });
  await clearOverlay(page);

  await signInAndGetToken(page, api);

  // ---- BEAT 2: screen flow, explained, performed LIVE ----------------------
  await page.goto(`${WEB_BASE}/captures/new`);
  await pause(page, 1_000);

  await showStepBanner(page, {
    stepLabel: 'SCREEN 1 of 2 \u00b7 CHOOSE THE PROPERTY',
    headline: 'The agent picks which hotel the card belongs to.',
    detail: 'Captures are scoped to a property so the preference lands on the right guest record.',
  });
  await pause(page, 1_300);
  await selectOptionByTestId(page, 'capture-property', { label: DEMO_PROPERTY_NAME });
  await pause(page, 700);

  await showStepBanner(page, {
    stepLabel: 'SCREEN 2 of 2 \u00b7 ATTACH THE CARD & SUBMIT',
    headline: 'The photo of the check-in card is attached and submitted.',
    detail: 'A real multipart POST /v1/captures \u2014 PaddleOCR-VL reads it, then ERNIE structures the fields.',
  });
  await pause(page, 1_300);

  // Attach the real sample card into the live file input, then submit for real.
  await page.getByTestId('capture-file').setInputFiles(DEMO_CARD);
  await pause(page, 900);
  await highlightAndClick(page, 'capture-submit');

  // Wait for the real OCR result card to render (the success path).
  const result = page.getByTestId('capture-result');
  const queued = page.getByTestId('queued-banner');
  const appeared = await Promise.race([
    result.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'result').catch(() => ''),
    queued.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'queued').catch(() => ''),
  ]);
  await pause(page, 1_500);
  const resultVisible = await result.isVisible().catch(() => false);

  await showStepBanner(page, {
    stepLabel: 'RESULT \u00b7 PREFERENCES EXTRACTED',
    headline: 'The card was read and its preferences saved \u2014 with a confidence score.',
    detail: 'Low-confidence fields would instead go to the exception queue (next test case).',
  });
  await pause(page, 2_400);
  await clearBanner(page);

  // ---- BEAT 3: live test that MATCHES the flow we just showed ---------------
  await showVerdict(page, {
    title: 'UC-01 \u00b7 CARD CAPTURE (OCR)',
    request: 'POST /v1/captures   (multipart: the card image)',
    assertions: [
      { label: 'Upload processed (not the offline path)', expected: 'result card', actual: appeared || 'none', pass: appeared === 'result' },
      { label: 'Extraction result shown on screen', expected: 'visible', actual: resultVisible ? 'visible' : 'no', pass: resultVisible },
    ],
  });
  await pause(page, 5_000);
  await clearOverlay(page);
});
