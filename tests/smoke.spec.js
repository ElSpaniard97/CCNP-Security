import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const data = JSON.parse(fs.readFileSync('data/tests/ch01.json'));
async function answer(page, correct = true) {
  const text = await page.locator('.question').innerText();
  const q = data.tests.flatMap(t => t.questions).find(q => q.q === text);
  const i = correct ? q.answer : (q.answer + 1) % 4;
  await page.locator(`.choice[data-ci="${i}"]`).click();
}
async function complete(page, correct = true, count = 20) {
  for (let i = 0; i < count; i++) { await answer(page, correct); await page.locator('#next').click(); }
  await expect(page.locator('.score-head')).toBeVisible();
}
test('tile body, resume, retake, last results and missed bank', async ({ page }) => {
  await page.goto('/#/ch/1');
  const tile = page.locator('.test-tile').first();
  await tile.click({ position: { x: 12, y: 70 } });
  await expect(page.locator('.question')).toBeVisible();
  for (let i = 0; i < 5; i++) { await answer(page, false); await page.locator('#next').click(); }
  await page.goto('/');
  await expect(page.locator('#app')).toContainText('5 of 20 answered');
  await page.goto('/#/ch/1/test/1'); await page.locator('#resume').click();
  await expect(page.locator('#app')).toContainText('Question 6 of 20');
  await complete(page, true, 15);
  await expect(page.locator('.score-ring')).toContainText('75%');
  await expect(page.locator('.quiz .btn.primary')).toHaveCount(1);
  await page.locator('#retry').click(); await complete(page,true,5);
  await expect(page.locator('.quiz .btn.primary')).toHaveCount(1);
  await page.locator('#again').click(); await complete(page);
  await page.goto('/#/ch/1/test/1/last');
  await expect(page.locator('.score-ring')).toContainText('100%');
  await expect(page.locator('.att')).toHaveCount(2);
  // A separate missed question must clear only on its second correct drill answer.
  await page.evaluate(() => { localStorage.setItem('scor.bank', JSON.stringify({'1.1.0':{s:0,at:Date.now()}})); });
  for (let round = 0; round < 2; round++) {
    await page.goto('/'); await page.goto('/#/bank'); await page.locator('#go').click(); await complete(page, true, 1);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('scor.bank'))['1.1.0'].s)).toBe(round+1);
  }
  await page.goto('/'); await page.goto('/#/bank'); await expect(page.locator('#app')).toContainText('bank is empty');
});
test('spaced repetition Good and Again', async ({ page }) => {
  await page.goto('/#/srs');
  await expect(page.locator('#flash')).toBeVisible();
  await page.locator('#flash').click(); await page.locator('[data-g="again"]').click();
  await expect(page.locator('#app')).toContainText('10 cards left');
  await page.locator('#flash').click(); await page.locator('[data-g="good"]').click();
  await expect(page.locator('#app')).toContainText('9 cards left');
});
test('exam flag, resume and submit', async ({ page }) => {
  await page.goto('/#/exam'); await page.locator('[data-len="25"]').click(); await page.locator('#go').click();
  await page.locator('.choice').first().click(); await page.locator('#flag').click();
  await page.locator('#next').click();
  const time = await page.locator('#clock').innerText();
  await page.goto('/'); await page.goto('/#/exam'); await page.locator('#resume').click();
  await expect(page.locator('#app')).toContainText('Question 2 of 25');
  const seconds=s=>s.split(':').reduce((m,v)=>m*60+Number(v),0);
  expect(Math.abs(seconds(await page.locator('#clock').innerText())-seconds(time))).toBeLessThanOrEqual(3);
  page.on('dialog', d => d.accept());
  await page.locator('#end').click();
  if (await page.locator('#submit-exam').count()) await page.locator('#submit-exam').click();
  await expect(page.locator('#app')).toContainText('By chapter');
});
test('export/reset/import including v1 and legacy review decks', async ({ page }) => {
  page.on('dialog', d => d.accept());
  await page.goto('/#/progress');
  await page.evaluate(() => localStorage.setItem('scor.best.1.1','90'));
  await page.reload();
  const dlPromise = page.waitForEvent('download'); await page.locator('#export').click();
  const download = await dlPromise; const exported = fs.readFileSync(await download.path());
  await page.locator('#reset').click();
  expect(await page.evaluate(() => localStorage.getItem('scor.best.1.1'))).toBeNull();
  await page.locator('#import').setInputFiles({name:'progress.json',mimeType:'application/json',buffer:exported});
  await expect(page.locator('.kpis')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('scor.best.1.1'))).toBe('90');
  await page.locator('#import').setInputFiles({name:'v1.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'scor-study',v:1,data:{'scor.best.1.1':'85'}}))});
  await expect.poll(() => page.evaluate(() => localStorage.getItem('scor.best.1.1'))).toBe('85');
  await page.evaluate(() => localStorage.setItem('scor.review', JSON.stringify({cards:[[1,'Cybersecurity']],label:'Legacy deck'})));
  await page.goto('/#/review'); await expect(page.locator('#flash')).toContainText('Cybersecurity');
});
test('mocked sync merges histories and excludes token', async ({ page }) => {
  let pushed;
  const remote = {history:[{ch:2,t:1,at:1,right:18,total:20}], 'best.2.1':90};
  await page.route('https://api.github.com/**', async route => {
    if (route.request().method() === 'PATCH') { pushed=JSON.parse(route.request().postData()); await route.fulfill({json:{id:'fake'}}); }
    else await route.fulfill({json:route.request().url().includes('?') ? [{id:'fake',description:'SCOR study progress (written by the study site)',files:{'scor-progress.json':{}}}] : {files:{'scor-progress.json':{content:JSON.stringify({data:remote})}}}});
  });
  await page.goto('/#/progress');
  await page.evaluate(() => localStorage.setItem('scor.history',JSON.stringify([{ch:1,t:1,at:2,right:16,total:20}])));
  await page.locator('#token').fill('mock-token-only'); await page.locator('#sync-on').click();
  await expect.poll(() => pushed).toBeTruthy();
  const content=JSON.parse(pushed.files['scor-progress.json'].content);
  expect(content.data.history).toHaveLength(2);
  expect(JSON.stringify(pushed)).not.toContain('mock-token-only');
});
for (const width of [320,390,768]) test(`routes at ${width}px`, async ({ page }) => {
  await page.setViewportSize({width,height:900}); const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  for (const route of ['/', '/ch/1','/ch/1/cards','/ch/1/test/1','/study','/srs','/bank','/exam','/progress','/search']) {
    await page.goto('/#'+route); await expect(page.locator('#app h1')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true);
  }
  expect(errors).toEqual([]);
});
test('keyboard-only practice test', async ({ page }) => {
  await page.goto('/#/ch/1/test/1');
  for(let i=0;i<20;i++) { await expect(page.locator('.question')).toBeVisible(); await page.keyboard.press('1'); await page.keyboard.press('Enter'); }
  await expect(page.locator('.score-head')).toBeVisible();
});
