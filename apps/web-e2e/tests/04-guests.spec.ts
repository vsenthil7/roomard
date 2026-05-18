import { test, expect } from '../fixtures/auth.js';

test.describe('Guest search and detail', () => {
  test('searches guests and opens a profile', async ({ loggedInPage: page }) => {
    await page.goto('/guests');
    await expect(page.getByRole('heading', { name: 'Guests' })).toBeVisible();
    await page.getByTestId('guest-search').fill('a');
    // Wait for debounce + fetch
    await page.waitForTimeout(500);
    const list = page.getByTestId('guest-list');
    await expect(list).toBeVisible();

    // If there's at least one row, open it
    const rows = await list.locator('li a').all();
    if (rows.length > 0) {
      await rows[0]!.click();
      await expect(page).toHaveURL(/\/guests\/[a-f0-9-]+/);
      // Detail page either shows the preferences section or the empty state
      await expect(page.getByRole('heading', { name: /preferences/i })).toBeVisible();
    }
  });
});
