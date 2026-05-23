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

/**
 * A non-blocking "narrator" banner docked TOP-RIGHT that explains what is
 * happening on THIS screen while the live interaction runs underneath it. Unlike
 * showSceneCard (full-screen, between steps), this stays out of the way so the
 * viewer watches the product being used and reads the explanation at the same
 * time. Call it as the cursor arrives on each screen of the flow.
 *
 *   stepLabel:  e.g. "SCREEN 2 of 3 · ADD GUEST"
 *   headline:   one short line, what the user is doing here
 *   detail:     optional second line, why / what to watch
 */
export async function showStepBanner(
  page: Page,
  opts: { stepLabel: string; headline: string; detail?: string },
): Promise<void> {
  await page.evaluate(
    ({ stepLabel, headline, detail, bgCard, white, textSecondary, teal, blue }) => {
      const existing = document.getElementById('roomard-banner');
      if (existing) existing.remove();
      const banner = document.createElement('div');
      banner.id = 'roomard-banner';
      banner.style.cssText = `
        position: fixed; top: 20px; right: 20px; z-index: 999997;
        width: 360px; max-width: 42vw;
        background: ${bgCard}; color: ${white};
        font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
        border-radius: 12px; border-left: 5px solid ${teal};
        box-shadow: 0 8px 28px rgba(0,0,0,0.45);
        padding: 14px 18px;
      `;
      banner.innerHTML = `
        <div style="font-size:12px;letter-spacing:1.5px;color:${blue};font-weight:700;margin-bottom:6px;">${stepLabel}</div>
        <div style="font-size:18px;font-weight:600;line-height:1.35;">${headline}</div>
        ${detail ? `<div style="font-size:14px;color:${textSecondary};margin-top:6px;line-height:1.4;">${detail}</div>` : ''}
      `;
      document.body.appendChild(banner);
    },
    {
      stepLabel: opts.stepLabel,
      headline: opts.headline,
      detail: opts.detail ?? '',
      bgCard: BG_CARD,
      white: WHITE,
      textSecondary: TEXT_SECONDARY,
      teal: ACCENT_TEAL,
      blue: ACCENT_BLUE,
    },
  );
}

/**
 * STEP 2 — the user-journey STORYBOARD beat. Its OWN full-screen beat, shown
 * BEFORE the live run (not fused with it). A click-through filmstrip of the
 * flow: for each screen, blank -> filled -> action, and crucially what that
 * screen PRODUCES and how that output feeds the next screen (data lineage made
 * explicit). This is the piece the buyer said was missing: the viewer sees the
 * whole path on one card, with the API call + result under each step, before
 * watching the product do it for real.
 *
 *   title:  e.g. "SCREEN FLOW \u00b7 ONBOARD A NEW HOTEL"
 *   steps:  ordered screens. Each:
 *     screen:   screen name, e.g. "Login", "Property", "Guest"
 *     blank:    what the screen looks like empty, e.g. "[empty form]"
 *     filled:   what gets entered, e.g. "name / code / city"
 *     action:   the button/verb, e.g. "Create"
 *     produces: the lineage line, e.g. "POST /v1/properties => property exists"
 *   outcome: the closing line, e.g. "hotel is live — shows the property + guest + brief just created"
 */
export async function showStoryboard(
  page: Page,
  opts: {
    title: string;
    steps: Array<{ screen: string; blank: string; filled: string; action: string; produces: string }>;
    outcome?: string;
    durationMs: number;
  },
): Promise<void> {
  await page.evaluate(
    ({ title, steps, outcome, bg, bgCard, white, textPrimary, textSecondary, blue, green, teal, amber }) => {
      const existing = document.getElementById('roomard-overlay');
      if (existing) existing.remove();
      const overlay = document.createElement('div');
      overlay.id = 'roomard-overlay';
      overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 999999;
        background: ${bg}; color: ${white};
        font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
        display: flex; flex-direction: column; justify-content: center; padding: 56px 64px;
      `;
      const stepCards = steps
        .map((s, i) => {
          const arrow =
            i < steps.length - 1
              ? `<div style="display:flex;align-items:center;color:${teal};font-size:28px;padding:0 4px;">\u2192</div>`
              : '';
          return `
            <div style="display:flex;align-items:stretch;">
              <div style="flex:1;background:${bgCard};border-radius:10px;padding:14px 16px;border-top:4px solid ${blue};min-width:0;">
                <div style="font-size:13px;letter-spacing:1.5px;color:${blue};font-weight:700;margin-bottom:10px;">${s.screen}</div>
                <div style="font-size:15px;line-height:1.7;color:${textSecondary};">
                  <div><span style="color:${textPrimary};">blank</span> &nbsp;${s.blank}</div>
                  <div><span style="color:${textPrimary};">filled</span> &nbsp;${s.filled}</div>
                  <div><span style="color:${amber};font-weight:600;">${s.action}</span></div>
                </div>
                <div style="margin-top:10px;padding-top:8px;border-top:1px dashed rgba(255,255,255,0.15);font-family:'SF Mono',Consolas,monospace;font-size:12px;color:${green};line-height:1.4;">
                  \u21b3 ${s.produces}
                </div>
              </div>
              ${arrow}
            </div>`;
        })
        .join('');
      overlay.innerHTML = `
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:8px;">
          <div style="width:24px;height:6px;background:${teal};border-radius:2px;"></div>
          <div style="font-size:14px;color:${teal};letter-spacing:2px;font-weight:600;">${title}</div>
        </div>
        <div style="font-size:13px;color:${textSecondary};margin-bottom:28px;">Screen flow \u2014 what each screen produces and how it feeds the next (data lineage)</div>
        <div style="display:flex;gap:6px;align-items:stretch;">${stepCards}</div>
        ${outcome ? `<div style="margin-top:28px;font-size:18px;color:${textPrimary};display:flex;align-items:center;gap:12px;"><span style="color:${green};font-size:22px;">\u2713</span>${outcome}</div>` : ''}
      `;
      document.body.appendChild(overlay);
    },
    {
      title: opts.title,
      steps: opts.steps,
      outcome: opts.outcome ?? '',
      bg: BG,
      bgCard: BG_CARD,
      white: WHITE,
      textPrimary: TEXT_PRIMARY,
      textSecondary: TEXT_SECONDARY,
      blue: ACCENT_BLUE,
      green: ACCENT_GREEN,
      teal: ACCENT_TEAL,
      amber: ACCENT_AMBER,
    },
  );
  await page.waitForTimeout(opts.durationMs);
}

/** Remove just the step banner (leave verdict/pill in place). */
export async function clearBanner(page: Page): Promise<void> {
  await page.evaluate(() => document.getElementById('roomard-banner')?.remove());
}

export async function clearOverlay(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.getElementById('roomard-overlay')?.remove();
    document.getElementById('roomard-pill')?.remove();
    document.getElementById('roomard-verdict')?.remove();
    document.getElementById('roomard-banner')?.remove();
  });
}
