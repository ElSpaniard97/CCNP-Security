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
      <p class="muted">Flashcards and practice tests for every chapter, built from the study notes. Your best scores are saved in this browser.</p>
      <div class="grid">
        ${chapters.map(c => {
          const taken = [1, 2, 3, 4, 5].map(t => store.get(`best.${c.n}.${t}`, null)).filter(v => v !== null);
          const done = taken.length ? ` · ${taken.length} of 5 tests taken` : "";
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
          <span class="muted small">${t.questions.length} questions</span>
          ${bestBadge(n, i + 1)}
        </a>`).join("")}
      </div>` : `<p class="muted">The practice tests for this chapter are not ready yet.</p>`}
      <h2>Flashcards</h2>
      <div class="row">
        <a class="btn primary" href="#/ch/${n}/cards">All ${c.cards} cards</a>
        ${deckCounts.map(([d, k]) => `<a class="btn" href="#/ch/${n}/cards/${encodeURIComponent(d)}">${esc(DECK_LABEL[d])} (${k})</a>`).join("")}
      </div>`;
  }

  function cardsView(n, deck) {
    const c = chap(n);
    if (!c) return home();
    setCrumbs([{ label: "Home", href: "#/" }, { label: `Chapter ${n}`, href: `#/ch/${n}` }, { label: "Flashcards" }]);
    document.title = `Flashcards: Chapter ${n}`;
    const all = flashcards[n] || [];
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
          <h1>Chapter ${n} flashcards</h1>
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
      if (!retryMode) {
        const key = `best.${n}.${t}`;
        const prev = store.get(key, null);
        if (prev === null || pct > prev) store.set(key, pct);
      }
      const missed = items.filter(x => x.chosen !== x.q.answer);
      app.innerHTML = `
        <div class="quiz">
          <h1>${esc(title)} results</h1>
          <div class="score-big">${pct}%</div>
          <p>${right} of ${items.length} correct. ${pct >= PASS ? "Nice work, that's a passing score." : `Aim for ${PASS}% or better before you move on.`}</p>
          <div class="row">
            ${missed.length ? `<button class="btn primary" type="button" id="retry">Retry the ${missed.length} missed</button>` : ""}
            <button class="btn" type="button" id="again">Retake the full test</button>
            ${t < data.tests.length ? `<a class="btn" href="#/ch/${n}/test/${t + 1}">Next test</a>` : ""}
            <a class="btn" href="#/ch/${n}">Back to Chapter ${n}</a>
          </div>
          ${missed.length ? `<h2>Questions you missed</h2><div class="review">
            ${missed.map(x => {
              const a = x.q.choices[x.q.answer];
              return `<div class="card">
                <p><b>${esc(x.q.q)}</b></p>
                <p><span class="muted">Your answer:</span> ${esc(x.q.choices[x.chosen].text)}</p>
                <p class="small muted">${esc(x.q.choices[x.chosen].why)}</p>
                <p><span class="muted">Right answer:</span> ${esc(a.text)}</p>
                <p class="small muted">${esc(a.why)}</p>
              </div>`;
            }).join("")}
          </div>` : ""}
        </div>`;
      const retry = document.getElementById("retry");
      if (retry) retry.onclick = () => testView(n, t, missed.map(x => x.i));
      document.getElementById("again").onclick = () => testView(n, t);
      onKey(null);
      scrollTo(0, 0);
    }

    render();
  }

  // ---------- router ----------
  async function route() {
    onKey(null);
    const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
    try {
      if (parts[0] === "ch" && parts[1]) {
        const n = parseInt(parts[1], 10);
        if (parts[2] === "cards") cardsView(n, parts[3]);
        else if (parts[2] === "test" && parts[3]) await testView(n, parseInt(parts[3], 10));
        else await chapterView(n);
      } else home();
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
