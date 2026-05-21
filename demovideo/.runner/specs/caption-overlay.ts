/**
 * Caption overlay helper for the Roomard demo recording.
 *
 * Ported from the ATRIO Boardroom (AT-Hack0021) sibling project's
 * caption-overlay.ts, which itself was ported from MendoraCI (AT-Hack0020)
 * and Forensa (AT-Hack0018). Stable contract across four projects:
 *   - showTitleCard:   full-screen title/subtitle/footnote, dwellMs
 *   - showSceneCard:   full-screen GIVEN/WHEN/THEN scene with step header
 *   - showCaptionPill: top-of-screen pill that does NOT block the UI
 *   - clearOverlay:    remove both
 *
 * Colours match Roomard's brand: deep teal background (#0a4a3f), pale-mint
 * paper text, teal accent for headers, blue for steps, green for success,
 * red for blockers/rejects, amber for warnings.
 */
import { Page } from '@playwright/test';

const BG = '#031a15';            // roomard-900 ink
const BG_CARD = '#073529';       // roomard-700 panel
const WHITE = '#ffffff';
const TEXT_PRIMARY = '#e6f4f1';  // roomard-50
const TEXT_SECONDARY = '#bfe1d9';// roomard-100
const ACCENT_TEAL = '#10b981';   // roomard signal green/teal accent
const ACCENT_BLUE = '#3b82f6';
const ACCENT_GREEN = '#10b981';
const ACCENT_RED = '#dc2626';
const ACCENT_AMBER = '#f59e0b';

export async function showTitleCard(
  page: Page,
  opts: { title: string; subtitle: string; footnote?: string; durationMs: number },
): Promise<void> {
  await page.evaluate(
    ({ title, subtitle, footnote, bg, white, textPrimary, textSecondary, blue, teal }) => {
      const existing = document.getElementById('roomard-overlay');
      if (existing) existing.remove();
      const overlay = document.createElement('div');
      overlay.id = 'roomard-overlay';
      overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 999999;
        background: ${bg}; color: ${white};
        font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
        display: flex; flex-direction: column; justify-content: center; padding: 80px;
      `;
      const subtitleHtml = subtitle.split('\n').map((s) => `<div>${s}</div>`).join('');
      overlay.innerHTML = `
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:48px;">
          <div style="width:24px;height:6px;background:${teal};border-radius:2px;"></div>
          <div style="font-size:14px;color:${textSecondary};letter-spacing:2px;">AT-HACK0019 \u00b7 BAIDU BUILD WITH MEDO 2026</div>
        </div>
        <div style="font-size:96px;font-weight:700;letter-spacing:-3px;margin-bottom:12px;line-height:0.95;">${title}</div>
        <div style="width:120px;height:4px;background:${blue};margin-bottom:32px;"></div>
        <div style="font-size:28px;color:${textPrimary};font-weight:400;line-height:1.5;">${subtitleHtml}</div>
        ${footnote ? `<div style="margin-top:48px;font-size:16px;color:${textSecondary};">${footnote}</div>` : ''}
      `;
      document.body.appendChild(overlay);
    },
    {
      title: opts.title,
      subtitle: opts.subtitle,
      footnote: opts.footnote ?? '',
      bg: BG,
      white: WHITE,
      textPrimary: TEXT_PRIMARY,
      textSecondary: TEXT_SECONDARY,
      blue: ACCENT_BLUE,
      teal: ACCENT_TEAL,
    },
  );
  await page.waitForTimeout(opts.durationMs);
}

export async function showSceneCard(
  page: Page,
  opts: {
    step: string;
    given: string;
    when: string;
    then: string;
    durationMs: number;
  },
): Promise<void> {
  await page.evaluate(
    ({ step, given, when, then, bg, white, textPrimary, blue, green, red, teal }) => {
      const existing = document.getElementById('roomard-overlay');
      if (existing) existing.remove();
      const overlay = document.createElement('div');
      overlay.id = 'roomard-overlay';
      overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 999999;
        background: ${bg}; color: ${white};
        font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
        display: flex; flex-direction: column; justify-content: center; padding: 64px;
      `;
      overlay.innerHTML = `
        <div style="font-size:14px;color:${teal};letter-spacing:2px;margin-bottom:32px;font-weight:600;">${step}</div>
        <div style="display:grid;grid-template-columns:140px 1fr;gap:24px 32px;font-size:26px;line-height:1.5;">
          <div style="color:${red};font-weight:600;">GIVEN</div>
          <div style="color:${textPrimary};">${given}</div>
          <div style="color:${blue};font-weight:600;">WHEN</div>
          <div style="color:${textPrimary};">${when}</div>
          <div style="color:${green};font-weight:600;">THEN</div>
          <div style="color:${textPrimary};">${then}</div>
        </div>
      `;
      document.body.appendChild(overlay);
    },
    {
      step: opts.step,
      given: opts.given,
      when: opts.when,
      then: opts.then,
      bg: BG,
      white: WHITE,
      textPrimary: TEXT_PRIMARY,
      blue: ACCENT_BLUE,
      green: ACCENT_GREEN,
      red: ACCENT_RED,
      teal: ACCENT_TEAL,
    },
  );
  await page.waitForTimeout(opts.durationMs);
}

