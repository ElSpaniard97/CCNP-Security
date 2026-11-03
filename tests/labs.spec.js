import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const index = JSON.parse(fs.readFileSync(new URL('../data/labs/index.json', import.meta.url)));
const lab = id => JSON.parse(fs.readFileSync(new URL(`../data/labs/${id}.json`, import.meta.url)));

// Works through one step the way a careful student would, using the lab's own answers.
async function solveStep(page, step) {
  const body = page.locator('.lab-step.current .lab-step-body');
  if (step.type === 'cli') {
    for (const c of step.commands) {
      const prompt = await body.locator('#term-prompt').textContent();
      const cmd = c.mode === 'priv' && prompt.endsWith(')#') ? `do ${c.cmd}` : c.cmd;
      await body.locator('#term-in').fill(cmd);
      await body.locator('#term-in').press('Enter');
    }
  } else if (step.type === 'choice') {
    for (const o of step.options.filter(o => o.correct)) await body.locator('.lab-opt', { hasText: o.text.replace(/\*\*/g, '') }).locator('input').check();
    await body.locator('#check').click();
  } else if (step.type === 'order') {
    for (let want = 0; want < step.items.length; want++) {
      for (;;) {
        const texts = await body.locator('.lab-order li > span').allTextContents();
        const at = texts.indexOf(step.items[want].replace(/\*\*/g, ''));
        if (at === want) break;
        await body.locator(`[data-up="${at}"]`).click();
      }
    }
    await body.locator('#check').click();
  } else if (step.type === 'form') {
    for (const [k, f] of step.fields.entries()) {
      const el = body.locator(`#f${k}`);
      if (f.kind === 'check') await el.setChecked(!!f.answer);
      else if (f.kind === 'select') await el.selectOption([].concat(f.answer)[0]);
      else await el.fill([].concat(f.answer)[0]);
    }
    await body.locator('#check').click();
  }
}

test('the labs page lists every lab', async ({ page }) => {
  await page.goto('/#/labs');
  await expect(page.locator('.lab-tile')).toHaveCount(index.length);
  await expect(page.locator('[data-nav="labs"][aria-current="page"]')).toBeVisible();
});

for (const meta of index) {
  test(`lab ${meta.n} can be completed with a perfect score: ${meta.title}`, async ({ page }) => {
    const data = lab(meta.id);
    await page.goto(`/#/labs/${meta.id}`);
    for (const [i, step] of data.steps.entries()) {
      await expect(page.locator(`#step-${i}.current`)).toBeVisible();
      await solveStep(page, step);
    }
    await expect(page.locator('.lab-result')).toBeVisible();
    await expect(page.locator('.lab-score strong').first()).toHaveText('100');
    const saved = await page.evaluate(id => JSON.parse(localStorage.getItem('scor.labs'))[id].runs, meta.id);
    expect(saved).toHaveLength(1);
    expect(saved[0].score).toBe(100);
    expect(await page.evaluate(id => localStorage.getItem(`scor.lab.pos.${id}`), meta.id)).toBeNull();
  });
}

test('steps unlock in order, mistakes cost points, and hints and answers open after wrong tries', async ({ page }) => {
  await page.goto('/#/labs/secure-mgmt');
  await expect(page.locator('#step-1.locked')).toBeVisible();
  const input = page.locator('#term-in'), say = page.locator('#feedback');
  // A command for a later step is refused, and the step stays locked.
  await input.fill('ip ssh version 2'); await input.press('Enter');
  await expect(say).toContainText('in order');
  await input.fill('conf t'); await input.press('Enter');
  await expect(page.locator('#term-prompt')).toHaveText('R1(config)#');
  await input.fill('ip domain name scor.lab'); await input.press('Enter');
  await input.fill('show ip ssh'); await input.press('Enter');
  await expect(page.locator('#term-out')).toContainText('no output');
  await input.fill('ip domain nme scor.lab'); await input.press('Enter');
  await expect(say).toContainText('nme should be name');
  await expect(page.locator('#hint')).toBeEnabled();
  await page.locator('#hint').click();
  await expect(page.locator('.lab-hint')).toContainText('crypto key generate rsa');
  await input.fill('ip domain-name scor.lab'); await input.press('Enter');
  await expect(say).toContainText('already configured');
  await input.fill('cry key gen rsa mod 2048'); await input.press('Enter');
  await input.fill('ip ssh ver 2'); await input.press('Enter');
  await expect(page.locator('#step-1.current')).toBeVisible();
  // Two wrong tries and one hint: 100 - 8 - 5.
  const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('scor.lab.pos.secure-mgmt')).steps[0]);
  expect(rec).toMatchObject({ wrong: 2, hint: true, reveal: false });
});

