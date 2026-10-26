import { chap, app, LETTERS, PASS, BANK_CLEAR, blueprint, flashcards, setCrumbs, onKey, onLeave, getTests, question, attempts, addAttempt, fullAttempts, examAttempts, getResume, clearResume, bankRecord, bankActive, studyCards, cardChips, meter, home, chapterView, setExamActive, route, store, syncSoon, esc, shuffle, plural, pctOf, level, secName, fmtDate, fmtDur, fmtClock, fmtAgo, srsMiss, domainFor } from "./runtime.js";


  // ---------- quiz engine ----------
  // An item is { ch, t, i, q, order, chosen, flag }. Tests and drills show feedback after each answer;
  // the mock exam doesn't, lets you change answers and flag questions, and runs on a clock.
  const packItems = items => items.map(({ ch, t, i, order, chosen, flag, domain }) => ({ ch, t, i, order, chosen, flag: !!flag, ...(domain ? {domain} : {}) }));
  async function hydrate(saved) {
    const out = [];
    for (const x of saved) { const q = await question(x.ch, x.t, x.i); if (q) out.push(Object.assign({}, x, { q })); }
    return out;
  }
  const newItem = (ch, t, i, q) => ({ ch, t, i, q, order: shuffle([0, 1, 2, 3]), chosen: null, flag: false });

  function runQuiz(cfg) {
    const { key, kind, items } = cfg;
    const exam = kind === "exam";
    let pos = cfg.pos || 0, base = cfg.elapsed || 0, seg = Date.now(), finished = false, tick = null;
    let showMap = false;
    const elapsed = () => base + (Date.now() - seg);
    function save() {
      if (finished || !items.some(x => x.chosen !== null || x.flag)) return;
      store.set("resume." + key, { kind, title: cfg.title, ch: cfg.ch, t: cfg.t, items: packItems(items), pos, elapsed: elapsed(), limit: cfg.limit || 0, at: Date.now() });
    }
    onLeave(() => { save(); clearInterval(tick); setExamActive(false); });
    const announced = new Set();
    const initialLeft = cfg.limit - elapsed();
    [10,5,1].filter(m => initialLeft < m*60000).forEach(m=>announced.add(m));
    if (cfg.limit) {
      tick = setInterval(() => {
        const left = cfg.limit - elapsed(), el = document.getElementById("clock");
        if (el) { el.textContent = fmtClock(left); el.classList.toggle("low", left < 5 * 60000); }
        for (const m of [10,5,1]) if (left <= m*60000 && !announced.has(m)) {
          announced.add(m); document.getElementById("timer-announcement").textContent = `${m} minute${m===1 ? "" : "s"} remaining`;
        }
        if (left <= 0) finish();
      }, 500);
    }

    function render() {
      const it = items[pos];
      const answered = it.chosen !== null;
      const locked = answered && !exam;
      const done = items.filter(x => x.chosen !== null).length;
      const score = items.filter(x => x.chosen !== null && x.chosen === x.q.answer).length;
      let fb = "";
      if (locked) {
        const right = it.chosen === it.q.answer;
        const ans = it.q.choices[it.q.answer];
        fb = right
          ? `<div class="feedback good" role="status"><h4>Correct</h4><p>${esc(ans.why)}</p></div>`
          : `<div class="feedback bad" role="status"><h4>Not quite</h4>
              <p><span class="label">Right answer (${LETTERS[it.order.indexOf(it.q.answer)]}):</span> ${esc(ans.text)}</p>
              <p><span class="label">Why it's right:</span> ${esc(ans.why)}</p>
              <p><span class="label">Why your answer was wrong:</span> ${esc(it.q.choices[it.chosen].why)}</p>
            </div>`;
      }
      const last = pos === items.length - 1;
      app.innerHTML = `
        <div class="quiz">
          <h1>${esc(cfg.title)}</h1>
          <div class="row small muted">
            <span>Question ${pos + 1} of ${items.length}${cfg.multi && !exam ? ` · Ch ${it.ch}` : ""}</span><span class="spacer"></span>
            ${cfg.limit ? `<span>Time left <b class="clock" id="clock">${fmtClock(cfg.limit - elapsed())}</b></span>` : exam ? "" : `<span>Score ${score} of ${done}</span>`}
            ${exam ? `<span>${done} answered</span>` : ""}
          </div>
          <div class="progress" role="progressbar" aria-label="Questions answered" aria-valuenow="${done}" aria-valuemin="0" aria-valuemax="${items.length}"><div style="width:${(done / items.length) * 100}%"></div></div>
          ${exam && showMap ? `<div class="qmap" aria-label="Jump to a question">${items.map((x, k) => `<button type="button" class="qcell${x.chosen !== null ? " answered" : ""}${x.flag ? " flagged" : ""}${k === pos ? " current" : ""}" data-go="${k}" aria-label="Question ${k + 1}${x.flag ? ", flagged" : ""}${x.chosen !== null ? ", answered" : ""}">${k + 1}</button>`).join("")}</div>` : ""}
          <p class="question" id="question" tabindex="-1">${esc(it.q.q)}</p>
          <div class="choices" role="radiogroup" aria-labelledby="question">
            ${it.order.map((ci, k) => {
              let cls = "";
              if (locked && ci === it.q.answer) cls = " correct";
              else if (locked && ci === it.chosen) cls = " wrong";
              else if (exam && ci === it.chosen) cls = " picked";
              return `<button class="choice${cls}" type="button" role="radio" aria-checked="${it.chosen===ci}" aria-disabled="${locked}" tabindex="${it.chosen===ci || it.chosen===null && k===0 ? 0 : -1}" data-ci="${ci}">
                <span class="letter">${LETTERS[k]}</span><span>${esc(it.q.choices[ci].text)}</span></button>`;
            }).join("")}
          </div>
          ${fb}
          <div class="quiz-nav">
            <button class="btn" type="button" id="prev" ${pos === 0 ? "disabled" : ""}>← Previous</button>
            ${exam ? `<button class="btn" type="button" id="flag" aria-pressed="${it.flag}">${it.flag ? "Flagged" : "Flag"}</button>
              <button class="btn" type="button" id="map" aria-pressed="${showMap}">All questions</button>` : ""}
            <span class="spacer"></span>
            ${exam ? `<button class="btn" type="button" id="end">Finish exam</button>` : ""}
            ${exam && last ? "" : `<button class="btn primary" type="button" id="next" ${answered || exam ? "" : "disabled"}>${last ? "See results" : "Next →"}</button>`}
          </div>
          <p class="hint">${exam ? "Answers aren't shown until you finish. " : ""}Leave any time; your place is saved.</p>
        </div>`;
      app.querySelectorAll(".choice").forEach(b => {
        b.onclick = () => choose(+b.dataset.ci);
        b.onkeydown = e => {
          const step = ["ArrowDown","ArrowRight"].includes(e.key) ? 1 : ["ArrowUp","ArrowLeft"].includes(e.key) ? -1 : 0;
          if (!step) {
            // The page-level handler ignores keys typed on buttons, so pass answer keys on here.
            if (/^[1-4a-d]$/i.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); quizKey(e); }
            return;
          }
          e.preventDefault(); e.stopPropagation();
          const ci = it.order[(it.order.indexOf(+b.dataset.ci)+step+4)%4];
          // Practice answers are graded the moment they're picked, so arrows only move focus there.
          if (exam && !locked) choose(ci);
          const target = app.querySelector(`[data-ci="${ci}"]`);
          app.querySelectorAll(".choice").forEach(c => c.tabIndex = c === target ? 0 : -1);
          target.focus();
        };
      });
      app.querySelectorAll("[data-go]").forEach(b => b.onclick = () => { pos = +b.dataset.go; render(); });
      document.getElementById("prev").onclick = () => { pos--; save(); render(); };
      const nextBtn = document.getElementById("next");
      if (nextBtn) nextBtn.onclick = next;
      if (exam) {
        document.getElementById("flag").onclick = () => { it.flag = !it.flag; save(); render(); };
        document.getElementById("map").onclick = () => { showMap = !showMap; render(); };
        document.getElementById("end").onclick = () => {
          reviewExam();
        };
      }
      onKey(quizKey);
      function quizKey(e) {
        const k = e.key.toUpperCase();
        const idx = "1234".indexOf(k) >= 0 ? "1234".indexOf(k) : LETTERS.indexOf(k);
        if (!locked && idx >= 0 && k.length === 1) choose(it.order[idx]);
        else if ((answered || exam) && (e.key === "Enter" || e.key === "ArrowRight") && !(exam && last)) next();
        else if (e.key === "ArrowLeft" && pos > 0) { pos--; render(); }
      }
      const fbEl = app.querySelector(".feedback");
      const target = fbEl || app.querySelector(".question");
      target.setAttribute("tabindex", "-1"); target.focus({preventScroll:true});
      if (fbEl && fbEl.getBoundingClientRect().bottom > innerHeight) fbEl.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
      setExamActive(exam);
    }

    function choose(ci) {
      const it = items[pos];
      if (!exam && it.chosen !== null) return;
      it.chosen = ci;
      if (!exam) {
        const right = ci === it.q.answer;
        bankRecord(it, right);
        if (!right) srsMiss(it.ch, it.q.cards || []);
      }
      save();
      render();
    }
    function next() { if (pos < items.length - 1) { pos++; save(); render(); scrollTo(0, 0); } else if(exam) reviewExam(); else finish(); }
    function reviewExam() {
      onKey(null); save();
      app.innerHTML = `<div class="quiz"><h1 tabindex="-1">Review your exam</h1>
        <p>${items.filter(x=>x.chosen===null).length} unanswered · ${items.filter(x=>x.flag).length} flagged</p>
        <p>Review any question before submitting. Answers remain hidden until you submit.</p>
        <div class="qmap">${items.map((x,k)=>`<button class="qcell${x.flag ? " flagged" : ""}" data-review="${k}" aria-label="Question ${k+1}: ${x.chosen===null ? "unanswered" : "answered"}${x.flag ? ", flagged" : ""}">${k+1}${x.flag ? " ⚑" : x.chosen===null ? " ?" : " ✓"}</button>`).join("")}</div>
        <div class="row"><button class="btn" id="back-exam">Back to question ${pos+1}</button><button class="btn primary" id="submit-exam">Submit exam</button></div></div>`;
      app.querySelectorAll("[data-review]").forEach(b=>b.onclick=()=>{pos=+b.dataset.review; render();});
      document.getElementById("back-exam").onclick=render;
      document.getElementById("submit-exam").onclick=finish;
      app.querySelector("h1").focus();
    }
    function finish() {
      if (finished) return;
      finished = true;
      setExamActive(false);
      clearInterval(tick);
      clearResume(key);
      if (exam) items.forEach(it => { const right = it.chosen === it.q.answer; bankRecord(it, right); if (!right) srsMiss(it.ch, it.q.cards || []); });
      cfg.onFinish(items, Math.min(elapsed(), cfg.limit || Infinity));
      syncSoon();
    }
    render();
  }

  function resumePrompt(r, startOver) {
    app.innerHTML = `
      <div class="quiz">
        <h1>${esc(r.title)}</h1>
        <div class="card resume-list">
          <p><b>You have this one in progress.</b> ${r.items.filter(x => x.chosen !== null).length} of ${r.items.length} answered, saved ${fmtAgo(r.at)}${r.limit ? `, ${fmtClock(r.limit - r.elapsed)} left on the clock` : ""}.</p>
          <div class="row">
            <button class="btn primary" type="button" id="resume">Resume</button>
            <button class="btn" type="button" id="over">Start over</button>
          </div>
        </div>
      </div>`;
    return new Promise(res => {
      document.getElementById("resume").onclick = () => res(true);
      document.getElementById("over").onclick = () => { if (startOver) startOver(); res(false); };
    });
  }

  async function testView(n, t, onlyIdx) {
    const c = chap(n);
    const data = await getTests(n);
    const test = data && data.tests[t - 1];
    if (!c || !test) return chapterView(n);
    const title = test.title || `Practice Test ${t}`;
    setCrumbs([{ label: "Home", href: "#/" }, { label: `Chapter ${n}`, href: `#/ch/${n}` }, { label: title }]);
    document.title = `${title}: Chapter ${n}`;
    const key = `test.${n}.${t}`;

    let saved = onlyIdx ? null : getResume(key);
    if (saved && !(await resumePrompt(saved, () => clearResume(key)))) saved = null;
    const retry = saved ? saved.kind === "retry" : !!onlyIdx;
    const items = saved ? await hydrate(saved.items)
      : shuffle(onlyIdx || test.questions.map((q, i) => i)).map(i => newItem(n, t, i, test.questions[i]));
    runQuiz({
      key, kind: retry ? "retry" : "test", ch: n, t, items, pos: saved ? saved.pos : 0, elapsed: saved ? saved.elapsed : 0,
      title: `${title}${retry ? " (missed questions)" : ""}`,
      onFinish: (its, ms) => {
        const at = Date.now();
        const r = { kind: retry ? "retry" : "test", ch: n, t, title, items: its, ms, at };
        recordResult(r);
        resultsView(r, { data });
      }
    });
  }

  // Save a finished test: history, best score, and (for a full test or exam) its answers for "view last results".
  function recordResult(r) {
    const right = r.items.filter(x => x.chosen === x.q.answer).length, pct = pctOf(right, r.items.length);
    const secs = {};
    r.items.forEach(x => {
      const s = (r.kind === "exam" ? `Ch ${x.ch}|` : "") + (x.q.section || "General");
      (secs[s] = secs[s] || [0, 0])[1]++;
      if (x.chosen === x.q.answer) secs[s][0]++;
    });
    r.prevLast = r.kind === "test" ? fullAttempts(r.ch, r.t).slice(-1)[0] : r.kind === "exam" ? examAttempts().slice(-1)[0] : null;
    r.prevBest = r.kind === "test" ? store.get(`best.${r.ch}.${r.t}`, null) : null;
    if (r.kind === "bank") return;
    addAttempt({ ch: r.ch || 0, t: r.t || 0, at: r.at, right, total: r.items.length, retry: r.kind === "retry", exam: r.kind === "exam",
      missed: r.kind === "exam" ? [] : r.items.filter(x => x.chosen !== x.q.answer).map(x => x.i), secs, ms: r.ms });
    if (r.kind === "test") {
      if (r.prevBest === null || pct > r.prevBest) store.set(`best.${r.ch}.${r.t}`, pct);
      store.set(`last.${r.ch}.${r.t}`, { at: r.at, ms: r.ms, pct, items: packItems(r.items) });
    }
    if (r.kind === "exam") store.set("last.exam", { at: r.at, ms: r.ms, pct, limit: r.limit, items: packItems(r.items) });
  }

  // ---------- results ----------
  // r = { kind: test|retry|exam|bank, ch, t, title, items, ms, at, prevLast, prevBest }; opts.readOnly for a saved past attempt.
  function resultsView(r, opts = {}) {
    const { items } = r;
    const right = items.filter(x => x.chosen === x.q.answer).length;
    const pct = pctOf(right, items.length);
    const missed = items.filter(x => x.chosen !== x.q.answer);
    const exam = r.kind === "exam", multi = exam || r.kind === "bank" && new Set(items.map(x => x.ch)).size > 1;

    // Score each chapter section the test touched.
    const groups = {};
    items.forEach(x => {
      const k = `${x.ch}|${x.q.section || "General"}`;
      const g = groups[k] = groups[k] || { ch: x.ch, s: x.q.section || "General", r: 0, tot: 0, cards: new Set() };
      g.tot++;
      if (x.chosen === x.q.answer) g.r++;
      else (x.q.cards || []).forEach(f => g.cards.add(f));
    });
    const rows = Object.values(groups).map(g => Object.assign(g, { p: pctOf(g.r, g.tot), cards: [...g.cards] })).sort((a, b) => a.p - b.p || b.tot - a.tot);
    const weak = rows.filter(x => x.r < x.tot && x.tot >= 2).slice(0, exam ? 10 : 99), strong = rows.filter(x => x.r === x.tot);
    const oneOff = rows.filter(x=>x.r<x.tot && x.tot<2);
    const allCards = rows.filter(x=>x.r<x.tot).flatMap(x => x.cards.map(f => [x.ch, f]));

    let compare = "";
    if (!opts.readOnly && r.prevLast) {
      const lp = pctOf(r.prevLast.right, r.prevLast.total), d = pct - lp;
      compare = d === 0 ? `Same as your last attempt (${lp}%).` : `${d > 0 ? "Up" : "Down"} ${Math.abs(d)} points from your last attempt (${lp}%).`;
    }
    const isBest = !opts.readOnly && r.kind === "test" && r.prevBest !== null && pct > r.prevBest;
    const bankLeft = r.kind === "bank" ? bankActive().length : 0;
    const cleared = r.kind === "bank" ? items.filter(x => { const b = store.get("bank", {})[`${x.ch}.${x.t}.${x.i}`]; return b && b.s >= BANK_CLEAR; }).length : 0;

    // Per-chapter breakdown for the mock exam.
    const byCh = {};
    if (exam) items.forEach(x => { const c = byCh[x.ch] = byCh[x.ch] || [0, 0]; c[1]++; if (x.chosen === x.q.answer) c[0]++; });

    const byDomain = {};
    if (exam) items.forEach(x=>{ const id=x.domain || domainFor(blueprint,x.ch,x.q), d=byDomain[id]=byDomain[id] || [0,0]; d[1]++; if(x.chosen===x.q.answer)d[0]++; });
    const own = r.kind === "test" ? fullAttempts(r.ch, r.t) : exam ? examAttempts() : [];
    const heading = opts.readOnly ? `${esc(r.title)}: your last results` : `${esc(r.title)} results${r.kind === "retry" ? " (missed questions)" : ""}`;
    const again = r.kind === "test" || r.kind === "retry" ? `#/ch/${r.ch}/test/${r.t}` : exam ? "#/exam" : "#/bank";

    app.innerHTML = `
      <div class="quiz">
        <h1>${heading}</h1>
        ${opts.readOnly ? `<p class="muted small">Taken ${new Date(r.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}. This page is replaced each time you finish the ${exam ? "exam" : "full test"}.</p>` : ""}
        <div class="score-head card">
          <div class="score-ring ${level(pct)}" style="--p:${pct}"><span>${pct}%</span></div>
          <div>
            <p class="score-line"><b>${right} of ${items.length} correct</b> ${r.kind === "bank" ? "" : `<span class="badge ${pct >= PASS ? "good" : "bad"}">${pct >= PASS ? "Passed" : `Below ${PASS}%`}</span>`}${isBest ? ` <span class="badge good">New best</span>` : ""}</p>
            <p class="muted small">${r.kind === "bank" ? `${plural(cleared, "question")} cleared from your missed-question bank. ${bankLeft} left.`
              : pct >= PASS ? "Nice work, that's a passing score." : `Aim for ${PASS}% or better before you move on.`} ${compare}</p>
            <p class="muted small">Time: ${fmtDur(r.ms)}${r.kind === "retry" ? " · Retry rounds don't change your best score." : ""}${r.kind === "test" && !opts.readOnly && r.prevBest !== null && !isBest ? ` · Best: ${Math.max(r.prevBest, pct)}%` : ""}</p>
          </div>
        </div>
        <div class="row">
          ${missed.length && !exam && r.kind !== "bank" ? `<button class="btn${pct<PASS ? " primary" : ""}" type="button" id="retry">Retry the ${missed.length} missed</button>` : ""}
          ${allCards.length ? `<button class="btn" type="button" id="study-all">Study ${plural(allCards.length, "flashcard")} from your misses</button>` : ""}
          <a class="quiet-action${exam || r.kind === "bank" || pct>=PASS && r.t>=5 ? " btn primary" : ""}" href="${again}" id="again">${r.kind === "bank" ? (bankLeft ? "Keep drilling" : "Back to the bank") : exam ? "New exam" : "Retake the full test"}</a>
          ${(r.kind === "test" || r.kind === "retry") && r.t < 5 ? `<a class="btn${pct>=PASS ? " primary" : ""}" href="#/ch/${r.ch}/test/${r.t + 1}">Next test</a>` : ""}
          <a class="quiet-action" href="#/progress">Dashboard</a>
        </div>
        ${exam ? `<h2>By exam domain</h2><p class="small muted">${esc(blueprint.verification)}</p><div class="card table-wrap"><table><thead><tr><th scope="col">Study domain</th><th scope="col">Right</th><th scope="col">Score</th></tr></thead><tbody>${blueprint.domains.filter(d=>byDomain[d.id]).map(d=>{const [rr,tt]=byDomain[d.id]; return `<tr><th scope="row">${esc(d.name)}</th><td>${rr}/${tt}</td><td>${pctOf(rr,tt)}%</td></tr>`;}).join("")}</tbody></table></div>` : ""}
        ${exam ? `<h2>By chapter</h2><div class="card table-wrap"><table class="recent">
          <thead><tr><th scope="col">Chapter</th><th scope="col">Right</th><th scope="col">Score</th></tr></thead>
          <tbody>${Object.entries(byCh).sort((a, b) => a[0] - b[0]).map(([ch, [rr, tt]]) => `<tr><td><a href="#/ch/${ch}">${ch}. ${esc(chap(+ch).title)}</a></td><td>${rr}/${tt}</td><td><span class="badge ${pctOf(rr, tt) >= PASS ? "good" : "bad"}">${pctOf(rr, tt)}%</span></td></tr>`).join("")}</tbody>
        </table></div>` : ""}
        ${weak.length ? `<h2>Areas to study</h2>
        <p class="muted small">Chapter sections where you missed questions, weakest first. Reread that section of the notes, then study the flashcards.</p>
        <div class="areas">
          ${weak.map((x, k) => `<div class="card area">
            <div class="row">${multi ? `<span class="badge">Ch ${x.ch}</span>` : ""}<b>${esc(secName(x.s))}</b><span class="spacer"></span><span class="small muted">${x.r} of ${x.tot} right</span></div>
            ${meter(x.p)}
            ${x.cards.length ? `${cardChips(x.cards)}<button class="btn small-btn" type="button" data-area="${k}">${x.cards.length > 1 ? `Study these ${x.cards.length} cards` : "Study this card"}</button>` : ""}
          </div>`).join("")}
        </div>` : `<h2>Areas to study</h2><p>${missed.length ? "No repeated misses in a section on this attempt." : "Nothing missed. Every section was 100%."}</p>`}
        ${oneOff.length ? `<p class="small muted"><b>One-off misses:</b> ${oneOff.map(x=>esc((multi ? `Ch ${x.ch} · ` : "")+secName(x.s))).join(" · ")}. One question is too little evidence to rank an area.</p>` : ""}
        ${strong.length && weak.length ? `<p class="small muted"><b>Solid:</b> ${strong.map(x => esc((multi ? `Ch ${x.ch} ` : "") + secName(x.s))).join(" · ")}</p>` : ""}
        ${own.length > 1 || (opts.readOnly && own.length) ? `<h2>Every attempt</h2>${attemptStrip(own)}` : ""}
        ${missed.length ? `<h2>Questions you missed</h2><div class="review">
          ${missed.map(x => {
            const a = x.q.choices[x.q.answer];
            return `<div class="card">
              <div class="tag">${multi ? `Ch ${x.ch} · ` : ""}${esc(secName(x.q.section || ""))}</div>
              <p><b>${esc(x.q.q)}</b></p>
              ${x.chosen === null ? `<p><span class="muted">Your answer:</span> none</p>` : `<p><span class="muted">Your answer:</span> ${esc(x.q.choices[x.chosen].text)}</p>
              <p class="small muted">${esc(x.q.choices[x.chosen].why)}</p>`}
              <p><span class="muted">Right answer:</span> ${esc(a.text)}</p>
              <p class="small muted">${esc(a.why)}</p>
            </div>`;
          }).join("")}
        </div>` : ""}
        ${r.ch ? `<div class="row" style="margin-top:18px"><a class="btn" href="#/ch/${r.ch}">Back to Chapter ${r.ch}</a></div>` : ""}
      </div>`;
    const retryBtn = document.getElementById("retry");
    if (retryBtn) retryBtn.onclick = () => testView(r.ch, r.t, missed.map(x => x.i));
    const sa = document.getElementById("study-all");
    if (sa) sa.onclick = () => studyCards(allCards, `Cards from the questions you missed on ${r.title}.`);
    app.querySelectorAll("[data-area]").forEach(b => b.onclick = () => {
      const x = weak[+b.dataset.area];
      studyCards(x.cards.map(f => [x.ch, f]), `Cards for ${secName(x.s)}, from ${r.title}.`);
    });
    const againBtn = document.getElementById("again");
    if (againBtn.getAttribute("href") === location.hash) againBtn.onclick = e => { e.preventDefault(); route(); };
    onKey(null);
    scrollTo(0, 0);
  }

  // Small bar chart of every score on one test, oldest first.
  function attemptStrip(list) {
    const shown = list.slice(-20);
    return `<div class="card attempts">${shown.map((a, k) => {
      const p = pctOf(a.right, a.total);
      return `<div class="att" title="${fmtDate(a.at)}: ${p}%"><div class="att-bar ${level(p)}" style="height:${Math.max(p, 3) * 0.8}px"></div><span class="att-p">${p}</span><span class="att-d">${k === shown.length - 1 ? "Latest" : fmtDate(a.at)}</span></div>`;
    }).join("")}</div>`;
  }

  async function lastView(n, t) {
    const exam = n === "exam";
    const last = store.get(exam ? "last.exam" : `last.${n}.${t}`, null);
    if (!exam && !chap(n)) return home();
    setCrumbs(exam ? [{ label: "Home", href: "#/" }, { label: "Mock exam", href: "#/exam" }, { label: "Last results" }]
      : [{ label: "Home", href: "#/" }, { label: `Chapter ${n}`, href: `#/ch/${n}` }, { label: `Practice Test ${t}`, href: `#/ch/${n}/test/${t}` }, { label: "Last results" }]);
    if (!last) { app.innerHTML = `<div class="quiz"><h1>No saved results yet</h1><p class="muted">Finish the ${exam ? "exam" : "test"} once and its results are kept here until your next attempt.</p></div>`; return; }
    const items = await hydrate(last.items);
    const data = exam ? null : await getTests(n);
    const title = exam ? "Mock exam" : (data && data.tests[t - 1].title) || `Practice Test ${t}`;
    document.title = `${title}: last results`;
    resultsView({ kind: exam ? "exam" : "test", ch: exam ? 0 : n, t: exam ? 0 : t, title, items, ms: last.ms, at: last.at }, { readOnly: true });
  }


export { packItems, hydrate, newItem, runQuiz, resumePrompt, testView, recordResult, resultsView, attemptStrip, lastView };
