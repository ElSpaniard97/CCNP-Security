import { test, expect } from '@playwright/test';

// The counter reads "Card [n] of N", with n in a number box.
async function expectCard(page, n, of) {
  await expect(page.locator('#goto')).toHaveValue(String(n));
  if (of) await expect(page.locator('#goto-of')).toHaveText(`of ${of}`);
}

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
  await expectCard(page, 1, 2);
  await expect(page.locator('#flash .front .term')).toHaveText(first);

  await page.goto('/#/ch/3/cards');
  await expect(page.locator('#app h1')).toHaveText('Chapter 3 flashcards');
  await page.locator('#star').click();
  await page.goto('/#/starred');
  await expect(page.locator('#app h1')).toHaveText('Starred cards');
  await expectCard(page, 1, 3);
  await expect(page.locator('.side-nav [data-nav="starred"]')).toHaveAttribute('aria-current', 'page');
  await page.locator('#star').click();
  await expectCard(page, 1, 3);
  await page.reload();
  await expectCard(page, 1, 2);

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
  await expectCard(page, 1, 1);
});

test('sidebar collapses to icons, keeps its state and expands again', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const sidebar = page.locator('.sidebar');
  const toggle = page.locator('#sidebar-toggle');
  expect((await sidebar.boundingBox()).width).toBeGreaterThan(200);
  // The button sits at the top of the page, in view without scrolling.
  expect((await toggle.boundingBox()).y).toBeLessThan(60);
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

test('a flashcard deck reopens at the card you left off on', async ({ page }) => {
  await page.goto('/#/ch/4/cards');
  for (let i = 0; i < 4; i++) await page.locator('#next').click();
  const term = await page.locator('#flash .front .term').textContent();
  await page.goto('/#/ch/4');
  await page.goto('/#/ch/4/cards');
  await expectCard(page, 5);
  await expect(page.locator('#flash .front .term')).toHaveText(term);
  await expect(page.locator('.resume-note')).toBeVisible();
  // Each deck filter keeps its own place, and a shuffled order comes back as it was.
  await page.locator('[data-deck="Ports and Protocols"]').click();
  await expectCard(page, 1);
  await page.locator('#shuffle').click();
  await page.locator('#next').click();
  const shuffled = await page.locator('#flash .front .term').textContent();
  await page.reload();
  await expectCard(page, 5);
  await page.locator('[data-deck="Ports and Protocols"]').click();
  await expectCard(page, 2);
  await expect(page.locator('#flash .front .term')).toHaveText(shuffled);
  await page.locator('[data-deck="All"]').click();
  await page.locator('#from-start').click();
  await expectCard(page, 1);
  await page.reload();
  await expectCard(page, 1);
  await expect(page.locator('.resume-note')).toHaveCount(0);
});

test('typing a card number jumps to that card', async ({ page }) => {
  await page.goto('/#/ch/2/cards');
  const total = +(await page.locator('#goto').getAttribute('max'));
  await page.locator('#goto').fill('28');
  await page.locator('#goto').press('Enter');
  await expectCard(page, 28, total);
  await expect(page.locator('#flash')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expectCard(page, 29);
  await page.keyboard.press('g');
  await expect(page.locator('#goto')).toBeFocused();
  await page.keyboard.type('5');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await expectCard(page, 5);
  for (const bad of ['0', String(total + 1)]) {
    await page.locator('#goto').fill(bad);
    await page.locator('#goto').press('Enter');
    await expect(page.locator('#goto')).toHaveJSProperty('validationMessage', `Enter a number from 1 to ${total}.`);
  }
  await page.reload();
  await expectCard(page, 5);
});
