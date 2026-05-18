import { test, expect } from '../fixtures/auth.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.describe('Capture flow', () => {
  test('upload card → OCR result rendered', async ({ loggedInPage: page }) => {
    await page.goto('/captures/new');
    await expect(page.getByRole('heading', { name: /new capture/i })).toBeVisible();

    // Pick property if more than one
    const property = page.getByTestId('capture-property');
    const props = await property.locator('option').all();
    if (props.length > 1) {
      await property.selectOption({ index: 1 });
    }

    // Set a tiny fake image file (Playwright can attach buffer-backed files)
    const fileInput = page.getByTestId('capture-file');
    await fileInput.setInputFiles({
      name: 'test-card.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('fake-jpeg-bytes-for-e2e-test'),
    });

    await page.getByTestId('capture-submit').click();

    // Either a result card or a queued banner — both are valid: backend may
    // be in mock mode (synchronous OCR) or unreachable (queued).
    const result = page.getByTestId('capture-result');
    const queued = page.getByTestId('queued-banner');
    await Promise.race([
      result.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => null),
      queued.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => null),
    ]);
    // At least one of the two must have appeared
    const seen = (await result.isVisible()) || (await queued.isVisible());
    expect(seen).toBe(true);
  });
});