export async function showCaptionPill(
  page: Page,
  opts: { text: string; tone?: 'info' | 'success' | 'warn' | 'danger' },
): Promise<void> {
  await page.evaluate(
    ({ text, tone, bgCard, white, blue, green, amber, red }) => {
      const existing = document.getElementById('roomard-pill');
      if (existing) existing.remove();
      const accent =
        tone === 'success' ? green : tone === 'warn' ? amber : tone === 'danger' ? red : blue;
      const pill = document.createElement('div');
      pill.id = 'roomard-pill';
      pill.style.cssText = `
        position: fixed; top: 24px; left: 50%; transform: translateX(-50%);
        z-index: 999998;
        background: ${bgCard}; color: ${white};
        font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
        font-size: 18px; font-weight: 500;
        padding: 12px 24px; border-radius: 999px;
        border: 2px solid ${accent};
        box-shadow: 0 4px 16px rgba(0,0,0,0.4);
        max-width: 80vw;
        text-align: center;
      `;
      pill.textContent = text;
      document.body.appendChild(pill);
    },
    {
      text: opts.text,
      tone: opts.tone ?? 'info',
      bgCard: BG_CARD,
      white: WHITE,
      blue: ACCENT_BLUE,
      green: ACCENT_GREEN,
      amber: ACCENT_AMBER,
      red: ACCENT_RED,
    },
  );
}

/**
 * Test-runner-style verdict panel, docked bottom-left, that does NOT cover the
 * UI it is verifying. Shows the real assertion, the LIVE value returned by the
 * product, and a PASS/FAIL badge. This is what makes the proof visible in-frame:
 * the assertion and the product's actual outcome are shown together.
 *
 * `assertions` is a list of { label, expected, actual, pass } rows — each is a
 * real check run against the live API/DOM during the recording, not a caption.
 */
export async function showVerdict(
  page: Page,
  opts: {
    title: string;
    request?: string; // e.g. "GET /v1/guests/{id}/preferences"
    assertions: Array<{ label: string; expected: string; actual: string; pass: boolean }>;
  },
): Promise<void> {
  await page.evaluate(
    ({ title, request, assertions, bgCard, white, textPrimary, textSecondary, green, red, teal }) => {
      const existing = document.getElementById('roomard-verdict');
      if (existing) existing.remove();
      const allPass = assertions.every((a) => a.pass);
      const panel = document.createElement('div');
      panel.id = 'roomard-verdict';
      panel.style.cssText = `
        position: fixed; left: 24px; bottom: 24px; z-index: 999998;
        width: 560px; max-width: 46vw;
        background: ${bgCard}; color: ${white};
        font-family: "SF Mono", "Cascadia Code", Consolas, "Roboto Mono", monospace;
        border-radius: 12px;
        border: 2px solid ${allPass ? green : red};
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        overflow: hidden;
      `;
      const rows = assertions
        .map((a) => {
          const badge = a.pass
            ? `<span style="color:${green};font-weight:700;">\u2713 PASS</span>`
            : `<span style="color:${red};font-weight:700;">\u2717 FAIL</span>`;
          return `
            <div style="padding:8px 0;border-top:1px solid rgba(255,255,255,0.08);">
              <div style="display:flex;justify-content:space-between;gap:12px;">
                <span style="color:${textPrimary};font-size:14px;">${a.label}</span>
                ${badge}
              </div>
              <div style="color:${textSecondary};font-size:12px;margin-top:3px;">
                expect: <span style="color:${textPrimary};">${a.expected}</span>
                &nbsp;\u2192&nbsp; actual: <span style="color:${a.pass ? green : red};">${a.actual}</span>
              </div>
            </div>`;
        })
        .join('');
      panel.innerHTML = `
        <div style="background:${allPass ? green : red};color:#03150f;padding:8px 16px;font-weight:700;font-size:13px;letter-spacing:1px;display:flex;justify-content:space-between;">
          <span>${title}</span>
          <span>${allPass ? 'ALL ASSERTIONS PASS' : 'ASSERTION FAILED'}</span>
        </div>
        <div style="padding:10px 16px 14px;">
          ${request ? `<div style="color:${teal};font-size:13px;margin-bottom:4px;">$ ${request}</div>` : ''}
          ${rows}
        </div>
      `;
      document.body.appendChild(panel);
    },
    {
      title: opts.title,
      request: opts.request ?? '',
      assertions: opts.assertions,
      bgCard: BG_CARD,
      white: WHITE,
      textPrimary: TEXT_PRIMARY,
      textSecondary: TEXT_SECONDARY,
      green: ACCENT_GREEN,
      red: ACCENT_RED,
      teal: ACCENT_TEAL,
    },
  );
}

export async function clearOverlay(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.getElementById('roomard-overlay')?.remove();
    document.getElementById('roomard-pill')?.remove();
    document.getElementById('roomard-verdict')?.remove();
  });
}
