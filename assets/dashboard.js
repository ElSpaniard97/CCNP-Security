import { chapters, attempts, bests, latestByTest, streak, bankActive, srsDue, store, pctOf, esc, fmtAgo, secName } from './runtime.js';
import { icon, chapterDetails } from './visuals.js';

function metric(tone, glyph, label, value, detail, href) {
  return `<a class="metric card tone-${tone}" href="${href}"><span class="metric-icon">${icon(glyph)}</span><span class="metric-content"><span class="metric-label">${label}</span><strong>${value}</strong><span class="metric-detail">${detail}</span></span></a>`;
}
function stats() {
  const best=bests(), passed=Object.values(best).filter(n=>n>=80).length, latest=Object.values(latestByTest());
  const scores=latest.map(a=>pctOf(a.right,a.total));
  const average=scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : null;
  const dayStreak=streak();
  const due=srsDue().length, coverage=pctOf(passed,chapters.length*5);
  return `<section class="dashboard-metrics" aria-label="Study overview">
    ${metric('green','check','Tests Passed',`${passed}<small> / ${chapters.length*5}</small>`,passed ? 'Keep building your confidence' : 'Your first milestone awaits', '#/progress')}
    ${metric('blue','chart','Average Score',average===null ? '—' : `${average}%`,average===null ? 'Complete a test to begin' : 'Latest full test attempts', '#/progress')}
    ${metric('amber','fire','Study Streak',`${dayStreak}<small> ${dayStreak===1 ? "day" : "days"}</small>`,dayStreak ? 'Keep the momentum going' : 'Make today day one', '#/progress')}
    ${metric('purple','cards','Cards Due Today',due,due ? 'Review now →' : 'Build your review habit →', '#/srs')}
    ${metric('cyan','target','Practice Coverage',`${coverage}%`,`<span class="mini-meter"><span style="width:${coverage}%"></span></span>${passed} of ${chapters.length*5} tests passed`, '#/progress')}
  </section>`;
}
function tools() {
  return `<div class="dashboard-tools" aria-label="Study tools">${[
    ['green','cards','Flashcards','Review key concepts and terms.','#/study'],
    ['blue','test','Practice Tests','Test your knowledge by chapter.','#/practice'],
    ['purple','repeat','Spaced Repetition','Build lasting recall, one card at a time.','#/srs'],
    ['amber','alert','Missed Questions','Focus on what needs more work.','#/bank'],
  ].map(([tone,glyph,title,detail,href])=>`<a class="card dashboard-tool tone-${tone}" href="${href}"><span class="tool-icon">${icon(glyph)}</span><span><b>${title}</b><small>${detail}</small></span>${icon('chevron','tool-chevron')}</a>`).join('')}</div>`;
}
export function chapterGrid(chapterStatus, statusLine) {
  return `<div class="chips chapter-filters" role="group" aria-label="Filter chapters">${['All','In progress','Not started','Below 80%'].map((f,i)=>`<button class="chip" data-filter="${f}" aria-pressed="${i===0}">${f}</button>`).join('')}</div>
    <p id="filter-empty" class="muted" hidden>No chapters match this filter.</p>
    <div class="chapter-grid">${chapters.map(c=>{
      const x=chapterStatus(c.n), percent=pctOf(x.passed,5), [glyph,detail]=chapterDetails[c.n] || ['book','Study the key concepts in this chapter.'];
      return `<article class="card chapter" data-chapter="${c.n}">
        <div class="chapter-top"><span class="chapter-icon tone-${c.n%3===0 ? 'cyan' : c.n%2 ? 'green' : 'blue'}">${icon(glyph)}</span><div><div class="num">Chapter ${c.n}</div><h3><a href="#/ch/${c.n}">${esc(c.title)}</a></h3><p class="chapter-description">${detail}</p></div><a class="chapter-open" href="#/ch/${c.n}" aria-label="Open Chapter ${c.n}">${icon('chevron')}</a></div>
        <div class="chapter-progress"><div class="mini-meter"><span style="width:${percent}%"></span></div><span>${percent}%</span></div>
        <div class="chapter-status"><span>${statusLine(c.n)}</span><span class="badge ${x.passed===5 ? 'good' : x.taken || x.active ? 'active' : ''}">${x.passed===5 ? 'Completed' : x.taken || x.active ? 'In progress' : 'Not started'}</span></div>
        <div class="chapter-actions"><a href="#/ch/${c.n}/cards">${c.cards} flashcards</a><a href="#/ch/${c.n}">Practice tests ${icon('arrow')}</a></div>
      </article>`;
    }).join('')}</div>`;
}
function panel(title, glyph, href, body, label='View all') {
  return `<section class="card rail-panel"><div class="panel-heading"><h2>${icon(glyph)}${title}</h2><a href="${href}">${label} ${icon('arrow')}</a></div>${body}</section>`;
}
function activity() {
  const history=attempts().slice(-5).reverse();
  return panel('Recent Activity','clock','#/progress',history.length ? `<ol class="activity-list">${history.map(a=>{
    const score=pctOf(a.right,a.total), title=a.exam ? 'Mock exam' : a.retry ? `Chapter ${a.ch} · Retry round` : `Chapter ${a.ch} · Practice Test ${a.t}`;
    const href=a.exam ? '#/exam/last' : `#/ch/${a.ch}/test/${a.t}/last`;
    return `<li><span class="activity-icon tone-${score>=80 ? 'green' : 'blue'}">${icon(score>=80 ? 'check' : 'test')}</span><a href="${href}"><b>${title}</b><small>Score: ${score}% (${a.right}/${a.total})</small></a><time>${fmtAgo(a.at)}</time></li>`;
  }).join('')}</ol>` : `<div class="rail-empty">${icon('chart')}<p>Your journey starts here.</p><small>Completed tests and exam scores will appear here.</small><a href="#/ch/1/test/1">Take your first practice test ${icon('arrow')}</a></div>`);
}
function upcoming() {
  const now=Date.now(), groups=new Map();
  Object.entries(store.get('srs',{})).forEach(([key,value])=>{
    const n=Number(key.split('|')[0]), title=chapters.find(c=>c.n===n)?.title;
    if(!title) return;
    const group=groups.get(n) || {n,title,due:0,next:Infinity,total:0};
    group.total++; if(value.due<=now)group.due++; group.next=Math.min(group.next,value.due);groups.set(n,group);
  });
  const sorted=[...groups.values()].sort((a,b)=>a.next-b.next).slice(0,3);
  return panel('Upcoming Review','repeat','#/srs',sorted.length ? `<ul class="review-schedule">${sorted.map(g=>`<li><span class="activity-icon tone-amber">${icon('cards')}</span><a href="#/srs/${g.n}"><b>${esc(g.title)}</b><small>${g.due || g.total} cards</small></a><span class="schedule-due ${g.due ? 'due' : ''}">${g.due ? 'Due today' : new Date(g.next).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span></li>`).join('')}</ul>` : '<p class="rail-copy">Your next review is a few cards away. Start a flashcard session to build your schedule.</p><a class="rail-link" href="#/srs">Start reviewing →</a>');
}
function weakSections() {
  const groups=new Map();
  Object.values(latestByTest()).forEach(a=>Object.entries(a.secs || {}).forEach(([section,[right,total]])=>{
    const key=`${a.ch}|${section}`, group=groups.get(key) || {ch:a.ch,section,right:0,total:0};group.right+=right;group.total+=total;groups.set(key,group);
  }));
  const weak=[...groups.values()].filter(x=>x.total>=2 && x.right<x.total).sort((a,b)=>a.right/a.total-b.right/b.total).slice(0,3);
  return panel('Weak Sections','alert','#/progress',weak.length ? `<ul class="weak-list">${weak.map(x=>{const p=pctOf(x.right,x.total);return `<li><span class="activity-icon tone-${p<60 ? 'red' : 'amber'}">${icon('target')}</span><a href="#/ch/${x.ch}"><b>${esc(secName(x.section))}</b><small>${p}% · ${x.right} of ${x.total} right</small></a><span class="mini-meter"><span style="width:${p}%"></span></span></li>`;}).join('')}</ul>` : `<p class="rail-copy">${attempts().length ? 'No repeated misses in your latest tests. Keep testing your knowledge.' : 'Take a practice test to discover the topics that deserve a second look.'}</p><a class="rail-link" href="#/bank">Missed-question bank · ${bankActive().length} waiting →</a>`);
}
export function dashboardHTML(nextAction, chapterStatus, statusLine) {
  return `<section class="dashboard-hero"><span class="hero-shield">${icon('shield')}</span><div><p class="eyebrow">LEARN. PRACTICE. MASTER.</p><h1>CCNP Security SCOR 350-701</h1><p class="hero-subtitle">Study Platform</p><p class="hero-description">Master security. Build expertise. Achieve your goals.</p></div></section>
    ${stats()}<div class="dashboard-layout"><div class="dashboard-main">${nextAction()}${tools()}
    <section class="chapter-section" aria-labelledby="chapters-heading"><div class="section-heading"><h2 id="chapters-heading">${icon('book')} Chapters</h2><a href="#/chapters">Explore all chapters ${icon('arrow')}</a></div>${chapterGrid(chapterStatus,statusLine)}</section></div>
    <aside class="dashboard-rail" aria-label="Your study activity">${activity()}${upcoming()}${weakSections()}<div class="study-note">${icon('shield')}<p>One chapter at a time.<br><strong>You’re building your expertise.</strong></p></div></aside></div>`;
}
