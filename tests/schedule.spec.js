import { test, expect } from '@playwright/test';

test('starter week shows, is editable, saves, and checks off today', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/#/schedule');
  await expect(page.locator('h1')).toHaveText('Study schedule');
  await expect(page.locator('.sched-note')).toContainText('starter week');
  await expect(page.locator('.sched-day')).toHaveCount(7);
  // Starter: Mon-Fri, 4 hours shared by Listen and read, flashcards and a practice test.
  await expect(page.locator('.sched-block')).toHaveCount(15);
  await expect(page.locator('.sched-day[data-day="0"] .sched-block').nth(2)).toContainText('8:40 PM · 1 h 20 min');
  await expect(page.locator('.sched-day[data-day="5"] .sched-block')).toHaveCount(0);
  await expect(page.locator('#s-exam')).toHaveValue('2027-02-22');
  expect(await page.evaluate(() => localStorage.getItem('scor.schedule'))).toBeNull();

  // Add a custom block on Sunday.
  await page.locator('[data-add="6"]').click();
  await expect(page.locator('#s-dialog')).toBeVisible();
  await page.locator('#e-act').selectOption('custom');
  await expect(page.locator('#e-ch-wrap')).toBeHidden();
  await page.locator('#e-start').fill('10:30');
  await page.locator('#e-mins').fill('45');
  await page.locator('#e-note').fill('Watch a VPN video');
  await page.locator('#s-form button[value="save"]').click();
  await expect(page.locator('#s-dialog')).toBeHidden();
  const sunday = page.locator('.sched-day[data-day="6"] .sched-block');
  await expect(sunday).toHaveCount(1);
  await expect(sunday).toContainText('Watch a VPN video');
  await expect(page.locator('.sched-note')).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('scor.schedule')));
  expect(saved.blocks).toHaveLength(16);

  // Edit it to a fixed chapter flashcard block, then delete it.
  await sunday.click();
  await page.locator('#e-act').selectOption('cards');
  await page.locator('#e-ch').selectOption('3');
  await page.locator('#s-form button[value="save"]').click();
  await expect(sunday).toContainText('Ch 3');
  await sunday.click();
  await page.locator('#e-del').click();
  await expect(sunday).toHaveCount(0);

  // Build a custom week: Tue, Thu, Sun, 90 min weekend splits into two.
  await page.locator('.sched-builder').evaluate(d => { d.open = true; });
  for (let i = 0; i < 7; i++) await page.locator(`[name="b-day"][value="${i}"]`).setChecked(false);
  for (const i of [1, 3, 6]) await page.locator(`[name="b-day"][value="${i}"]`).setChecked(true);
  await page.locator('#b-we-mins').fill('90');
  await page.locator('#b-go').click();
  await expect(page.locator('.sched-block')).toHaveCount(9);
  // A short session takes one activity a day instead of splitting.
  await page.locator('.sched-builder').evaluate(d => { d.open = true; });
  await page.locator('#b-wd-mins').fill('30');
  await page.locator('#b-we-mins').fill('30');
  await page.locator('#b-go').click();
  await expect(page.locator('.sched-block')).toHaveCount(3);
  await page.locator('#s-undo').click();
  await expect(page.locator('.sched-block')).toHaveCount(9);

  // Exam date spreads chapters; 13 weeks out leaves 2 review weeks.
  await page.locator('.sched-plan').evaluate(d => { d.open = true; });
  const today = new Date(); const monday = new Date(today); monday.setDate(today.getDate() - (today.getDay() + 6) % 7);
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await page.locator('#s-start').fill(iso(monday));
  const exam = new Date(monday); exam.setDate(monday.getDate() + 7 * 12 + 4);
  await page.locator('#s-exam').fill(iso(exam));
  await expect(page.locator('.sched-roadmap li')).toHaveCount(13);
  await expect(page.locator('.sched-roadmap li').last()).toContainText('Review all chapters');
  await expect(page.locator('.sched-roadmap li.now')).toContainText('Chapter 1');

  // Every day gets a block so today's list always has one to check off.
  await page.locator('.sched-builder').evaluate(d => { d.open = true; });
  for (let i = 0; i < 7; i++) await page.locator(`[name="b-day"][value="${i}"]`).setChecked(true);
  await page.locator('#b-go').click();
  const item = page.locator('.sched-today .sched-item').first();
  await expect(item.locator('a.btn')).toHaveAttribute('href', /#\/(ch\/1|srs|labs)/);
  await item.locator('input[type=checkbox]').check();
  await expect(page.locator('.sched-today .sched-item.done')).toHaveCount(1);
  const done = await page.evaluate(() => JSON.parse(localStorage.getItem('scor.schedule.done')));
  expect(Object.keys(done)).toHaveLength(1);

  // Calendar export downloads an .ics with one weekly event per block.
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#s-ics').click()]);
  expect(dl.suggestedFilename()).toBe('scor-study-schedule.ics');
  const ics = await (await dl.createReadStream()).toArray().then(c => Buffer.concat(c).toString());
  expect(ics.match(/BEGIN:VEVENT/g).length).toBe(await page.locator('.sched-week .sched-block').count());
  expect(ics).toContain('RRULE:FREQ=WEEKLY;UNTIL=');

  // Backups keep the schedule.
  const kept = await page.evaluate(async () => {
    const s = await import('./assets/store.js');
    const snap = s.snapshot(); s.restore(snap);
    return [!!localStorage.getItem('scor.schedule'), !!localStorage.getItem('scor.schedule.done')];
  });
  expect(kept).toEqual([true, true]);
  await expect(page.locator('.side-nav [data-nav="schedule"]')).toHaveAttribute('aria-current', 'page');
  expect(errors).toEqual([]);
});

test('schedule fits a phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/schedule');
  await expect(page.locator('.sched-day')).toHaveCount(7);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
