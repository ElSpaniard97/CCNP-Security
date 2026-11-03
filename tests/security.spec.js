import { test, expect } from '@playwright/test';

test('an imported backup cannot run script or add unknown keys', async ({ page }) => {
  page.on('dialog', d => d.accept());
  await page.goto('/#/progress');
  const evil = '"><img src=x onerror="window.__pwned=1">';
  const data = {
    history: [{ ch: evil, t: evil, at: Date.now(), right: 1, total: 2, secs: { [evil]: [evil, 2] } }],
    [`resume.test.1.1`]: { title: evil, ch: 1, t: 1, items: [{ chosen: 0 }], at: Date.now() },
    [`resume.${evil}`]: { title: evil, ch: 1, t: 1, items: [{ chosen: 0 }], at: Date.now() },
    sync: { token: 'planted' },
    'something.else': 1,
  };
  await page.locator('#import').setInputFiles({ name: 'evil.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'scor-study', v: 2, data })) });
  // The title shows as text in the resume banner instead of becoming markup.
  await expect(page.locator('.resume-list')).toContainText('onerror=');
  const keys = await page.evaluate(() => Object.keys(localStorage).sort());
  expect(keys).toEqual(['scor.history', 'scor.resume.test.1.1']);
  const h = await page.evaluate(() => JSON.parse(localStorage.getItem('scor.history'))[0]);
  expect(typeof h.ch).toBe('number');
  for (const route of ['#/progress', '#/', '#/ch/1']) { await page.goto('/' + route); await expect(page.locator('#app h1').first()).toBeVisible(); }
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  expect(await page.locator('#app img').count()).toBe(0);
});

test('pages load under the content security policy with no violations', async ({ page }) => {
  const violations = [];
  page.on('console', m => { if (/Content Security Policy/i.test(m.text())) violations.push(m.text()); });
  await page.route('https://api.dictionaryapi.dev/**', r => r.fulfill({ status: 404, body: '' }));
  for (const route of ['#/', '#/chapters', '#/study', '#/ch/2', '#/ch/2/cards', '#/starred', '#/srs', '#/bank', '#/exam', '#/search/RADIUS', '#/progress', '#/settings', '#/read', '#/ch/2/read']) {
    await page.goto('/' + route);
    await expect(page.locator('#app')).not.toContainText('Loading…');
  }
  await page.locator('#page .w').first().click();
  await expect(page.locator('#pop')).toBeVisible();
  expect(violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toMatch(/dark|light/);
});
