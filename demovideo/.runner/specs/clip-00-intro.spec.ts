/**
 * Clip 00 — Intro title card.
 * Sets up the story: a new boutique hotel goes live on Roomard.
 */
import { test } from '@playwright/test';
import { showTitleCard, clearOverlay } from './clip-helpers';

test('clip-00-intro', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('about:blank');
  await showTitleCard(page, {
    title: 'Roomard',
    subtitle:
      'The guest-memory engine for boutique hotels.\nThis is the story of one hotel going live — from an empty system to a front desk that remembers every guest.',
    footnote: 'A new hotel \u00b7 onboarding \u2192 first capture \u2192 the daily brief \u2192 prep \u2192 exceptions \u00b7 every step shown, then proven live',
    durationMs: 6_500,
  });
  await page.waitForTimeout(6_500);
  await clearOverlay(page);
});
