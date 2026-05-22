/**
 * Shared helpers for the per-clip Roomard demo recordings.
 *
 * The demo is recorded as a sequence of SHORT, independent clips — one per use
 * case — instead of one long fragile recording. Each clip is its own spec file
 * and produces its own video; a hang or mistake only costs one short clip, and
 * any single use case can be re-recorded without redoing the rest. The clips
 * are concatenated losslessly with ffmpeg afterwards.
 *
 * Every clip follows the same shape the buyer asked for:
 *   1. an EXPECTED screen-flow card (what should happen, with an example), then
 *   2. the LIVE product doing it, with a real assertion + verdict on screen.
 */
import { expect, type Page, type APIRequestContext } from '@playwright/test';

export {
  showTitleCard,
  showSceneCard,
  showCaptionPill,
  showVerdict,
  showStepBanner,
  clearBanner,
  clearOverlay,
} from './caption-overlay';

export const WEB_BASE = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:8180';
export const API_BASE = process.env.API_BASE_URL ?? 'http://127.0.0.1:3100';
export const TENANT_SLUG = process.env.DEMO_TENANT ?? 'demo';
export const DEMO_EMAIL = process.env.DEMO_EMAIL ?? 'admin@demo.roomard.local';
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'Roomard123!';
export const DEMO_PROPERTY_ID =
  process.env.DEMO_PROPERTY_ID ?? '00000000-0000-4000-8000-000000000010';

/** Run a real HTTP request from the TEST process (no CORS) and return status + parsed body. */
export async function liveCall(
  api: APIRequestContext,
  token: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  apiPath: string,
  data?: unknown,
): Promise<{ status: number; body: unknown }> {
  const r = await api.fetch(API_BASE + apiPath, {
    method,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    ...(data ? { data } : {}),
  });
  let body: unknown = null;
  try {
    body = await r.json();
  } catch {
    body = null;
  }
  return { status: r.status(), body };
}

/** Scroll a page top-to-bottom over totalMs, finish back at top. */
export async function scrollTopToBottom(page: Page, totalMs = 2_000): Promise<void> {
  const steps = 14;
  const stepMs = Math.max(40, Math.floor(totalMs / steps));
  for (let i = 0; i <= steps; i++) {
    const frac = i / steps;
    await page.evaluate((f) => {
      const h = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      window.scrollTo({ top: h * f, behavior: 'auto' });
    }, frac);
    await page.waitForTimeout(stepMs);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'auto' }));
  await page.waitForTimeout(150);
}

/** Get an access token from the API directly (for the on-camera verdicts). */
export async function getToken(api: APIRequestContext): Promise<string> {
  const r = await api.fetch(API_BASE + '/v1/auth/password/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: { email: DEMO_EMAIL, password: DEMO_PASSWORD, tenant_slug: TENANT_SLUG },
  });
  const body = (await r.json()) as { tokens?: { access_token?: string } };
  return body?.tokens?.access_token ?? '';
}

/**
 * Sign in via the real UI and return the token. Used by clips that need an
 * authenticated session on screen. Clips that only need to *show* a screen the
 * app gates behind auth call this at the start.
 */
export async function signInAndGetToken(page: Page, api: APIRequestContext): Promise<string> {
  const token = await getToken(api);
  await page.goto(`${WEB_BASE}/login`);
  const slug = page.getByTestId('tenant-slug');
  if (await slug.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await slug.fill(TENANT_SLUG);
  }
  await page.getByTestId('email').fill(DEMO_EMAIL);
  await page.getByTestId('password').fill(DEMO_PASSWORD);
  await page.getByTestId('signin').click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 12_000 });
  return token;
}

/* -------------------------------------------------------------------------- */
/* Live-interaction helpers — these make the action VISIBLE on camera so the    */
/* recording shows the product being USED, not just pages being shown.        */
/* -------------------------------------------------------------------------- */

/** Plain pause, for letting the viewer read/watch. */
export async function pause(page: Page, ms = 900): Promise<void> {
  await page.waitForTimeout(ms);
}

/**
 * Inject a soft “spotlight” ring on an element so the eye is drawn to where the
 * next action happens, then remove it. Pure visual aid; no behaviour change.
 */
async function spotlight(page: Page, selector: string, ms = 700): Promise<void> {
  await page.evaluate(
    ({ selector }) => {
      const el = document.querySelector(selector);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const ring = document.createElement('div');
      ring.id = 'roomard-spotlight';
      ring.style.cssText = `
        position: fixed; z-index: 999996; pointer-events: none;
        left: ${r.left - 6}px; top: ${r.top - 6}px;
        width: ${r.width + 12}px; height: ${r.height + 12}px;
        border: 3px solid #10b981; border-radius: 10px;
        box-shadow: 0 0 0 4px rgba(16,185,129,0.25);
        transition: opacity 0.2s;
      `;
      document.getElementById('roomard-spotlight')?.remove();
      document.body.appendChild(ring);
    },
    { selector },
  );
  await page.waitForTimeout(ms);
}

async function clearSpotlight(page: Page): Promise<void> {
  await page.evaluate(() => document.getElementById('roomard-spotlight')?.remove());
}

/**
 * Type into a field by data-testid, character-visible (Playwright slowMo gives
 * per-key delay), after spotlighting it so the viewer sees WHERE the data goes.
 */
export async function typeInto(
  page: Page,
  testId: string,
  text: string,
  opts: { clear?: boolean } = {},
): Promise<void> {
  const loc = page.getByTestId(testId);
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  await spotlight(page, `[data-testid="${testId}"]`, 450);
  await loc.click();
  if (opts.clear) await loc.fill('');
  await loc.pressSequentially(text, { delay: 45 });
  await clearSpotlight(page);
  await page.waitForTimeout(250);
}

/** Select an option in a <select> by data-testid (spotlighted). */
export async function selectOptionByTestId(
  page: Page,
  testId: string,
  opt: { label?: string; value?: string; index?: number },
): Promise<void> {
  await spotlight(page, `[data-testid="${testId}"]`, 450);
  const loc = page.getByTestId(testId);
  if (opt.label) await loc.selectOption({ label: opt.label }).catch(() => loc.selectOption({ index: opt.index ?? 1 }));
  else if (opt.value) await loc.selectOption(opt.value);
  else await loc.selectOption({ index: opt.index ?? 1 });
  await clearSpotlight(page);
  await page.waitForTimeout(250);
}

/** Spotlight a control by testid, pause so the viewer sees it, then click it. */
export async function highlightAndClick(page: Page, testId: string, dwellMs = 650): Promise<void> {
  await spotlight(page, `[data-testid="${testId}"]`, dwellMs);
  await page.getByTestId(testId).click();
  await clearSpotlight(page);
  await page.waitForTimeout(350);
}
