import { test, expect } from '@playwright/test';

const word = (page, text) => page.locator('#page .w', { hasText: new RegExp(`^${text}`) }).first();

test('listen and read lists narrated chapters and links from the chapter page', async ({ page }) => {
  await page.goto('/#/read');
  await expect(page.locator('#app h1')).toHaveText('Listen and read');
  await expect(page.locator('.reader-list .test-tile')).toHaveCount(8);
  await page.goto('/#/ch/2');
  await page.getByRole('link', { name: /Read along with the narration/ }).click();
  await expect(page).toHaveURL(/#\/ch\/2\/read$/);
  await expect(page.locator('.side-nav [data-nav="read"]')).toHaveAttribute('aria-current', 'page');
});

test('selecting a word jumps the narration there and highlights it', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('scor.reader', JSON.stringify({ dict: false })));
  await page.goto('/#/ch/2/read');
  const target = word(page, 'integrity');
  await target.scrollIntoViewIfNeeded();
  await target.evaluate(el => el.click());
  await expect(target).toHaveClass(/\bon\b/);
  await expect(target.locator('xpath=..')).toHaveClass(/line-on/);
  const t = await page.evaluate(() => document.getElementById('audio').currentTime);
  expect(t).toBeGreaterThan(15);
  expect(t).toBeLessThan(25);
});

test('dictionary shows the chapter flashcard for a term', async ({ page }) => {
  await page.route('https://api.dictionaryapi.dev/**', r => r.fulfill({ status: 404, body: '' }));
  await page.goto('/#/ch/2/read');
  const pki = word(page, 'PKI');
  await pki.scrollIntoViewIfNeeded();
  await pki.evaluate(el => el.click());
  await expect(page.locator('#pop')).toBeVisible();
  await expect(page.locator('#pop .pop-card')).toContainText('public key infrastructure');
  await page.keyboard.press('Escape');
  await expect(page.locator('#pop')).toBeHidden();
});

test('text, grammar and reading preferences apply and persist', async ({ page }) => {
  await page.goto('/#/ch/2/read');
  await page.locator('[data-panel="text"]').click();
  await page.locator('#size').fill('40');
  await page.locator('[data-page="sepia"]').click();
  await page.locator('[data-font="serif"]').click();
  await page.locator('[data-panel="grammar"]').click();
  await page.locator('#syll').check();
  await page.locator('input[data-pos="v"]').check();
  await page.locator('[data-panel="reading"]').click();
  await page.locator('#focus-on').check();
  await page.locator('[data-focus="3"]').click();
  await page.reload();
  await expect(page.locator('#page')).toHaveAttribute('style', /--reader-size: 40px/);
  await expect(page.locator('#app')).toHaveAttribute('data-page', 'sepia');
  await expect(page.locator('#page')).toHaveAttribute('data-font', 'serif');
  await expect(page.locator('#page')).toHaveClass(/syll/);
  await expect(page.locator('#page')).toHaveClass(/show-v/);
  await expect(page.locator('.focus-mask.top')).toBeVisible();
  await expect(word(page, 'Cryptography').locator('.syl')).toBeVisible();
});

test('reader fits a phone screen and keeps the player in view', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
    await page.goto(`/#/ch/${n}/read`);
    await expect(page.locator('.reader-title')).toContainText(`Chapter ${n}:`);
    await expect(page.locator('#page .w').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const box = await page.locator('.player').boundingBox();
    expect(box.y + box.height, `chapter ${n}: ${JSON.stringify(box)}`).toBeLessThanOrEqual(844);
  }
});
