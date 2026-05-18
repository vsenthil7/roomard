/**
 * Shared E2E fixtures.
 *
 * - `loggedInPage` — a page that has already been signed in via the seeded
 *   demo user (front_desk_manager@demo.local / Roomard123!). MFA is mocked
 *   off in the demo tenant.
 */
import { test as base, type Page } from '@playwright/test';

const DEMO_EMAIL = process.env.E2E_DEMO_EMAIL ?? 'front_desk_manager@demo.local';
const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD ?? 'Roomard123!';
const DEMO_TENANT = process.env.E2E_DEMO_TENANT ?? 'demo';

export async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('tenant-slug').fill(DEMO_TENANT);
  await page.getByTestId('email').fill(DEMO_EMAIL);
  await page.getByTestId('password').fill(DEMO_PASSWORD);
  await page.getByTestId('signin').click();
  // If MFA is required, the next page has the mfa-code field. Otherwise we
  // land on /.
  const mfa = page.getByTestId('mfa-code');
  if (await mfa.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await mfa.fill(process.env.E2E_MFA_CODE ?? '000000');
    await page.getByTestId('verify-mfa').click();
  }
  await page.waitForURL(/^(?!.*\/login).+$/);
}

export const test = base.extend<{ loggedInPage: Page }>({
  loggedInPage: async ({ page }, use) => {
    await signIn(page);
    await use(page);
  },
});

export { expect } from '@playwright/test';