test('the console coaches mode slips and typos without hiding the answer', async ({ page }) => {
  await page.goto('/#/labs/secure-mgmt');
  const input = page.locator('#term-in'), say = page.locator('#feedback');
  for (const c of ['conf t', 'ip domain name scor.lab', 'crypto key generate rsa modulus 2048', 'ip ssh version 2']) { await input.fill(c); await input.press('Enter'); }
  await expect(page.locator('#step-1.current')).toBeVisible();
  const cli = page.locator('#step-1 #term-in'), fb = page.locator('#step-1 #feedback');
  await cli.fill('end'); await cli.press('Enter');
  // "enable" at the # prompt is harmless, as on IOS.
  await cli.fill('en'); await cli.press('Enter');
  await expect(page.locator('#step-1 #term-prompt')).toHaveText('R1#');
  await expect(fb).toBeEmpty();
  // A configuration command at the # prompt says how to get to the right mode.
  await cli.fill('enable secret En4bleLab!'); await cli.press('Enter');
  await expect(fb).toContainText('configure terminal');
  await cli.fill('conf t'); await cli.press('Enter');
  // Invisible characters from pasted text are ignored; a wrong password is pointed out.
  await cli.fill('enable secret\u200b En4bleLab!'); await cli.press('Enter');
  await expect(fb).toContainText('stored hashed');
  await cli.fill('username admin privilege 15 secret Sc0rLab'); await cli.press('Enter');
  await expect(fb).toContainText('Sc0rLab should be Sc0rLab!');
  const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('scor.lab.pos.secure-mgmt')).steps[1]);
  expect(rec.wrong).toBe(2);
});

test('a lab in progress resumes at the same step with its console history', async ({ page }) => {
  await page.goto('/#/labs/aaa-tacacs');
  await page.locator('.lab-opt', { hasText: 'TCP port 49' }).locator('input').check();
  await page.locator('.lab-opt', { hasText: 'entire body' }).locator('input').check();
  await page.locator('.lab-opt', { hasText: 'separately' }).locator('input').check();
  await page.locator('#check').click();
  await expect(page.locator('#step-1.current')).toBeVisible();
  await page.locator('#term-in').fill('aaa new-model'); await page.locator('#term-in').press('Enter');
  await page.evaluate(() => { location.hash = '#/labs'; });
  await expect(page.locator('[data-lab="aaa-tacacs"] .badge')).toContainText('step 2');
  await page.locator('[data-lab="aaa-tacacs"] a').click();
  await page.locator('#resume').click();
  await expect(page.locator('#step-1.current')).toBeVisible();
  await expect(page.locator('#term-out')).toContainText('aaa new-model');
  await page.locator('#term-in').fill('tacacs server ISE'); await page.locator('#term-in').press('Enter');
  await expect(page.locator('#term-prompt')).toHaveText('R1(config-server-tacacs)#');
});

test('lab results survive a backup round trip and merge by run', async ({ page }) => {
  await page.goto('/#/labs');
  const out = await page.evaluate(async () => {
    const { merge, restore, snapshot } = await import('./assets/store.js');
    const a = { labs: { 'secure-mgmt': { runs: [{ at: 1, score: 90, ms: 600000 }] } } };
    const b = { labs: { 'secure-mgmt': { runs: [{ at: 2, score: 100, ms: 500000 }] }, 'bad id!': { runs: [] } }, 'lab.pos.secure-mgmt': { step: 2, at: 5, steps: [], devices: { R1: { modes: ['exec', 'priv'], log: [['<b>x</b>', 'evil']] } } } };
    const merged = merge(a, b);
    restore(merged);
    return snapshot();
  });
  expect(out.labs['secure-mgmt'].runs.map(r => r.score)).toEqual([90, 100]);
  expect(out.labs['bad id!']).toBeUndefined();
  expect(out['lab.pos.secure-mgmt'].devices.R1.log[0][1]).toBe('res');
});

test('completed labs show on the progress dashboard', async ({ page }) => {
  await page.goto('/#/labs');
  await page.evaluate(() => localStorage.setItem('scor.labs', JSON.stringify({ 'secure-mgmt': { runs: [{ at: 1, score: 88, ms: 540000 }] } })));
  await page.evaluate(() => { location.hash = '#/progress'; });
  await expect(page.locator('a[href="#/labs"]', { hasText: '1 lab completed' })).toBeVisible();
});
