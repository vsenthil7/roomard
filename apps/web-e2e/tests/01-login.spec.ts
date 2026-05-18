import { test, expect, signIn } from '../fixtures/auth.js';

test.describe('Authentication', () => {
  test('user can sign in with valid credentials', async ({ page }) => {
    await signIn(page);
    // After login the brief shell is visible
    await expect(page.getByRole('link', { name: 'Roomard' })).toBeVisible();
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible();
  });

  test('rejects invalid credentials with a helpful error', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('tenant-slug').fill('demo');
    await page.getByTestId('email').fill('nobody@nowhere.example');
    await page.getByTestId('password').fill('wrongwrongwrong');
    await page.getByTestId('signin').click();
    await expect(page.getByRole('alert')).toBeVisible();
  });

  test('redirects unauthenticated visitors to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });
});
