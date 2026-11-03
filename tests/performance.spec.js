import { test, expect } from '@playwright/test';

test('feature code loads only when a page needs it', async ({ page }) => {
  const loaded = new Set();
  page.on('request', r => { const m = r.url().match(/assets\/(\w+)\.js/); if (m) loaded.add(m[1]); });
  await page.goto('/#/study');
  await expect(page.locator('h1')).toBeVisible();
  for (const m of ['reader', 'quiz', 'progress', 'cards']) expect(loaded.has(m), `${m}.js on the study page`).toBe(false);
  await page.goto('/#/ch/2/test/1');
  await expect(page.locator('.choice').first()).toBeVisible();
  expect(loaded.has('quiz')).toBe(true);
  expect(loaded.has('reader')).toBe(false);
});

test('a page shown inside another site breaks out of the frame', async ({ page }) => {
  await page.route('**/framed.html', r => r.fulfill({ contentType: 'text/html', body: '<iframe src="/#/study"></iframe>' }));
  await page.goto('/framed.html');
  await expect(page).toHaveURL(/#\/study$/);
  await expect(page.locator('h1')).toBeVisible();
});

test('a long chapter keeps the current word in view when you jump around it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/ch/9/read');
  const seek = page.locator('#seek');
  await expect(seek).toBeVisible();
  // Off-screen blocks of the chapter are not drawn until they scroll near.
  expect(await page.locator('.rl-chunk').count()).toBeGreaterThan(5);
  const max = +(await seek.getAttribute('max'));
  for (const f of [0.9, 0.35, 0.7, 0.05]) {
    await seek.evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); }, Math.floor(max * f));
    await expect.poll(() => page.evaluate(() => {
      const r = document.querySelector('#page .w.on').getBoundingClientRect();
      return r.top > 0 && r.bottom < innerHeight;
    }), { timeout: 5000 }).toBe(true);
  }
  // Reopening the chapter returns to the saved place with the word on screen.
  await page.evaluate(() => localStorage.setItem('scor.reader.pos.9', JSON.stringify(1500)));
  await page.reload();
  await expect.poll(() => page.evaluate(() => {
    const el = document.querySelector('#page .w.on'); if (!el) return false;
    const r = el.getBoundingClientRect(); return r.top > 0 && r.bottom < innerHeight;
  }), { timeout: 5000 }).toBe(true);
});
