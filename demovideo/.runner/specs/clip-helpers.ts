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
