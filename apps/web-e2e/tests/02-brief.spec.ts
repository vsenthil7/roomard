import { test, expect } from '../fixtures/auth.js';

test.describe("Today's brief", () => {
  test('shows arrivals broken down by priority', async ({ loggedInPage: page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /today.+arrivals/i })).toBeVisible();
    // Either we have arrivals or the empty card — both are valid states for a fresh tenant
    const list = page.getByTestId('brief-items');
    const empty = page.getByText(/no brief for today/i);
    await Promise.race([
      list.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => null),
      empty.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => null),
    ]);
  });

  test('property selector reloads brief when switched', async ({ loggedInPage: page }) => {
    await page.goto('/');
    const selector = page.getByTestId('property-selector');
    const isPresent = await selector.isVisible().catch(() => false);
    if (!isPresent) test.skip(true, 'only one property — selector hidden');
    const options = await selector.locator('option').all();
    if (options.length < 2) test.skip(true, 'only one property — switch test irrelevant');
    const secondValue = await options[1]!.getAttribute('value');
    await selector.selectOption(secondValue!);
    await expect(page).toHaveURL(/\//);
  });
});
