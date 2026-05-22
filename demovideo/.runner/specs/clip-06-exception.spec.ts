/**
 * Clip 06 — Exception queue (UC-23): low-confidence OCR goes to a human.
 * Expected flow first, then the live exceptions screen + assertion that the
 * real queued item is present and readable.
 */
import { test } from '@playwright/test';
import {
  showSceneCard, showVerdict, clearOverlay, scrollTopToBottom,
  signInAndGetToken, liveCall, WEB_BASE,
} from './clip-helpers';

test('clip-06-exception', async ({ page, playwright }) => {
  test.setTimeout(120_000);
  const api = await playwright.request.newContext({ ignoreHTTPSErrors: true });

  await showSceneCard(page, {
    step: 'STEP 6 \u00b7 NOTHING SLIPS THROUGH (UC-23)',
    given: 'OCR read one field on the card below the confidence threshold',
    when: 'Rather than guess, Roomard queues it for a human',
    then: 'It appears in the exception queue with the raw text and confidence, ready to confirm',
    durationMs: 5_500,
  });
  await clearOverlay(page);

  const token = await signInAndGetToken(page, api);
  await page.goto(`${WEB_BASE}/exceptions`);
  await page.waitForTimeout(1_500);
  await scrollTopToBottom(page, 2_500);
  await page.waitForTimeout(800);

  const ex = await liveCall(api, token, 'GET', '/v1/exceptions');
  const items = (ex.body as { items?: Array<{ title?: string; kind?: string }> })?.items
    ?? (Array.isArray(ex.body) ? (ex.body as Array<{ title?: string; kind?: string }>) : []);
  const lowOcr = items.find((i) => i.kind === 'low_ocr_confidence');

  await showVerdict(page, {
    title: 'STEP 6 \u00b7 EXCEPTION QUEUE',
    request: 'GET /v1/exceptions',
    assertions: [
      { label: 'Status', expected: '200', actual: String(ex.status), pass: ex.status === 200 },
      { label: 'Items in queue', expected: '\u2265 1', actual: String(items.length), pass: items.length >= 1 },
      { label: 'Low-OCR-confidence item', expected: 'present', actual: lowOcr ? 'present' : 'none', pass: !!lowOcr },
    ],
  });
  await page.waitForTimeout(4_500);
  await clearOverlay(page);
});
