import { test, expect } from '@playwright/test';

test('starred cards get their own deck in the chapter and across chapters', async ({ page }) => {
  await page.goto('/#/ch/2/cards');
  const first = await page.locator('#flash .front .term').textContent();
  await page.locator('#star').click();
  await expect(page.locator('#star')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-deck="Starred"]')).toContainText('Starred (1)');
  await page.locator('#next').click();
  await page.keyboard.press('s');
  await expect(page.locator('#star')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-deck="Starred"]').click();
  await expect(page.locator('.flash-wrap .row.small')).toContainText('Card 1 of 2');
  await expect(page.locator('#flash .front .term')).toHaveText(first);

  await page.goto('/#/ch/3/cards');
  await page.locator('#star').click();
  await page.goto('/#/starred');
  await expect(page.locator('#app h1')).toHaveText('Starred cards');
  await expect(page.locator('.flash-wrap .row.small')).toContainText('Card 1 of 3');
  await expect(page.locator('.side-nav [data-nav="starred"]')).toHaveAttribute('aria-current', 'page');
  await page.locator('#star').click();
  await expect(page.locator('.flash-wrap .row.small')).toContainText('Card 1 of 3');
  await page.reload();
  await expect(page.locator('.flash-wrap .row.small')).toContainText('Card 1 of 2');

  await page.goto('/#/study');
  await expect(page.locator('a[href="#/starred"].tool')).toContainText('2 cards starred');
  await page.goto('/#/ch/2');
  await expect(page.locator('a[href="#/ch/2/cards/Starred"]')).toContainText('Starred (1)');
});

test('cards can be starred from search and the empty deck explains starring', async ({ page }) => {
  await page.goto('/#/starred');
  await expect(page.locator('#app')).toContainText("You haven't starred any cards yet");
  await page.goto('/#/search/RADIUS');
  const star = page.locator('#results .star-btn').first();
  await star.click();
  await expect(star).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/#/starred');
  await expect(page.locator('.flash-wrap .row.small')).toContainText('Card 1 of 1');
});

test('sidebar collapses to icons, keeps its state and expands again', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const sidebar = page.locator('.sidebar');
  const toggle = page.locator('#sidebar-toggle');
  expect((await sidebar.boundingBox()).width).toBeGreaterThan(200);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(async () => (await sidebar.boundingBox()).width).toBeLessThan(80);
  await expect(page.locator('.side-nav [data-nav="exam"]')).toHaveAttribute('title', 'Mock Exam');
  await expect(page.getByRole('link', { name: 'Mock Exam' })).toBeVisible();
  const main = await page.locator('main').boundingBox();
  expect(main.x).toBeLessThan(80);
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect((await sidebar.boundingBox()).width).toBeLessThan(80);
  await page.keyboard.press('[');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(async () => (await sidebar.boundingBox()).width).toBeGreaterThan(200);
});
