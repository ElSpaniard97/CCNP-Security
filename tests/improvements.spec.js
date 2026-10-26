import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { selectExam } from '../assets/blueprint.js';
const blueprint=JSON.parse(fs.readFileSync('data/blueprint.json'));
const pools=Object.fromEntries(Array.from({length:11},(_,k)=>[k+1,JSON.parse(fs.readFileSync(`data/tests/ch${String(k+1).padStart(2,'0')}.json`)).tests.flatMap((t,ti)=>t.questions.map((q,i)=>({ch:k+1,t:ti+1,i,q})))]));
test('study preset allocations, balance and uniqueness at all lengths',()=>{
  for(const len of [25,50,100]) {
    const items=selectExam(blueprint,pools,len,a=>a.slice());
    expect(items).toHaveLength(len);
    expect(new Set(items.map(x=>`${x.ch}.${x.t}.${x.i}`)).size).toBe(len);
    for(const d of blueprint.domains) expect(Math.abs(items.filter(x=>x.domain===d.id).length-len*d.weight/100)).toBeLessThanOrEqual(1);
  }
});
test('initial home transfer budget and no eager flashcards', async ({page})=>{
  const json=[]; page.on('request',r=>{if(r.url().endsWith('.json'))json.push(r.url());});
  await page.goto('/'); await expect(page.locator('h1')).toBeVisible();
  expect(json.some(p=>p.includes('/flashcards'))).toBe(false);
  const initial=['index.html','assets/style.css','assets/design.css',...fs.readdirSync('assets').filter(p=>p.endsWith('.js')).map(p=>'assets/'+p),'data/chapters.json','data/blueprint.json'];
  const gzip=initial.reduce((total,p)=>total+zlib.gzipSync(fs.readFileSync(p)).length,0);
  expect(gzip).toBeLessThan(150*1024);
});
const baseHistory={ch:1,t:1,at:1,right:10,total:20};
const seeds=[
 ['resume', {'resume.test.1.1':{ch:1,t:1,title:'Practice Test 1',at:1,items:[{chosen:0},{chosen:null}]}},'Resume Practice Test 1'],
 ['due', {srs:Object.fromEntries(Array.from({length:10},(_,i)=>[`1|card${i}`,{due:1}]))},'Review 10 due'],
 ['bank', {bank:Object.fromEntries(Array.from({length:5},(_,i)=>[`1.1.${i}`,{s:0}]))},'Clear missed questions'],
 ['retake', {history:[baseHistory],'best.1.1':50},'Retake Ch 1 · Test 1'],
 ['untaken', {'best.1.1':90},'Start Ch 1 · Test 2'],
 ['exam', Object.fromEntries(Array.from({length:11},(_,c)=>Array.from({length:5},(_,t)=>[`best.${c+1}.${t+1}`,90])).flat()),'Take a full mock exam']
];
for(const [name,data,text] of seeds) test(`home rule: ${name}`,async({page})=>{
  await page.addInitScript(data=>{for(const [k,v] of Object.entries(data))localStorage.setItem('scor.'+k,JSON.stringify(v));},data);
  await page.goto('/'); await expect(page.locator('.next-action')).toContainText(text);
  await expect(page.locator('.next-action .primary')).toHaveCount(1);
});
test('first visit, chapter filters and navigation semantics',async({page})=>{
  await page.setViewportSize({width:390,height:844}); await page.goto('/');
  await expect(page.locator('.next-action')).toContainText('Start with Chapter 1');
  await expect(page.locator('.summary')).toHaveCount(0);
  await page.locator('[data-filter="In progress"]').click();
  await expect(page.locator('#filter-empty')).toBeVisible();
  await page.locator('.mobile-nav [data-nav="study"]').click();
  await expect(page.locator('h1')).toHaveText('Study');
  await expect(page.locator('.mobile-nav [data-nav="study"]')).toHaveAttribute('aria-current','page');
  await expect(page.locator('#main #crumbs')).toContainText('Study');
});
test('radio semantics, keyboard focus, flashcard single flip and 44px controls',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/#/ch/1/test/1');
  await expect(page.locator('.question')).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.getByRole('radio').first()).toBeFocused();
  // Practice answers are graded on pick, so arrows must only move focus.
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('radio').nth(1)).toBeFocused();
  await expect(page.getByRole('radio').nth(1)).toHaveAttribute('aria-checked','false');
  await expect(page.locator('.feedback')).toHaveCount(0);
  await page.keyboard.press('Space');
  await expect(page.getByRole('radio').nth(1)).toHaveAttribute('aria-checked','true');
  await page.locator('#next').click(); await expect(page.locator('.question')).toBeFocused();
  // Number keys still answer while a choice button has focus.
  await page.keyboard.press('Tab'); await expect(page.getByRole('radio').first()).toBeFocused();
  await page.keyboard.press('3');
  await expect(page.getByRole('radio').nth(2)).toHaveAttribute('aria-checked','true');
  await page.goto('/#/ch/1/cards');
  await expect(page.locator('.face.back')).toHaveAttribute('aria-hidden','true');
  await page.locator('#flip').focus(); await page.keyboard.press('Space');
  await expect(page.locator('#flash')).toHaveClass('flash flipped');
  await expect(page.locator('.face.front')).toHaveAttribute('aria-hidden','true');
  await page.keyboard.press('Enter'); await expect(page.locator('#flash')).not.toHaveClass('flash flipped');
  const small=await page.locator('.btn, .chip, .theme, .navlink').evaluateAll(els=>els.filter(e=>e.getBoundingClientRect().width>0 && e.getBoundingClientRect().height<44).map(e=>e.textContent));
  expect(small).toEqual([]);
});
test('exam review does not submit with accidental Enter; timer warnings',async({page})=>{
  await page.clock.install();await page.setViewportSize({width:390,height:844});await page.goto('/#/exam');
  await page.locator('[data-len="25"]').click();await page.locator('#go').click();
  await expect(page.locator('.mobile-nav')).toBeHidden();
  await page.clock.fastForward(20*60*1000);
  await expect(page.locator('#timer-announcement')).toHaveText('10 minutes remaining');
  await page.clock.fastForward(5*60*1000);
  await expect(page.locator('#timer-announcement')).toHaveText('5 minutes remaining');
  await page.clock.fastForward(4*60*1000);
  await expect(page.locator('#timer-announcement')).toHaveText('1 minute remaining');
  await page.locator('#end').click();await page.keyboard.press('Enter');
  await expect(page.locator('#submit-exam')).toBeVisible();
  await expect(page.locator('.score-head')).toHaveCount(0);
  await page.locator('[data-review="0"]').click();await expect(page.locator('.question')).toBeFocused();
  await page.locator('#end').click();await page.locator('#submit-exam').click();
  await expect(page.locator('#app')).toContainText('By exam domain');
  await expect(page.locator('.mobile-nav')).toBeVisible();
});
test('full study data download supports cold offline navigation and study',async({page,context})=>{
  await page.goto('/#/study');await page.locator('#download-offline').click();
  await expect(page.locator('#offline-status')).toContainText('ready offline',{timeout:30000});
  await context.setOffline(true);
  await page.reload();await expect(page.locator('h1')).toHaveText('Study');
  await page.goto('/#/ch/11/cards');await page.locator('#flash').click();await expect(page.locator('#flash')).toHaveClass('flash flipped');
  await page.goto('/#/ch/11/test/1');await expect(page.locator('.question')).toBeVisible();
  await page.goto('/#/exam');await page.locator('#go').click();await expect(page.locator('.question')).toBeVisible();
});
test('GitHub Pages project path works offline',async({page,context})=>{
  await page.goto('/CCNP-Security/#/study');await page.locator('#download-offline').click();
  await expect(page.locator('#offline-status')).toContainText('ready offline',{timeout:30000});
  expect(await page.evaluate(async()=> (await navigator.serviceWorker.ready).scope)).toContain('/CCNP-Security/');
  await context.setOffline(true);await page.reload();await expect(page.locator('h1')).toHaveText('Study');
  await page.goto('/CCNP-Security/#/ch/1/test/1');await expect(page.locator('.question')).toBeVisible();
});
test('home is available offline after first visit without the full data download',async({page,context})=>{
  await page.goto('/');await expect(page.locator('.next-action')).toBeVisible();
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await context.setOffline(true);await page.reload();await expect(page.locator('.next-action')).toContainText('Start with Chapter 1');
});
