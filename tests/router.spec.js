import { test, expect } from '@playwright/test';

test('leaving a "resume or start over" prompt still opens the next page and keeps the saved test', async ({ page }) => {
  await page.goto('/#/ch/1/test/1');
  await page.locator('.choices input, .choices button, .choices label').first().click();
  await page.evaluate(() => { location.hash = '#/'; });
  await expect(page.locator('h1').first()).not.toHaveText(/Practice Test/);
  await page.evaluate(() => { location.hash = '#/ch/1/test/1'; });
  await expect(page.locator('#resume')).toBeVisible();
  await page.evaluate(() => { location.hash = '#/progress'; });
  await expect(page.locator('#resume')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/progress$/);
  expect(await page.evaluate(() => localStorage.getItem('scor.resume.test.1.1'))).not.toBeNull();
  // The prompt still works when you come back to it.
  await page.evaluate(() => { location.hash = '#/ch/1/test/1'; });
  await page.locator('#resume').click();
  await expect(page.locator('.choices')).toBeVisible();
});
