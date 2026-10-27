import { icon, chapterDetails } from "./visuals.js";
import { dashboardHTML, chapterGrid } from "./dashboard.js";
import { leaveView, app, DECKS, DECK_LABEL, PASS, BANK_CLEAR, EXAM_SECS_PER_Q, chapters, chap, blueprint, flashcards, leaveFns, setCrumbs, onKey, getJSON, loadCards, loadAllCards, getTests, question, attempts, fullAttempts, examAttempts, bests, latestByTest, streak, getResume, clearResume, unfinished, resumeHref, bankActive, store, syncNow, esc, shuffle, plural, pctOf, srsDue, starredList, selectExam, setNavigation, setStudyData } from "./runtime.js";
import { registerOffline, offlineHTML, wireOffline } from "./offline.js";
import { dashboard, trendChart, wireTrend, syncHTML, wireSync, backupHTML, wireBackup } from "./progress.js";
import { packItems, hydrate, newItem, runQuiz, resumePrompt, testView, recordResult, resultsView, attemptStrip, lastView } from "./quiz.js";
import { setFlashState, cardHTML, cardsView, srsView, searchView } from "./cards.js";
import { readerView, readerListView, readerIndex } from "./reader.js";

  // ---------- theme ----------
  const themeBtn = document.getElementById("theme");
  // With no saved choice, follow the system setting and keep following it if it changes.
  const systemDark = matchMedia("(prefers-color-scheme: dark)");
  const applyTheme = () => { document.documentElement.dataset.theme = store.get("theme", null) || (systemDark.matches ? "dark" : "light"); };
  applyTheme();
  systemDark.addEventListener("change", applyTheme);
  const isMac = /Mac|iPhone|iPad/.test(navigator.userAgentData?.platform || navigator.platform || "");
  document.querySelector(".header-search kbd").textContent = isMac ? "⌘ K" : "Ctrl K";
  document.querySelector(".skip-link").onclick=e=>{e.preventDefault();document.getElementById("main").focus();};
  document.querySelectorAll("[data-icon]").forEach(el=>el.innerHTML=icon(el.dataset.icon));
  document.querySelector(".header-search").onsubmit=e=>{e.preventDefault(); const q=document.getElementById("header-search").value.trim(); location.hash=q ? `#/search/${encodeURIComponent(q)}` : "#/search";};
  document.addEventListener("keydown",e=>{if((e.metaKey || e.ctrlKey) && e.key.toLowerCase()==="k"){e.preventDefault();const input=document.getElementById("header-search");if(input.getBoundingClientRect().width)input.focus();else location.hash="#/search";}});
  themeBtn.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    store.set("theme", next);
  });

  // ---------- collapsible sidebar ----------
  // The inline script in index.html applies the saved state before the first paint.
  const sideToggle = document.getElementById("sidebar-toggle");
  function setSidebar(collapsed) {
    document.documentElement.classList.toggle("nav-collapsed", collapsed);
    sideToggle.setAttribute("aria-expanded", String(!collapsed));
    sideToggle.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
    document.querySelectorAll(".side-nav a").forEach(a => { if (collapsed) a.title = a.textContent.trim(); else a.removeAttribute("title"); });
    sideToggle.title = collapsed ? "Expand sidebar ([)" : "Collapse sidebar ([)";
  }
  setSidebar(document.documentElement.classList.contains("nav-collapsed"));
  sideToggle.onclick = () => { const next = !document.documentElement.classList.contains("nav-collapsed"); setSidebar(next); store.set("sidebar", next); };
  document.addEventListener("keydown", e => {
    if (e.key !== "[" || e.metaKey || e.ctrlKey || e.altKey || e.target.closest("input, textarea, select, [contenteditable]")) return;
    if (sideToggle.getBoundingClientRect().width) sideToggle.click();
  });

  // ---------- views ----------
  function toolsRow() {
    const due = srsDue().length, bank = bankActive().length;
    return `<div class="tools">
      <a class="card tool" href="#/srs"><b>Review flashcards</b><span class="muted small">${due ? `${plural(due, "card")} due` : "Spaced repetition, all chapters"}</span></a>
      <a class="card tool" href="#/bank"><b>Missed questions</b><span class="muted small">${bank ? `${bank} to clear` : "Nothing to clear yet"}</span></a>
      <a class="card tool" href="#/exam"><b>Mock exam</b><span class="muted small">Timed, every chapter</span></a>
      <a class="card tool" href="#/search"><b>Search</b><span class="muted small">Every flashcard</span></a>
    </div>`;
  }

  function statusForTest(n, t) {
    if (getResume(`test.${n}.${t}`)) return { text: "◷ In progress", tone: "warn" };
    const b = store.get(`best.${n}.${t}`, null);
    return b === null ? { text: "Not started", tone: "" } : b >= PASS
      ? { text: `✓ Passed · ${b}%`, tone: "good" } : { text: `Best ${b}%`, tone: "bad" };
  }
  function chapterStatus(n) {
    const taken = [1,2,3,4,5].map(t => store.get(`best.${n}.${t}`, null)).filter(v => v !== null);
    const active = unfinished().filter(([,r]) => r.ch === n).length;
    return { taken: taken.length, passed: taken.filter(v => v >= PASS).length, active,
      below: taken.some(v => v < PASS), due: srsDue(n).length };
  }
  function statusLine(n) {
    const x = chapterStatus(n);
    return `${x.passed} of 5 passed · ${x.active} in progress · ${x.due} cards due`;
  }
  function recommendations(n) {
    const result = [], scope = n ? chapters.filter(c => c.n === n) : chapters;
    const pending = unfinished().filter(([,r]) => !n || r.ch === n);
    if (pending.length) {
      const [k,r] = pending[0];
      result.push({href:resumeHref(k), text:`Resume ${r.title}: ${r.items.filter(x=>x.chosen!==null).length} of ${r.items.length} answered.`});
    }
    const due = srsDue(n).length, bank = bankActive(n).length;
    if (due >= 10) result.push({href:n ? `#/srs/${n}` : "#/srs", text:`Review ${due} due flashcards (about ${Math.ceil(due/4)} min).`});
    if (bank >= 5) result.push({href:n ? `#/bank/${n}` : "#/bank", text:`Clear missed questions: ${bank} waiting.`});
    const latest = latestByTest();
    const failed = Object.values(latest).filter(a => (!n || a.ch === n) && pctOf(a.right,a.total)<PASS)
      .sort((a,b)=>pctOf(a.right,a.total)-pctOf(b.right,b.total) || a.ch-b.ch || a.t-b.t)[0];
    if (failed) result.push({href:`#/ch/${failed.ch}/test/${failed.t}`,text:`Retake Ch ${failed.ch} · Test ${failed.t} (latest ${pctOf(failed.right,failed.total)}%).`});
    const untaken = scope.flatMap(c=>[1,2,3,4,5].map(t=>[c.n,t])).find(([ch,t])=>store.get(`best.${ch}.${t}`,null)===null && !getResume(`test.${ch}.${t}`));
    if (untaken) result.push({href:`#/ch/${untaken[0]}/test/${untaken[1]}`,text:`Start Ch ${untaken[0]} · Test ${untaken[1]}`});
    if (!untaken && scope.every(c=>chapterStatus(c.n).passed===5)) result.push({href:"#/exam",text:"Take a full mock exam."});
    return result.slice(0,3);
  }
  function nextAction(n, fresh = false) {
    const choices = recommendations(n), selected = choices[0];
    const match=selected?.href.match(/#\/ch\/(\d+)/), c=chap(n || Number(match?.[1]));
    const passed=c ? chapterStatus(c.n).passed : Object.values(bests()).filter(v=>v>=PASS).length;
    const total=c ? 5 : chapters.length*5, percent=pctOf(passed,total);
    return `<section class="card next-action" aria-label="Recommended study"><div class="next-action-content">
      <p class="eyebrow">${icon('target')} ${fresh ? "Welcome · start here" : "Continue studying"}</p>
      <h2>${fresh ? "Start with Chapter 1" : esc(selected?.text || "Keep studying")}</h2>
      ${fresh ? `<p class="muted">Take a practice test to find your gaps.<br>Missed questions build your personal drill bank.<br>Spaced repetition helps you remember the flashcards.</p>` : `<p class="muted">${c ? esc(chapterDetails[c.n]?.[1] || c.title) : "A little focused practice today builds lasting confidence."}</p>`}
      <div class="row">${selected ? `<a class="btn primary" data-recommendation="primary" href="${selected.href}">${fresh ? "Start Chapter 1 · Test 1" : "Continue Studying"} ${icon('arrow')}</a>` : ""}${c ? `<a class="btn view-chapter" href="#/ch/${c.n}">View Chapter</a>` : ""}</div>
      ${choices.length>1 ? `<div class="row secondary-actions">${choices.slice(1).map(x=>`<a href="${x.href}">${esc(x.text)}</a>`).join("")}</div>` : ""}
    </div><div class="continue-visual" aria-label="${passed} of ${total} ${c ? 'chapter' : 'practice'} tests passed"><div class="study-ring" style="--p:${percent}"><span><strong>${percent}%</strong><small>Tests passed</small></span></div><p>${passed} of ${total} passed${c ? `<br>Chapter ${c.n}` : ''}</p></div></section>`;
  }
  function studyView() {
    setCrumbs([{label:"Home",href:"#/"},{label:"Study"}]); document.title="Study";
    app.innerHTML=`<h1>Study</h1><p class="muted">Review what needs attention, or choose a flashcard deck.</p>
      <div class="tools"><a class="card tool" href="#/srs"><b>Spaced repetition</b><span>${srsDue().length} cards due</span></a>
      <a class="card tool" href="#/starred"><b>Starred cards</b><span>${plural(starredList().length, "card")} starred</span></a>
      <a class="card tool" href="#/bank"><b>Missed questions</b><span>${bankActive().length} to clear</span></a>
      <a class="card tool" href="#/read"><b>Listen and read</b><span>Narrated notes with word highlighting</span></a></div>
      <h2>Flashcards by chapter</h2><div class="grid">${chapters.map(c=>`<a class="card tool" href="#/ch/${c.n}/cards"><b>${c.n}. ${esc(c.title)}</b><span>${c.cards} cards · ${srsDue(c.n).length} due${starredList(c.n).length ? ` · ${starredList(c.n).length} starred` : ""}</span></a>`).join("")}</div>${offlineHTML()}`;
    wireOffline();
  }

  function wireChapterFilters() {
    app.querySelectorAll("[data-filter]").forEach(btn => btn.onclick = () => {
      app.querySelectorAll("[data-filter]").forEach(b=>b.setAttribute("aria-pressed",b===btn));
      let shown=0;
      app.querySelectorAll("[data-chapter]").forEach(el=>{
        const x=chapterStatus(+el.dataset.chapter), f=btn.dataset.filter;
        el.hidden=!(f==="All" || f==="In progress" && (x.active>0 || x.taken>0 && x.passed<5) || f==="Not started" && !x.taken && !x.active || f==="Below 80%" && x.below);
        if(!el.hidden) shown++;
      });
      document.getElementById("filter-empty").hidden=!!shown;
    });
  }
  function home() {
    setCrumbs([]); document.title = "CCNP Security SCOR Study";
    app.classList.add("dashboard-view");
    const fresh=!attempts().length && !Object.keys(bests()).length && !unfinished().length && !store.keys().some(k=>k==="srs" || k==="bank");
    app.innerHTML=dashboardHTML(()=>nextAction(undefined,fresh),chapterStatus,statusLine);
    wireChapterFilters();
  }
  function directoryView(practice) {
    const title=practice ? "Practice Tests" : "Chapters";
    setCrumbs([{label:"Dashboard",href:"#/"},{label:title}]);document.title=title;
    app.innerHTML=`<div class="page-heading"><p class="eyebrow">YOUR SCOR STUDY LIBRARY</p><h1>${title}</h1><p class="muted">${practice ? 'Five practice tests per chapter. Choose a chapter to test your knowledge.' : 'Explore every chapter, review the flashcards, and build your confidence.'}</p></div>${chapterGrid(chapterStatus,statusLine)}`;
    wireChapterFilters();
  }
  function settingsView() {
    setCrumbs([{label:"Dashboard",href:"#/"},{label:"Settings"}]);document.title="Settings";
    app.innerHTML=`<h1>Settings</h1><p class="muted">Manage your progress, backups, and offline study.</p>${syncHTML()}${backupHTML()}${offlineHTML()}`;
    wireSync();wireBackup();wireOffline();
  }

  async function chapterView(n) {
    const c = chap(n);
    if (!c) return home();
    setCrumbs([{ label: "Home", href: "#/" }, { label: `Chapter ${n}` }]);
    document.title = `Chapter ${n}: ${c.title}`;
    const data = await getTests(n);
    await loadCards(n);
    const deckCounts = DECKS.map(d => [d, flashcards[n].filter(x => x.deck === d).length]).filter(x => x[1]);
    const due = srsDue(n).length, bank = bankActive(n).length;
    app.innerHTML = `
      <h1>Chapter ${n}: ${esc(c.title)}</h1>
      <p class="muted">${statusLine(n)}</p>${nextAction(n)}
      <h2>Practice tests</h2>
      ${data ? `<div class="tests">
        ${data.tests.map((t, i) => {
          const k = fullAttempts(n, i + 1).length, last = store.get(`last.${n}.${i + 1}`, null), res = getResume(`test.${n}.${i + 1}`);
          return `<div class="card test-tile">
            <a class="tile-link" href="#/ch/${n}/test/${i + 1}"><strong>${esc(t.title || "Practice Test " + (i + 1))}</strong></a>
            <span class="muted small">${t.questions.length} questions${k ? ` · ${plural(k, "attempt")}` : ""}</span>
            <div class="row"><span class="badge ${statusForTest(n,i+1).tone}">${statusForTest(n,i+1).text}</span></div>
            ${last ? `<a class="small last-link" href="#/ch/${n}/test/${i + 1}/last">Last: ${last.pct}% · view results</a>` : ""}
          </div>`;
        }).join("")}
      </div>` : `<p class="muted">The practice tests for this chapter are not ready yet.</p>`}
      ${(await readerIndex()).some(x => x.n === n) ? `<h2>Listen and read</h2><div class="row"><a class="btn" href="#/ch/${n}/read">${icon("headphones")}Read along with the narration</a></div>` : ""}
      <h2>Flashcards</h2>
      <div class="row">
        <a class="btn primary" href="#/ch/${n}/cards">All ${c.cards} cards</a>
        ${deckCounts.map(([d, k]) => `<a class="btn" href="#/ch/${n}/cards/${encodeURIComponent(d)}">${esc(DECK_LABEL[d])} (${k})</a>`).join("")}
        <a class="btn" href="#/ch/${n}/cards/Starred">${icon("star")}Starred (${starredList(n).filter(([, f]) => flashcards[n].some(x => x.front === f)).length})</a>
      </div>
      <h2>Review</h2>
      <div class="row">
        <a class="btn" href="#/srs/${n}">Spaced repetition${due ? ` (${due} due)` : ""}</a>
        <a class="btn" href="#/bank/${n}">Missed questions${bank ? ` (${bank})` : ""}</a>
      </div>`;
  }

  // ---------- mock exam ----------
  async function examView() {
    setCrumbs([{ label: "Home", href: "#/" }, { label: "Mock exam" }]);
    document.title = "Mock exam";
    const saved = getResume("exam");
    if (saved) {
      if (await resumePrompt(saved, () => clearResume("exam"))) return startExam(await hydrate(saved.items), saved);
    }
    const lastExam = store.get("last.exam", null), past = examAttempts();
    app.innerHTML = `
      <div class="quiz">
        <h1>Mock exam</h1>
        <p class="muted">Questions allocated by domain using the SCOR study preset, on a clock (72 seconds a question, the pace of the real 350-701). Answers aren't shown until you finish, you can change answers and flag questions to come back to, and you can leave and resume.</p>
        <p class="small muted">${esc(blueprint.verification)}</p>
        <ul class="small">${blueprint.domains.map(d=>`<li>${esc(d.name)}: ${d.weight}%</li>`).join("")}</ul>
        <div class="chips" role="group" aria-label="Length">
          ${[[25, "Quick"], [50, "Half"], [100, "Full"]].map(([k, l], j) => `<button class="chip" type="button" data-len="${k}" aria-pressed="${j === 2}">${l}: ${k} questions, ${Math.round(k * EXAM_SECS_PER_Q / 60)} min</button>`).join("")}
        </div>
        <label class="check"><input type="checkbox" id="untimed"> No time limit</label>
        <div class="row" style="margin-top:14px"><button class="btn primary" type="button" id="go">Start the exam</button>
          ${lastExam ? `<a class="btn" href="#/exam/last">Last results (${lastExam.pct}%)</a>` : ""}</div>
        ${past.length ? `<h2>Past exams</h2>${attemptStrip(past)}` : ""}
      </div>`;
    let len = 100;
    app.querySelectorAll("[data-len]").forEach(b => b.onclick = () => {
      len = +b.dataset.len;
      app.querySelectorAll("[data-len]").forEach(x => x.setAttribute("aria-pressed", x === b));
    });
    document.getElementById("go").onclick = async () => {
      const untimed = document.getElementById("untimed").checked;
      const go = document.getElementById("go"); go.disabled=true; go.textContent="Preparing exam…";
      try {
      const all = await Promise.all(chapters.map(c => getTests(c.n)));
      const pools = Object.fromEntries(chapters.map((c,k)=>[c.n,(all[k]?.tests || []).flatMap((tt,ti)=>tt.questions.map((q,i)=>newItem(c.n,ti+1,i,q)))]));
      const items = selectExam(blueprint,pools,len,shuffle);
      startExam(items, { limit: untimed ? 0 : len * EXAM_SECS_PER_Q * 1000 });
      } catch(e) { go.disabled=false; go.textContent="Try starting again"; const msg=document.createElement("p"); msg.setAttribute("role","alert"); msg.textContent=e.message; go.after(msg); }
    };
  }
  function startExam(items, saved) {
    runQuiz({
      key: "exam", kind: "exam", items, multi: true, title: "Mock exam",
      pos: saved.pos || 0, elapsed: saved.elapsed || 0, limit: saved.limit || 0,
      onFinish: (its, ms) => {
        const r = { kind: "exam", ch: 0, t: 0, title: "Mock exam", items: its, ms, at: Date.now(), limit: saved.limit || 0 };
        recordResult(r);
        resultsView(r);
      }
    });
  }

  // ---------- missed-question bank ----------
  async function bankView(n) {
    setCrumbs(n ? [{ label: "Home", href: "#/" }, { label: `Chapter ${n}`, href: `#/ch/${n}` }, { label: "Missed questions" }] : [{ label: "Home", href: "#/" }, { label: "Missed questions" }]);
    document.title = "Missed questions";
    const saved = getResume("bank");
    if (saved) {
      if (await resumePrompt(saved, () => clearResume("bank"))) return drill(await hydrate(saved.items), saved);
    }
    const active = bankActive();
    const byCh = {};
    active.forEach(([k, v]) => { const ch = +k.split(".")[0]; (byCh[ch] = byCh[ch] || []).push([k, v]); });
    const total = (n ? byCh[n] || [] : active).length;
    app.innerHTML = `
      <div class="quiz">
        <h1>Missed questions</h1>
        <p class="muted">Every question you get wrong lands here. Answer it right ${BANK_CLEAR} times in a row to clear it; a miss starts the count over.</p>
        ${active.length ? `<div class="card table-wrap"><table class="recent">
          <thead><tr><th scope="col">Chapter</th><th scope="col">To clear</th><th scope="col">Halfway</th><th></th></tr></thead>
          <tbody>${Object.keys(byCh).sort((a, b) => a - b).map(ch => `<tr${+ch === n ? ` class="sel"` : ""}>
            <td><a href="#/ch/${ch}">${ch}. ${esc(chap(+ch).title)}</a></td><td>${byCh[ch].length}</td><td class="muted">${byCh[ch].filter(x => x[1].s > 0).length}</td>
            <td><a class="btn small-btn" href="#/bank/${ch}">Drill</a></td></tr>`).join("")}</tbody>
        </table></div>
        <div class="row" style="margin-top:14px">
          ${total ? `<button class="btn primary" type="button" id="go">Drill ${Math.min(total, 20)} ${n ? `from Chapter ${n}` : "questions"}</button>` : `<span class="muted">Nothing left to clear in Chapter ${n}.</span>`}
          ${n ? `<a class="btn" href="#/bank">All chapters (${active.length})</a>` : ""}
        </div>` : `<p>Your bank is empty. Take a practice test and any question you miss shows up here.</p>`}
      </div>`;
    const go = document.getElementById("go");
    if (go) go.onclick = async () => {
      const pick = shuffle(n ? byCh[n] : active).slice(0, 20);
      const items = (await Promise.all(pick.map(async ([k]) => {
        const [ch, t, i] = k.split(".").map(Number);
        const q = await question(ch, t, i);
        return q && newItem(ch, t, i, q);
      }))).filter(Boolean);
      drill(items, {});
    };
  }
  function drill(items, saved) {
    runQuiz({
      key: "bank", kind: "bank", items, multi: new Set(items.map(x => x.ch)).size > 1, title: "Missed questions drill",
      pos: saved.pos || 0, elapsed: saved.elapsed || 0,
      onFinish: (its, ms) => {
        const r = { kind: "bank", title: "Missed questions drill", items: its, ms, at: Date.now() };
        recordResult(r);
        resultsView(r);
      }
    });
  }

  function updateNav(parts) {
    const route=parts[0], exact=route==="ch" ? (parts[2]==="cards" ? "study" : parts[2]==="read" ? "read" : "practice") : ["srs","bank","review","starred"].includes(route) ? (route==="review" ? "study" : route) : ["study","exam","progress","search","chapters","practice","settings","read"].includes(route) ? route : "home";
    const mobile=["srs","bank","review","starred","study","read"].includes(exact) ? "study" : ["chapters","practice","settings"].includes(exact) ? (exact==="settings" ? "progress" : "home") : exact;
    document.body.dataset.page=exact;
    document.querySelectorAll("[data-nav]").forEach(a=>{
      if(a.dataset.nav===(a.closest(".mobile-nav") ? mobile : exact)) a.setAttribute("aria-current","page"); else a.removeAttribute("aria-current");
    });
  }

  // ---------- router ----------
  async function route() {
    leaveView();
    app.className="";
    const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
    try {
      if (parts[0] === "ch" && parts[1]) {
        const n = parseInt(parts[1], 10);
        if (parts[2] === "read") await readerView(n);
        else if (parts[2] === "cards") { await loadCards(n); cardsView(n, parts[3]); }
        else if (parts[2] === "test" && parts[3] && parts[4] === "last") await lastView(n, parseInt(parts[3], 10));
        else if (parts[2] === "test" && parts[3]) await testView(n, parseInt(parts[3], 10));
        else await chapterView(n);
      } else if (parts[0] === "review") { const r = store.get("review", null); if(r && r.cards) { await Promise.all([...new Set(r.cards.map(x=>x[0]))].map(loadCards)); cardsView(null,null,r); } else home(); }
      else if (parts[0] === "starred") {
        const cards = starredList();
        await Promise.all([...new Set(cards.map(x => x[0]))].map(loadCards));
        cardsView(null, null, { cards, title: "Starred cards", label: "The cards you starred, from every chapter. Unstar a card to take it out of this deck.", starred: true });
      }
      else if (parts[0] === "chapters" || parts[0] === "practice") directoryView(parts[0] === "practice");
      else if (parts[0] === "settings") settingsView();
      else if (parts[0] === "read") await readerListView();
      else if (parts[0] === "study") studyView();
      else if (parts[0] === "srs") { if(parts[1]) await loadCards(parseInt(parts[1],10)); else await loadAllCards(); srsView(parts[1] ? parseInt(parts[1], 10) : undefined); }
      else if (parts[0] === "bank") await bankView(parts[1] ? parseInt(parts[1], 10) : undefined);
      else if (parts[0] === "exam") parts[1] === "last" ? await lastView("exam") : await examView();
      else if (parts[0] === "search") await searchView(parts.slice(1).join("/"));
      else if (parts[0] === "progress") await dashboard();
      else home();
    } catch (e) {
      app.innerHTML = `<p>Something went wrong loading this page. <a href="#/">Go home</a></p>`;
      console.error(e);
    }
    updateNav(parts);
    if (!app.contains(document.activeElement) || document.activeElement === app) app.focus({ preventScroll: true });
    scrollTo(0, 0);
  }

  setNavigation({home, chapterView, route});

  Promise.all([getJSON("data/chapters.json"), getJSON("data/blueprint.json")])
    .then(([c, b]) => {
      setStudyData(c, b);
      registerOffline();
      addEventListener("hashchange", route);
      route();
      if (store.get("sync", null)) syncNow().catch(() => {});
    })
    .catch(() => { app.innerHTML = `<p>Couldn't load the study data. If you opened this file directly, serve the folder over HTTP or use the GitHub Pages link.</p>`; });
