/**
 * Clip 07 — Closing card.
 */
import { test } from '@playwright/test';
import { showTitleCard, clearOverlay } from './clip-helpers';

test('clip-07-outro', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('about:blank');
  await showTitleCard(page, {
    title: 'Roomard',
    subtitle:
      'From an empty system to a front desk that remembers every guest.\nOnboarding \u2192 capture \u2192 brief \u2192 guest profile \u2192 prep \u2192 exceptions \u2014 every step shown, then proven live against the running product.',
    footnote: 'Multi-tenant \u00b7 RLS-enforced \u00b7 audit-grade \u00b7 ERNIE 4.5 + PaddleOCR-VL on Qianfan \u00b7 github.com/vsenthil7/roomard',
    durationMs: 7_000,
  });
  await page.waitForTimeout(7_000);
  await clearOverlay(page);
});
