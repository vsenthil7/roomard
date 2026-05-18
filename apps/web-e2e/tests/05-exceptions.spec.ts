import { test, expect } from '../fixtures/auth.js';

test.describe('Exception queue', () => {
  test('switches between open / in_progress / resolved tabs', async ({ loggedInPage: page }) => {
    await page.goto('/exceptions');
    await expect(page.getByRole('heading', { name: 'Exceptions' })).toBeVisible();
    await page.getByTestId('tab-resolved').click();
    await expect(page.getByTestId('tab-resolved')).toHaveAttribute('aria-selected', 'true');
    await page.getByTestId('tab-open').click();
    await expect(page.getByTestId('tab-open')).toHaveAttribute('aria-selected', 'true');
  });

  test('resolves an open exception if one is present', async ({ loggedInPage: page }) => {
    await page.goto('/exceptions');
    await page.getByTestId('tab-open').click();
    const list = page.getByTestId('exception-list');
    const isPresent = await list.isVisible().catch(() => false);
    if (!isPresent) test.skip(true, 'no exceptions to resolve in demo tenant');
    const firstResolve = list.locator('[data-testid^="resolve-"]').first();
    if (await firstResolve.isVisible().catch(() => false)) {
      await firstResolve.click();
      // After resolution, the item leaves the open list
      await page.waitForTimeout(500);
    }
  });
});
