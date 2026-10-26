import { test, expect } from '@playwright/test';

test('desktop sidebar destinations, active states, search and shortcut', async ({ page }) => {
  await page.setViewportSize({width:1448,height:1086});
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await expect(page.locator('.sidebar')).toBeVisible();
  for(const [nav,heading] of [['chapters','Chapters'],['practice','Practice Tests'],['study','Study'],['srs','Spaced repetition'],['bank','Missed questions'],['exam','Mock exam'],['progress','Progress dashboard'],['settings','Settings']]) {
    await page.locator(`.side-nav [data-nav="${nav}"]`).click();
    await expect(page.locator('#app h1')).toHaveText(heading);
    await expect(page.locator(`.side-nav [data-nav="${nav}"]`)).toHaveAttribute('aria-current','page');
  }
  await page.keyboard.press('Control+k');await expect(page.locator('#header-search')).toBeFocused();
  await page.locator('#header-search').fill('Cybersecurity');await page.locator('#header-search').press('Enter');
  await expect(page.locator('#results')).toContainText('Cybersecurity');
  await expect(page.locator('.side-nav [data-nav="search"]')).toHaveAttribute('aria-current','page');
  await page.locator('#deck').click();await expect(page.locator('#flash')).toBeVisible();
});

test('dashboard panels reflect stored progress without invented metrics', async ({ page }) => {
  await page.addInitScript(()=>{
    const now=Date.now();
    const seed={history:[{ch:8,t:1,at:now,right:15,total:20,secs:{'VPN fundamentals':[1,4]}}],'best.8.1':75,
      srs:{'8|IPsec':{b:1,due:now-1000,at:now}},bank:{'8.1.0':{s:0,at:now}}};
    for(const [key,value] of Object.entries(seed))localStorage.setItem('scor.'+key,JSON.stringify(value));
  });
  await page.goto('/');
  const metrics=page.locator('.metric');
  await expect(metrics.nth(0)).toContainText('0 / 55');
  await expect(metrics.nth(1)).toContainText('75%');
  await expect(metrics.nth(2)).toContainText('1 day');
  await expect(metrics.nth(3)).toContainText('1');
  await expect(page.locator('.activity-list')).toContainText('Chapter 8 · Practice Test 1');
  await expect(page.locator('.review-schedule')).toContainText('Due today');
  await expect(page.locator('.weak-list')).toContainText('25% · 1 of 4 right');
  await expect(page.locator('.next-action')).toContainText('Retake Ch 8 · Test 1');
  await expect(page.locator('.chapter[data-chapter="8"]')).toContainText('In progress');
});

for(const theme of ['dark','light']) test(`all study surfaces in ${theme} theme`,async({page})=>{
  await page.addInitScript(t=>localStorage.setItem('scor.theme',JSON.stringify(t)),theme);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const width of [320,390,768,1448]) {
    await page.setViewportSize({width,height:900});
    for(const route of ['','chapters','practice','settings','study','ch/1','ch/1/cards','ch/1/test/1','srs','bank','exam','progress','search']) {
      await page.goto('/#/'+route);await expect(page.locator('#app h1')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${theme}/${width}/${route}`).toBe(true);
    }
  }
  expect(errors).toEqual([]);
});

test('mobile settings, theme persistence, and skip link preserve the quiz route', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  await page.locator('.mobile-settings').click();await expect(page.locator('#app h1')).toHaveText('Settings');
  await expect(page.locator('#export')).toBeVisible();await expect(page.locator('#download-offline')).toBeVisible();
  await page.locator('#theme').click();await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.goto('/#/ch/1/test/1');await expect(page.locator('.question')).toBeVisible();
  const before=page.url();await page.locator('.skip-link').focus();await page.keyboard.press('Enter');
  expect(page.url()).toBe(before);await expect(page.locator('#main')).toBeFocused();await expect(page.locator('.question')).toBeVisible();
});
