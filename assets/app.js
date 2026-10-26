(() => {
  "use strict";

  const app = document.getElementById("app");
  const crumbs = document.getElementById("crumbs");
  const DECKS = ["Vocabulary", "Ports and Protocols", "Commands and Tools", "Numbers and Documents to Know"];
  const DECK_LABEL = { "Vocabulary": "Vocabulary", "Ports and Protocols": "Ports", "Commands and Tools": "Commands", "Numbers and Documents to Know": "Numbers and RFCs" };
  const LETTERS = "ABCD";
  const PASS = 80;

  let chapters = [];
  let flashcards = {};
  const testCache = {};
  let keyHandler = null;

  // ---------- storage (per-browser conveniences only) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem("scor." + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("scor." + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  };

  // ---------- helpers ----------
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const rich = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const chap = n => chapters.find(c => c.n === n);

  function setCrumbs(parts) {
    crumbs.innerHTML = parts.map(p => p.href ? `<a href="${p.href}">${esc(p.label)}</a>` : esc(p.label)).join(" › ");
  }
  function onKey(fn) { keyHandler = fn; }
  document.addEventListener("keydown", e => {
    if (!keyHandler || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest("input, textarea, select")) return;
    keyHandler(e);
  });

  async function getJSON(path) {
    const r = await fetch(path, { cache: "no-cache" });
    if (!r.ok) throw new Error(path + " " + r.status);
    return r.json();
  }
  async function getTests(n) {
    if (!testCache[n]) testCache[n] = getJSON(`data/tests/ch${String(n).padStart(2, "0")}.json`).catch(() => null);
    return testCache[n];
  }

  function bestBadge(n, t) {
    const b = store.get(`best.${n}.${t}`, null);
    if (b === null) return `<span class="badge">Not taken</span>`;
    return `<span class="badge ${b >= PASS ? "good" : "bad"}">Best ${b}%</span>`;
  }

  // ---------- progress history ----------
  // Every finished test is saved as { ch, t, at, right, total, retry, missed: [question index], secs: { section: [right, total] }, ms }.
  const history = () => store.get("history", []);
  function addAttempt(a) { store.set("history", history().concat(a).slice(-1000)); }
  const fullAttempts = (n, t) => history().filter(a => !a.retry && (n === undefined || (a.ch === n && a.t === t)));
  const pctOf = (r, tot) => tot ? Math.round((r / tot) * 100) : 0;
  const level = p => p >= PASS ? "good" : p >= 60 ? "warn" : "bad";
  const secName = s => String(s).replace(/^\d+\.\s*/, "");
  const fmtDate = ts => new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const fmtDur = ms => { if (ms < 60000) return `${Math.max(1, Math.round(ms / 1000))} sec`; const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
  const dayKey = ts => { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

  function bests() {
    const out = {};
    chapters.forEach(c => [1, 2, 3, 4, 5].forEach(t => { const b = store.get(`best.${c.n}.${t}`, null); if (b !== null) out[`${c.n}.${t}`] = b; }));
    return out;
  }
  function latestByTest() {
    const out = {};
    fullAttempts().forEach(a => { out[`${a.ch}.${a.t}`] = a; });
    return out;
  }
  function streak() {
    const days = new Set(history().map(a => dayKey(a.at)));
    let d = new Date(), count = 0;
    if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
    while (days.has(dayKey(d))) { count++; d.setDate(d.getDate() - 1); }
    return count;
  }
  // Open a flashcard deck made of specific cards (from missed questions).
  function studyCards(n, fronts, label) {
    store.set("review", { n, fronts, label });
    location.hash = `#/ch/${n}/review`;
  }
  function cardChips(fronts) {
    return `<div class="term-chips">${fronts.map(f => `<span class="term-chip">${esc(f)}</span>`).join("")}</div>`;
  }
  function meter(p) {
    return `<div class="meter ${level(p)}" role="img" aria-label="${p}% correct"><div style="width:${Math.max(p, 2)}%"></div></div>`;
  }

  // ---------- theme ----------
  const themeBtn = document.getElementById("theme");
  const savedTheme = store.get("theme", null);
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  themeBtn.addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    store.set("theme", next);
  });

  // ---------- views ----------
  function home() {
    setCrumbs([]);
    document.title = "CCNP Security SCOR Study";
    app.innerHTML = `
      <h1>CCNP Security SCOR 350-701</h1>
      <p class="muted">Flashcards and practice tests for every chapter, built from the study notes. Your scores are saved in this browser.</p>
      ${homeSummary()}
      <div class="grid">
        ${chapters.map(c => {
          const taken = [1, 2, 3, 4, 5].map(t => store.get(`best.${c.n}.${t}`, null)).filter(v => v !== null);
          const passed = taken.filter(v => v >= PASS).length;
          const done = taken.length ? ` · ${taken.length} of 5 taken, ${passed} passed` : "";
          return `<div class="card chapter">
            <div class="num">Chapter ${c.n}</div>
            <h3>${esc(c.title)}</h3>
            <div class="stats">${c.cards} flashcards · 5 practice tests${done}</div>
            <div class="row">
              <a class="btn" href="#/ch/${c.n}/cards">Flashcards</a>
              <a class="btn primary" href="#/ch/${c.n}">Practice tests</a>
            </div>
          </div>`;
        }).join("")}
      </div>`;
  }

  function homeSummary() {
    const b = Object.values(bests());
    if (!b.length) return "";
    const total = chapters.length * 5, passed = b.filter(v => v >= PASS).length;
    return `<a class="card summary" href="#/progress">
      <div><div class="kpi-num">${passed}<span class="muted"> / ${total}</span></div><div class="muted small">tests passed</div></div>
      <div><div class="kpi-num">${b.length}</div><div class="muted small">tests taken</div></div>
      <div><div class="kpi-num">${streak()}</div><div class="muted small">day streak</div></div>
      <span class="spacer"></span><span class="btn primary">Open dashboard</span>
    </a>`;
  }

  async function chapterView(n) {
    const c = chap(n);
    if (!c) return home();
    setCrumbs([{ label: "Home", href: "#/" }, { label: `Chapter ${n}` }]);
    document.title = `Chapter ${n}: ${c.title}`;
    const data = await getTests(n);
    const deckCounts = DECKS.map(d => [d, flashcards[n].filter(x => x.deck === d).length]).filter(x => x[1]);
    app.innerHTML = `
      <h1>Chapter ${n}: ${esc(c.title)}</h1>
      <h2>Practice tests</h2>
      ${data ? `<div class="tests">
        ${data.tests.map((t, i) => `<a class="card test-tile" href="#/ch/${n}/test/${i + 1}">
          <strong>${esc(t.title || "Practice Test " + (i + 1))}</strong>
          <span class="muted small">${t.questions.length} questions${(k => k ? ` · ${k} attempt${k > 1 ? "s" : ""}` : "")(fullAttempts(n, i + 1).length)}</span>
          ${bestBadge(n, i + 1)}
        </a>`).join("")}
      </div>` : `<p class="muted">The practice tests for this chapter are not ready yet.</p>`}
      <h2>Flashcards</h2>
      <div class="row">
        <a class="btn primary" href="#/ch/${n}/cards">All ${c.cards} cards</a>
        ${deckCounts.map(([d, k]) => `<a class="btn" href="#/ch/${n}/cards/${encodeURIComponent(d)}">${esc(DECK_LABEL[d])} (${k})</a>`).join("")}
      </div>`;
  }

  function cardsView(n, deck, review) {
    const c = chap(n);
    if (!c) return home();
    setCrumbs([{ label: "Home", href: "#/" }, { label: `Chapter ${n}`, href: `#/ch/${n}` }, { label: review ? "Review deck" : "Flashcards" }]);
    document.title = `Flashcards: Chapter ${n}`;
    const all = review ? (flashcards[n] || []).filter(x => review.fronts.includes(x.front)) : (flashcards[n] || []);
    let filter = DECKS.includes(deck) ? deck : "All";
    let reverse = store.get("cards.reverse", false);
    let order = [], pos = 0, flipped = false, learning = new Set();

    function build(keepShuffled) {
      const pool = all.map((card, i) => i).filter(i => filter === "All" || all[i].deck === filter);
      order = keepShuffled ? shuffle(pool) : pool;
      pos = 0; flipped = false; learning = new Set();
    }
    build(false);

    function render() {
      const total = order.length;
      const card = total ? all[order[pos]] : null;
      const front = card ? (reverse ? defHTML(card) : `<div class="term">${rich(card.front)}</div>`) : "";
      const back = card ? (reverse ? `<div class="term">${rich(card.front)}</div>` : defHTML(card)) : "";
      app.innerHTML = `
        <div class="flash-wrap">
          <h1>Chapter ${n} ${review ? "review deck" : "flashcards"}</h1>
          ${review ? `<p class="muted small">${esc(review.label)}</p>` : ""}
          <div class="chips" role="group" aria-label="Deck">
            ${["All", ...DECKS].filter(d => d === "All" || all.some(x => x.deck === d)).map(d =>
              `<button class="chip" type="button" data-deck="${esc(d)}" aria-pressed="${d === filter}">${esc(d === "All" ? "All" : DECK_LABEL[d])}</button>`).join("")}
          </div>
          ${total ? `
          <div class="row small muted"><span>Card ${pos + 1} of ${total}</span><span class="spacer"></span><span>${learning.size} marked still learning</span></div>
          <div class="progress"><div style="width:${((pos + 1) / total) * 100}%"></div></div>
          <div class="flash${flipped ? " flipped" : ""}" id="flash" role="button" tabindex="0" aria-label="Flip card">
            <div class="flash-inner">
              <div class="card face front"><div class="tag">${esc(card.topic)}</div>${front}</div>
              <div class="card face back"><div class="tag">${esc(card.topic)}</div>${back}</div>
            </div>
          </div>
          <p class="hint">Tap the card or press Space to flip. Use the arrow keys to move.</p>
          <div class="row">
            <button class="btn" type="button" id="prev" ${pos === 0 ? "disabled" : ""}>← Back</button>
            <button class="btn" type="button" id="learn">${learning.has(order[pos]) ? "Unmark" : "Still learning"}</button>
            <button class="btn primary" type="button" id="next">${pos === total - 1 ? "Finish" : "Next →"}</button>
            <span class="spacer"></span>
            <button class="btn" type="button" id="shuffle">Shuffle</button>
            <button class="btn" type="button" id="reverse" aria-pressed="${reverse}">${reverse ? "Show term first" : "Show definition first"}</button>
          </div>` : `<p class="muted">No cards in this deck.</p>`}
        </div>`;
      app.querySelectorAll(".chip").forEach(b => b.onclick = () => { filter = b.dataset.deck; build(false); render(); });
      if (!total) return;
      const flash = document.getElementById("flash");
      const flip = () => { flipped = !flipped; flash.classList.toggle("flipped", flipped); };
      flash.onclick = flip;
      document.getElementById("prev").onclick = () => go(-1);
      document.getElementById("next").onclick = () => go(1);
      document.getElementById("learn").onclick = () => { const k = order[pos]; learning.has(k) ? learning.delete(k) : learning.add(k); render(); };
      document.getElementById("shuffle").onclick = () => { build(true); render(); };
      document.getElementById("reverse").onclick = () => { reverse = !reverse; store.set("cards.reverse", reverse); flipped = false; render(); };
      onKey(e => {
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); }
        else if (e.key === "ArrowRight") go(1);
        else if (e.key === "ArrowLeft") go(-1);
      });
    }

    function go(d) {
      if (d > 0 && pos === order.length - 1) return finish();
      pos = Math.max(0, Math.min(order.length - 1, pos + d));
      flipped = false; render();
    }

    function finish() {
      const missed = [...learning];
      app.innerHTML = `
        <div class="flash-wrap">
          <h1>Deck finished</h1>
          <p>You went through ${order.length} cards and marked ${missed.length} as still learning.</p>
          <div class="row">
            ${missed.length ? `<button class="btn primary" type="button" id="again">Study the ${missed.length} marked cards</button>` : ""}
            <button class="btn" type="button" id="restart">Start the deck over</button>
            <a class="btn" href="#/ch/${n}">Back to Chapter ${n}</a>
          </div>
        </div>`;
      const again = document.getElementById("again");
      if (again) again.onclick = () => { order = shuffle(missed); pos = 0; flipped = false; learning = new Set(); render(); };
      document.getElementById("restart").onclick = () => { build(false); render(); };
      onKey(null);
    }

    function defHTML(card) {
      return `${reverse ? "" : `<div class="term-small">${rich(card.front)}</div>`}<div class="def">${rich(cap(card.back))}</div>${card.more && card.more.length ? `<ul>${card.more.map(m => `<li>${rich(m.trim())}</li>`).join("")}</ul>` : ""}`;
    }

    render();
  }

  async function testView(n, t, onlyIdx) {
    const c = chap(n);
    const data = await getTests(n);
    const test = data && data.tests[t - 1];
    if (!c || !test) return chapterView(n);
    const title = test.title || `Practice Test ${t}`;
    setCrumbs([{ label: "Home", href: "#/" }, { label: `Chapter ${n}`, href: `#/ch/${n}` }, { label: title }]);
    document.title = `${title}: Chapter ${n}`;

    const picks = (onlyIdx || test.questions.map((q, i) => i));
    const items = shuffle(picks).map(i => ({ i, q: test.questions[i], order: shuffle([0, 1, 2, 3]), chosen: null }));
    let pos = 0;
    const retryMode = !!onlyIdx;
    const started = Date.now();

    function render() {
      const it = items[pos];
      const answered = it.chosen !== null;
      const correctShown = it.order.indexOf(it.q.answer);
      const score = items.filter(x => x.chosen !== null && x.chosen === x.q.answer).length;
      const done = items.filter(x => x.chosen !== null).length;
      let fb = "";
      if (answered) {
        const right = it.chosen === it.q.answer;
        const ans = it.q.choices[it.q.answer];
        fb = right
          ? `<div class="feedback good" role="status"><h4>Correct</h4><p>${esc(ans.why)}</p></div>`
          : `<div class="feedback bad" role="status"><h4>Not quite</h4>
              <p><span class="label">Right answer (${LETTERS[correctShown]}):</span> ${esc(ans.text)}</p>
              <p><span class="label">Why it's right:</span> ${esc(ans.why)}</p>
              <p><span class="label">Why your answer was wrong:</span> ${esc(it.q.choices[it.chosen].why)}</p>
            </div>`;
      }
      app.innerHTML = `
        <div class="quiz">
          <h1>${esc(title)}${retryMode ? " (missed questions)" : ""}</h1>
          <div class="row small muted"><span>Question ${pos + 1} of ${items.length}</span><span class="spacer"></span><span>Score ${score} of ${done}</span></div>
          <div class="progress"><div style="width:${(done / items.length) * 100}%"></div></div>
          <p class="question">${esc(it.q.q)}</p>
          <div class="choices">
            ${it.order.map((ci, k) => {
              let cls = "";
              if (answered && ci === it.q.answer) cls = " correct";
              else if (answered && ci === it.chosen) cls = " wrong";
              return `<button class="choice${cls}" type="button" data-ci="${ci}" ${answered ? "disabled" : ""}>
                <span class="letter">${LETTERS[k]}</span><span>${esc(it.q.choices[ci].text)}</span></button>`;
            }).join("")}
          </div>
          ${fb}
          <div class="quiz-nav">
            <button class="btn" type="button" id="prev" ${pos === 0 ? "disabled" : ""}>← Previous</button>
            <span class="spacer"></span>
            <button class="btn primary" type="button" id="next" ${answered ? "" : "disabled"}>${pos === items.length - 1 ? "See results" : "Next →"}</button>
          </div>
        </div>`;
      app.querySelectorAll(".choice").forEach(b => b.onclick = () => choose(+b.dataset.ci));
      document.getElementById("prev").onclick = () => { pos--; render(); };
      document.getElementById("next").onclick = next;
      onKey(e => {
        const k = e.key.toUpperCase();
        const idx = "1234".indexOf(k) >= 0 ? "1234".indexOf(k) : LETTERS.indexOf(k);
        if (!answered && idx >= 0 && k.length === 1) choose(it.order[idx]);
        else if (answered && (e.key === "Enter" || e.key === "ArrowRight")) next();
        else if (e.key === "ArrowLeft" && pos > 0) { pos--; render(); }
      });
      const fbEl = app.querySelector(".feedback");
      if (fbEl && fbEl.getBoundingClientRect().bottom > innerHeight) fbEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function choose(ci) { if (items[pos].chosen === null) { items[pos].chosen = ci; render(); } }
    function next() { if (pos < items.length - 1) { pos++; render(); scrollTo(0, 0); } else results(); }

    function results() {
      const right = items.filter(x => x.chosen === x.q.answer).length;
      const pct = Math.round((right / items.length) * 100);
      const missed = items.filter(x => x.chosen !== x.q.answer);
      const key = `best.${n}.${t}`;
      const prevBest = store.get(key, null);
      const prevAll = fullAttempts(n, t);
      const last = prevAll[prevAll.length - 1];
      if (!retryMode && (prevBest === null || pct > prevBest)) store.set(key, pct);

      // Score each chapter section this test touched.
      const secs = {};
      items.forEach(x => {
        const s = x.q.section || "General";
        (secs[s] = secs[s] || [0, 0])[1]++;
        if (x.chosen === x.q.answer) secs[s][0]++;
      });
      const ms = Date.now() - started;
      addAttempt({ ch: n, t, at: Date.now(), right, total: items.length, retry: retryMode, missed: missed.map(x => x.i), secs, ms });

      const rows = Object.entries(secs).map(([s, [r, tot]]) => {
        const cards = [...new Set(missed.filter(x => (x.q.section || "General") === s).flatMap(x => x.q.cards || []))];
        return { s, r, tot, p: pctOf(r, tot), cards };
      }).sort((a, b) => a.p - b.p || b.tot - a.tot);
      const weak = rows.filter(x => x.r < x.tot), strong = rows.filter(x => x.r === x.tot);
      const allCards = [...new Set(weak.flatMap(x => x.cards))];

      let compare = "";
      if (!retryMode && last) {
        const lp = pctOf(last.right, last.total), d = pct - lp;
        compare = d === 0 ? `Same as your last attempt (${lp}%).` : `${d > 0 ? "Up" : "Down"} ${Math.abs(d)} points from your last attempt (${lp}%).`;
      }
      const isBest = !retryMode && prevBest !== null && pct > prevBest;

      app.innerHTML = `
        <div class="quiz">
          <h1>${esc(title)} results${retryMode ? " (missed questions)" : ""}</h1>
          <div class="score-head card">
            <div class="score-ring ${level(pct)}" style="--p:${pct}"><span>${pct}%</span></div>
            <div>
              <p class="score-line"><b>${right} of ${items.length} correct</b> <span class="badge ${pct >= PASS ? "good" : "bad"}">${pct >= PASS ? "Passed" : `Below ${PASS}%`}</span>${isBest ? ` <span class="badge good">New best</span>` : ""}</p>
              <p class="muted small">${pct >= PASS ? "Nice work, that's a passing score." : `Aim for ${PASS}% or better before you move on.`} ${compare}</p>
              <p class="muted small">Time: ${fmtDur(ms)}${retryMode ? " · Retry rounds don't change your best score." : prevBest !== null && !isBest ? ` · Best: ${Math.max(prevBest, pct)}%` : ""}</p>
            </div>
          </div>
          <div class="row">
            ${missed.length ? `<button class="btn primary" type="button" id="retry">Retry the ${missed.length} missed</button>` : ""}
            ${allCards.length ? `<button class="btn" type="button" id="study-all">Study ${allCards.length} flashcard${allCards.length > 1 ? "s" : ""} from your misses</button>` : ""}
            <button class="btn" type="button" id="again">Retake the full test</button>
            ${t < data.tests.length ? `<a class="btn" href="#/ch/${n}/test/${t + 1}">Next test</a>` : ""}
            <a class="btn" href="#/progress">Dashboard</a>
          </div>
          ${weak.length ? `<h2>Areas to study</h2>
          <p class="muted small">Chapter sections where you missed questions, weakest first. Reread that section of the notes, then study the flashcards.</p>
          <div class="areas">
            ${weak.map((x, k) => `<div class="card area">
              <div class="row"><b>${esc(secName(x.s))}</b><span class="spacer"></span><span class="small muted">${x.r} of ${x.tot} right</span></div>
              ${meter(x.p)}
              ${x.cards.length ? `${cardChips(x.cards)}<button class="btn small-btn" type="button" data-area="${k}">${x.cards.length > 1 ? `Study these ${x.cards.length} cards` : "Study this card"}</button>` : ""}
            </div>`).join("")}
          </div>` : `<h2>Areas to study</h2><p>Nothing missed. Every section in this test was 100%.</p>`}
          ${strong.length && weak.length ? `<p class="small muted"><b>Solid:</b> ${strong.map(x => esc(secName(x.s))).join(" · ")}</p>` : ""}
          ${missed.length ? `<h2>Questions you missed</h2><div class="review">
            ${missed.map(x => {
              const a = x.q.choices[x.q.answer];
              return `<div class="card">
                ${x.q.section ? `<div class="tag">${esc(secName(x.q.section))}</div>` : ""}
                <p><b>${esc(x.q.q)}</b></p>
                <p><span class="muted">Your answer:</span> ${esc(x.q.choices[x.chosen].text)}</p>
                <p class="small muted">${esc(x.q.choices[x.chosen].why)}</p>
                <p><span class="muted">Right answer:</span> ${esc(a.text)}</p>
                <p class="small muted">${esc(a.why)}</p>
              </div>`;
            }).join("")}
          </div>` : ""}
          <div class="row" style="margin-top:18px"><a class="btn" href="#/ch/${n}">Back to Chapter ${n}</a></div>
        </div>`;
      const retry = document.getElementById("retry");
      if (retry) retry.onclick = () => testView(n, t, missed.map(x => x.i));
      const sa = document.getElementById("study-all");
      if (sa) sa.onclick = () => studyCards(n, allCards, `Cards from the questions you missed on ${title}.`);
      app.querySelectorAll("[data-area]").forEach(b => b.onclick = () => {
        const x = weak[+b.dataset.area];
        studyCards(n, x.cards, `Cards for ${secName(x.s)}, from ${title}.`);
      });
      document.getElementById("again").onclick = () => testView(n, t);
      onKey(null);
      scrollTo(0, 0);
    }

    render();
  }

  // ---------- progress dashboard ----------
  async function dashboard() {
    setCrumbs([{ label: "Home", href: "#/" }, { label: "Progress" }]);
    document.title = "Progress dashboard";
    const h = history(), best = bests(), latest = latestByTest();
    const totalTests = chapters.length * 5;
    const taken = Object.keys(best).length, passed = Object.values(best).filter(v => v >= PASS).length;
    const latestScores = Object.keys(best).map(k => latest[k] ? pctOf(latest[k].right, latest[k].total) : best[k]);
    const avg = latestScores.length ? Math.round(latestScores.reduce((a, b) => a + b, 0) / latestScores.length) : null;
    const answered = h.reduce((a, x) => a + x.total, 0);
    const time = h.reduce((a, x) => a + (x.ms || 0), 0);

    if (!taken) {
      app.innerHTML = `<h1>Progress dashboard</h1>
        <p class="muted">Finish a practice test and your scores, trends, and weakest areas show up here.</p>
        <div class="row"><a class="btn primary" href="#/ch/1/test/1">Start Chapter 1, Test 1</a></div>
        ${backupHTML()}`;
      wireBackup();
      return;
    }

    // Weak areas: section scores from the latest full attempt of every test.
    const areas = {};
    const need = new Set();
    Object.values(latest).forEach(a => {
      Object.entries(a.secs || {}).forEach(([s, [r, tot]]) => {
        const k = `${a.ch}|${s}`;
        const x = areas[k] = areas[k] || { ch: a.ch, s, r: 0, tot: 0, missed: [] };
        x.r += r; x.tot += tot;
      });
      if (a.missed && a.missed.length) need.add(a.ch);
    });
    const tests = {};
    await Promise.all([...need].map(async ch => { tests[ch] = await getTests(ch); }));
    Object.values(latest).forEach(a => {
      const d = tests[a.ch];
      (a.missed || []).forEach(i => {
        const q = d && d.tests[a.t - 1] && d.tests[a.t - 1].questions[i];
        if (q && areas[`${a.ch}|${q.section || "General"}`]) areas[`${a.ch}|${q.section || "General"}`].missed.push(...(q.cards || []));
      });
    });
    const weak = Object.values(areas).filter(x => x.r < x.tot && x.tot >= 2)
      .map(x => Object.assign(x, { p: pctOf(x.r, x.tot), cards: [...new Set(x.missed)] }))
      .sort((a, b) => a.p - b.p || b.tot - a.tot).slice(0, 8);

    const full = fullAttempts().slice(-40);
    app.innerHTML = `
      <h1>Progress dashboard</h1>
      <p class="muted">Every practice test you finish in this browser. Weak areas and averages use your latest attempt at each test.</p>
      <div class="kpis">
        <div class="card kpi"><div class="kpi-num">${passed}<span class="muted"> / ${totalTests}</span></div><div class="muted small">tests passed (${PASS}%+)</div>${meter(pctOf(passed, totalTests))}</div>
        <div class="card kpi"><div class="kpi-num">${avg}%</div><div class="muted small">average score</div></div>
        <div class="card kpi"><div class="kpi-num">${taken}<span class="muted"> / ${totalTests}</span></div><div class="muted small">tests taken</div></div>
        <div class="card kpi"><div class="kpi-num">${answered}</div><div class="muted small">questions answered</div></div>
        <div class="card kpi"><div class="kpi-num">${streak()}</div><div class="muted small">day streak</div></div>
        <div class="card kpi"><div class="kpi-num">${time ? fmtDur(time) : "–"}</div><div class="muted small">time in tests</div></div>
      </div>

      <h2>Score trend</h2>
      ${full.length >= 2 ? `<div class="card chart-card">${trendChart(full)}</div>` : `<p class="muted small">Take at least two full tests to see your trend.</p>`}

      <h2>Areas to study</h2>
      ${weak.length ? `<div class="areas">
        ${weak.map((x, k) => `<div class="card area">
          <div class="row"><span class="badge">Ch ${x.ch}</span><b>${esc(secName(x.s))}</b><span class="spacer"></span><span class="small muted">${x.r} of ${x.tot} right</span></div>
          ${meter(x.p)}
          <div class="row">
            ${x.cards.length ? `<button class="btn small-btn" type="button" data-weak="${k}">Study ${x.cards.length} card${x.cards.length > 1 ? "s" : ""}</button>` : ""}
            <a class="btn small-btn" href="#/ch/${x.ch}">Chapter ${x.ch} tests</a>
          </div>
        </div>`).join("")}
      </div>` : `<p class="muted small">No weak areas in your latest attempts. Keep going.</p>`}

      <h2>Best score by test</h2>
      <div class="card table-wrap">
        <table class="scores">
          <thead><tr><th scope="col">Chapter</th>${[1, 2, 3, 4, 5].map(t => `<th scope="col">T${t}</th>`).join("")}<th scope="col">Avg</th></tr></thead>
          <tbody>${chapters.map(c => {
            const vals = [1, 2, 3, 4, 5].map(t => best[`${c.n}.${t}`]);
            const got = vals.filter(v => v !== undefined);
            const cavg = got.length ? Math.round(got.reduce((a, b) => a + b, 0) / got.length) : null;
            return `<tr><th scope="row"><a href="#/ch/${c.n}" title="${esc(c.title)}">${c.n}.<span class="ch-name"> ${esc(c.title)}</span></a></th>
              ${vals.map((v, i) => `<td><a class="cell ${v === undefined ? "none" : level(v)}" href="#/ch/${c.n}/test/${i + 1}" title="Chapter ${c.n}, Test ${i + 1}: ${v === undefined ? "not taken" : `best ${v}%`}">${v === undefined ? "–" : v}</a></td>`).join("")}
              <td class="avg">${cavg === null ? "–" : cavg + "%"}</td></tr>`;
          }).join("")}</tbody>
        </table>
        <p class="legend small muted"><span class="cell good">80+</span> passed <span class="cell warn">60–79</span> close <span class="cell bad">&lt;60</span> needs work <span class="cell none">–</span> not taken</p>
      </div>

      <h2>Recent attempts</h2>
      ${h.length ? `<div class="card table-wrap"><table class="recent">
        <thead><tr><th scope="col">Date</th><th scope="col">Test</th><th scope="col">Score</th><th scope="col">Time</th></tr></thead>
        <tbody>${h.slice(-12).reverse().map(a => `<tr>
          <td>${fmtDate(a.at)}</td>
          <td><a href="#/ch/${a.ch}/test/${a.t}">Ch ${a.ch} · Test ${a.t}</a>${a.retry ? ` <span class="badge">retry</span>` : ""}</td>
          <td><span class="badge ${pctOf(a.right, a.total) >= PASS ? "good" : "bad"}">${pctOf(a.right, a.total)}%</span> <span class="muted small">${a.right}/${a.total}</span></td>
          <td class="muted small">${a.ms ? fmtDur(a.ms) : "–"}</td></tr>`).join("")}</tbody>
      </table></div>` : `<p class="muted small">Scores from before the dashboard existed show in the table above. New attempts will be listed here.</p>`}
      ${backupHTML()}`;

    app.querySelectorAll("[data-weak]").forEach(b => b.onclick = () => {
      const x = weak[+b.dataset.weak];
      studyCards(x.ch, x.cards, `Cards for ${secName(x.s)}, from questions you missed.`);
    });
    wireTrend();
    wireBackup();
  }

  function trendChart(list) {
    // Size the drawing to the screen so the labels stay readable on a phone.
    const W = Math.max(300, Math.min(900, app.clientWidth - 64)), H = 220, L = 34, R = 12, T = 12, B = 26;
    const x = i => L + (list.length === 1 ? 0 : (i * (W - L - R)) / (list.length - 1));
    const y = p => T + ((100 - p) * (H - T - B)) / 100;
    const pts = list.map((a, i) => [x(i), y(pctOf(a.right, a.total)), a]);
    const grid = [0, 50, 100].map(p => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(p)}" y2="${y(p)}"/><text class="axis" x="${L - 6}" y="${y(p) + 4}" text-anchor="end">${p}</text>`).join("");
    return `<div class="chart" id="trend">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Score for each full practice test, oldest to newest">
        ${grid}
        <line class="pass" x1="${L}" x2="${W - R}" y1="${y(PASS)}" y2="${y(PASS)}"/>
        <text class="axis" x="${W - R}" y="${y(PASS) - 5}" text-anchor="end">Pass ${PASS}%</text>
        <polyline class="line" points="${pts.map(p => p[0] + "," + p[1]).join(" ")}"/>
        ${pts.map((p, i) => `<circle class="dot" cx="${p[0]}" cy="${p[1]}" r="4"/><circle class="hit" data-i="${i}" cx="${p[0]}" cy="${p[1]}" r="12"/>`).join("")}
        <text class="axis" x="${L}" y="${H - 6}">${fmtDate(list[0].at)}</text>
        <text class="axis" x="${W - R}" y="${H - 6}" text-anchor="end">${fmtDate(list[list.length - 1].at)}</text>
      </svg>
      <div class="tip" hidden></div>
    </div>`;
  }
  function wireTrend() {
    const el = document.getElementById("trend");
    if (!el) return;
    const list = fullAttempts().slice(-40), tip = el.querySelector(".tip");
    el.querySelectorAll(".hit").forEach(c => {
      const show = () => {
        const a = list[+c.dataset.i], box = el.getBoundingClientRect(), r = c.getBoundingClientRect();
        tip.innerHTML = `<b>${pctOf(a.right, a.total)}%</b> Ch ${a.ch} · Test ${a.t}<br><span class="muted">${fmtDate(a.at)}, ${a.right}/${a.total}</span>`;
        tip.hidden = false;
        tip.style.left = Math.min(Math.max(r.left - box.left + r.width / 2, 70), box.width - 70) + "px";
        tip.style.top = (r.top - box.top) + "px";
      };
      c.addEventListener("mouseenter", show);
      c.addEventListener("click", show);
      c.addEventListener("mouseleave", () => { tip.hidden = true; });
    });
  }

  // Scores live in this browser only, so offer a file to move them between devices.
  function backupHTML() {
    return `<h2>Back up or move your progress</h2>
      <p class="muted small">Progress is saved in this browser only. Export it to a file to keep a copy or load it on another device.</p>
      <div class="row">
        <button class="btn" type="button" id="export">Export progress</button>
        <label class="btn" for="import">Import progress</label><input type="file" id="import" accept="application/json,.json" hidden>
        <span class="spacer"></span>
        <button class="btn danger" type="button" id="reset">Reset all progress</button>
      </div>`;
  }
  function wireBackup() {
    const keys = () => { try { return Object.keys(localStorage).filter(k => k.startsWith("scor.") && k !== "scor.theme"); } catch (e) { return []; } };
    document.getElementById("export").onclick = () => {
      const data = {};
      keys().forEach(k => { data[k] = localStorage.getItem(k); });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: "scor-study", v: 1, data }, null, 1)], { type: "application/json" }));
      a.download = `scor-progress-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    document.getElementById("import").onchange = async e => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const j = JSON.parse(await f.text());
        if (j.app !== "scor-study" || !j.data) throw new Error("not a progress file");
        if (!confirm("Replace the progress in this browser with the file's progress?")) return;
        keys().forEach(k => localStorage.removeItem(k));
        Object.entries(j.data).forEach(([k, v]) => { if (k.startsWith("scor.")) localStorage.setItem(k, v); });
        dashboard();
      } catch (err) { alert("That file isn't a progress export from this site."); }
    };
    document.getElementById("reset").onclick = () => {
      if (!confirm("Delete every saved score and attempt in this browser? Export first if you want a copy.")) return;
      keys().forEach(k => localStorage.removeItem(k));
      dashboard();
    };
  }

  // ---------- router ----------
  async function route() {
    onKey(null);
    const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
    try {
      if (parts[0] === "ch" && parts[1]) {
        const n = parseInt(parts[1], 10);
        if (parts[2] === "cards") cardsView(n, parts[3]);
        else if (parts[2] === "review") { const r = store.get("review", null); r && r.n === n ? cardsView(n, null, r) : cardsView(n); }
        else if (parts[2] === "test" && parts[3]) await testView(n, parseInt(parts[3], 10));
        else await chapterView(n);
      } else if (parts[0] === "progress") await dashboard();
      else home();
    } catch (e) {
      app.innerHTML = `<p>Something went wrong loading this page. <a href="#/">Go home</a></p>`;
      console.error(e);
    }
    app.focus({ preventScroll: true });
    scrollTo(0, 0);
  }

  Promise.all([getJSON("data/chapters.json"), getJSON("data/flashcards.json")])
    .then(([c, f]) => { chapters = c; flashcards = f; addEventListener("hashchange", route); route(); })
    .catch(() => { app.innerHTML = `<p>Couldn't load the study data. If you opened this file directly, serve the folder over HTTP or use the GitHub Pages link.</p>`; });
})();
