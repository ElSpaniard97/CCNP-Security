(() => {
  "use strict";

  const app = document.getElementById("app");
  const crumbs = document.getElementById("crumbs");
  const DECKS = ["Vocabulary", "Ports and Protocols", "Commands and Tools", "Numbers and Documents to Know"];
  const DECK_LABEL = { "Vocabulary": "Vocabulary", "Ports and Protocols": "Ports", "Commands and Tools": "Commands", "Numbers and Documents to Know": "Numbers and RFCs" };
  const LETTERS = "ABCD";
  const PASS = 80;
  const DAY = 86400000;
  const SRS_DAYS = [0, 1, 3, 7, 14, 30, 60]; // days until a card is due again, by box
  const SRS_NEW = 10;                          // new cards added to a review session
  const BANK_CLEAR = 2;                        // right answers in a row that clear a missed question
  const EXAM_SECS_PER_Q = 72;                  // the real exam is about 100 questions in 120 minutes

  let chapters = [];
  let flashcards = {};
  const testCache = {};
  let keyHandler = null;
  let leaveFns = [];

  // ---------- storage ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem("scor." + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("scor." + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem("scor." + k); } catch (e) { /* storage unavailable */ } },
    keys() { try { return Object.keys(localStorage).filter(k => k.startsWith("scor.")).map(k => k.slice(5)); } catch (e) { return []; } }
  };
  const LOCAL_ONLY = new Set(["theme", "sync", "review", "cards.reverse"]); // never exported or synced

  // ---------- helpers ----------
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const rich = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const chap = n => chapters.find(c => c.n === n);
  const plural = (k, word) => `${k} ${word}${k === 1 ? "" : "s"}`;
  const pctOf = (r, tot) => tot ? Math.round((r / tot) * 100) : 0;
  const level = p => p >= PASS ? "good" : p >= 60 ? "warn" : "bad";
  const secName = s => String(s).replace(/^\d+\.\s*/, "");
  const fmtDate = ts => new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const fmtDur = ms => { if (ms < 60000) return `${Math.max(1, Math.round(ms / 1000))} sec`; const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
  const fmtClock = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  const fmtAgo = ts => { const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : fmtDate(ts); };
  const dayKey = ts => { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
  const testTitle = (n, t) => `Ch ${n} · Test ${t}`;

  function setCrumbs(parts) {
    crumbs.innerHTML = parts.map(p => p.href ? `<a href="${p.href}">${esc(p.label)}</a>` : esc(p.label)).join(" › ");
  }
  function onKey(fn) { keyHandler = fn; }
  function onLeave(fn) { leaveFns.push(fn); }
  document.addEventListener("keydown", e => {
    if (!keyHandler || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest("input, textarea, select")) return;
    keyHandler(e);
  });
  addEventListener("pagehide", () => leaveFns.forEach(f => f()));

  async function getJSON(path) {
    const r = await fetch(path, { cache: "no-cache" });
    if (!r.ok) throw new Error(path + " " + r.status);
    return r.json();
  }
  async function getTests(n) {
    if (!testCache[n]) testCache[n] = getJSON(`data/tests/ch${String(n).padStart(2, "0")}.json`).catch(() => null);
    return testCache[n];
  }
  async function question(ch, t, i) {
    const d = await getTests(ch);
    return d && d.tests[t - 1] && d.tests[t - 1].questions[i];
  }
  const findCard = (n, front) => (flashcards[n] || []).find(c => c.front === front);

  // ---------- progress history ----------
  // Every finished test is saved as { ch, t, at, right, total, retry, exam, missed: [question index], secs: { section: [right, total] }, ms }.
  const attempts = () => store.get("history", []);
  function addAttempt(a) { store.set("history", attempts().concat(a).slice(-1000)); }
  const fullAttempts = (n, t) => attempts().filter(a => !a.retry && !a.exam && (n === undefined || (a.ch === n && a.t === t)));
  const examAttempts = () => attempts().filter(a => a.exam);

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
    const days = new Set(attempts().map(a => dayKey(a.at)).concat(Object.values(store.get("srs", {})).map(x => dayKey(x.at))));
    let d = new Date(), count = 0;
    if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
    while (days.has(dayKey(d))) { count++; d.setDate(d.getDate() - 1); }
    return count;
  }
  function bestBadge(n, t) {
    const b = store.get(`best.${n}.${t}`, null);
    if (b === null) return `<span class="badge">Not taken</span>`;
    return `<span class="badge ${b >= PASS ? "good" : "bad"}">Best ${b}%</span>`;
  }

  // ---------- unfinished tests ----------
  // resume.<key> holds a test in progress; a finished one leaves { done, at } so sync doesn't bring it back.
  const getResume = key => { const r = store.get("resume." + key, null); return r && !r.done ? r : null; };
  const clearResume = key => store.set("resume." + key, { done: true, at: Date.now() });
  function unfinished() {
    return store.keys().filter(k => k.startsWith("resume.")).map(k => [k.slice(7), getResume(k.slice(7))]).filter(x => x[1])
      .sort((a, b) => b[1].at - a[1].at);
  }
  const resumeHref = key => key === "exam" ? "#/exam" : key === "bank" ? "#/bank" : `#/ch/${key.split(".")[1]}/test/${key.split(".")[2]}`;

  // ---------- missed-question bank ----------
  // bank["ch.t.i"] = { s: right answers in a row, at }. s reaching BANK_CLEAR clears it (kept so sync knows).
  function bankRecord(it, right) {
    const bank = store.get("bank", {}), k = `${it.ch}.${it.t}.${it.i}`, cur = bank[k];
    if (!right) bank[k] = { s: 0, at: Date.now() };
    else if (cur && cur.s < BANK_CLEAR) bank[k] = { s: cur.s + 1, at: Date.now() };
    else return;
    store.set("bank", bank);
  }
  const bankActive = n => Object.entries(store.get("bank", {})).filter(([k, v]) => v.s < BANK_CLEAR && (n === undefined || +k.split(".")[0] === n));

  // ---------- spaced repetition ----------
  // srs["ch|front"] = { b: box 1-6, due, at }.
  const srsKey = (n, front) => `${n}|${front}`;
  function srsSet(n, front, grade) {
    const srs = store.get("srs", {}), k = srsKey(n, front), cur = srs[k] || { b: 0 }, now = Date.now();
    let b = grade === "again" ? 1 : Math.min(SRS_DAYS.length - 1, cur.b + (grade === "easy" ? 2 : 1));
    srs[k] = { b, due: grade === "again" ? now : now + SRS_DAYS[b] * DAY, at: now };
    store.set("srs", srs);
  }
  // Cards behind a missed question, or marked still learning, come due right away.
  function srsMiss(n, fronts) {
    if (!fronts.length) return;
    const srs = store.get("srs", {}), now = Date.now();
    fronts.forEach(f => { if (findCard(n, f)) srs[srsKey(n, f)] = { b: 1, due: now, at: now }; });
    store.set("srs", srs);
  }
  const srsDue = n => Object.entries(store.get("srs", {})).filter(([k, v]) => v.due <= Date.now() && (n === undefined || +k.split("|")[0] === n));

  // Open a flashcard deck made of specific cards: [[chapter, front], ...].
  function studyCards(cards, label) {
    store.set("review", { cards, label });
    location.hash = "#/review";
  }
  function cardChips(fronts) {
    return `<div class="term-chips">${fronts.map(f => `<span class="term-chip">${esc(f)}</span>`).join("")}</div>`;
  }
  function meter(p) {
    return `<div class="meter ${level(p)}" role="img" aria-label="${p}% correct"><div style="width:${Math.max(p, 2)}%"></div></div>`;
  }

  // ---------- sync across devices (a private GitHub gist) ----------
  const GIST_FILE = "scor-progress.json";
  const GIST_DESC = "SCOR study progress (written by the study site)";
  let syncTimer = null;

  function snapshot() {
    const data = {};
    store.keys().filter(k => !LOCAL_ONLY.has(k)).forEach(k => { data[k] = store.get(k, null); });
    return data;
  }
  function restore(data) {
    store.keys().filter(k => !LOCAL_ONLY.has(k)).forEach(k => store.del(k));
    Object.entries(data).forEach(([k, v]) => { if (!LOCAL_ONLY.has(k)) store.set(k, v); });
  }
  // Combine two progress snapshots so nothing done on either device is lost.
  function merge(a, b) {
    const out = Object.assign({}, b, a);
    const newer = (x, y) => (!x ? y : !y ? x : (y.at || 0) > (x.at || 0) ? y : x);
    for (const k of new Set(Object.keys(a).concat(Object.keys(b)))) {
      const x = a[k], y = b[k];
      if (x === undefined || y === undefined) continue;
      if (k === "history") {
        const seen = new Map();
        x.concat(y).forEach(h => seen.set(`${h.at}|${h.ch}|${h.t}`, h));
        out[k] = [...seen.values()].sort((p, q) => p.at - q.at).slice(-1000);
      } else if (k.startsWith("best.")) out[k] = Math.max(x, y);
      else if (k.startsWith("last.") || k.startsWith("resume.")) out[k] = newer(x, y);
      else if (k === "bank" || k === "srs") {
        out[k] = Object.assign({}, y);
        Object.entries(x).forEach(([e, v]) => { out[k][e] = newer(v, y[e]); });
      }
    }
    return out;
  }
  async function gh(path, opts = {}) {
    const s = store.get("sync", null);
    const r = await fetch("https://api.github.com" + path, Object.assign({}, opts, {
      headers: { "Authorization": "Bearer " + s.token, "Accept": "application/vnd.github+json", "Content-Type": "application/json" }
    }));
    if (!r.ok) throw new Error(r.status === 401 ? "GitHub rejected the token. Check that it hasn't expired and has Gists read and write access." : `GitHub returned ${r.status}.`);
    return r.json();
  }
  async function syncConnect(token) {
    store.set("sync", { token });
    try {
      const gists = await gh("/gists?per_page=100");
      const found = gists.find(g => g.description === GIST_DESC && g.files[GIST_FILE]);
      const id = found ? found.id : (await gh("/gists", { method: "POST", body: JSON.stringify({ description: GIST_DESC, public: false, files: { [GIST_FILE]: { content: JSON.stringify({ app: "scor-study", v: 1, data: snapshot() }) } } }) })).id;
      store.set("sync", { token, gist: id });
      await syncNow();
    } catch (e) { store.del("sync"); throw e; }
  }
  // overwrite: push this browser's progress as-is (after a reset or import).
  async function syncNow(overwrite) {
    const s = store.get("sync", null);
    if (!s || !s.gist) return;
    let data = snapshot();
    if (!overwrite) {
      const g = await gh(`/gists/${s.gist}`);
      const f = g.files[GIST_FILE];
      let remote = {};
      try { remote = JSON.parse(f.truncated ? await (await fetch(f.raw_url)).text() : f.content).data || {}; } catch (e) { /* empty or unreadable gist */ }
      data = merge(data, remote);
      restore(data);
    }
    await gh(`/gists/${s.gist}`, { method: "PATCH", body: JSON.stringify({ files: { [GIST_FILE]: { content: JSON.stringify({ app: "scor-study", v: 1, data }) } } }) });
    store.set("sync", Object.assign(s, { last: Date.now(), error: null }));
  }
  function syncSoon() {
    if (!store.get("sync", null)) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncNow().catch(e => { const s = store.get("sync", null); if (s) store.set("sync", Object.assign(s, { error: e.message })); }), 1500);
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
  function resumeBanner(list) {
    if (!list.length) return "";
    return `<div class="card resume-list">
      <b>Pick up where you left off</b>
      ${list.map(([k, r]) => `<div class="row">
        <span>${esc(r.title)}</span><span class="muted small">${r.items.filter(x => x.chosen !== null).length} of ${r.items.length} answered · ${fmtAgo(r.at)}</span>
        <span class="spacer"></span><a class="btn small-btn primary" href="${resumeHref(k)}">Resume</a>
      </div>`).join("")}
    </div>`;
  }

  function toolsRow() {
    const due = srsDue().length, bank = bankActive().length;
    return `<div class="tools">
      <a class="card tool" href="#/srs"><b>Review flashcards</b><span class="muted small">${due ? `${plural(due, "card")} due` : "Spaced repetition, all chapters"}</span></a>
      <a class="card tool" href="#/bank"><b>Missed questions</b><span class="muted small">${bank ? `${bank} to clear` : "Nothing to clear yet"}</span></a>
      <a class="card tool" href="#/exam"><b>Mock exam</b><span class="muted small">Timed, every chapter</span></a>
      <a class="card tool" href="#/search"><b>Search</b><span class="muted small">Every flashcard</span></a>
    </div>`;
  }

  function home() {
    setCrumbs([]);
    document.title = "CCNP Security SCOR Study";
    app.innerHTML = `
      <h1>CCNP Security SCOR 350-701</h1>
      <p class="muted">Flashcards and practice tests for every chapter, built from the study notes.</p>
      ${resumeBanner(unfinished())}
      ${homeSummary()}
      ${toolsRow()}
      <h2>Chapters</h2>
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
    const due = srsDue(n).length, bank = bankActive(n).length;
    app.innerHTML = `
      <h1>Chapter ${n}: ${esc(c.title)}</h1>
      <h2>Practice tests</h2>
      ${data ? `<div class="tests">
        ${data.tests.map((t, i) => {
          const k = fullAttempts(n, i + 1).length, last = store.get(`last.${n}.${i + 1}`, null), res = getResume(`test.${n}.${i + 1}`);
          return `<div class="card test-tile">
            <a class="tile-link" href="#/ch/${n}/test/${i + 1}"><strong>${esc(t.title || "Practice Test " + (i + 1))}</strong></a>
            <span class="muted small">${t.questions.length} questions${k ? ` · ${plural(k, "attempt")}` : ""}</span>
            <div class="row">${bestBadge(n, i + 1)}${res ? `<span class="badge warn">In progress</span>` : ""}</div>
            ${last ? `<a class="small" href="#/ch/${n}/test/${i + 1}/last">Last: ${last.pct}% · view results</a>` : ""}
          </div>`;
        }).join("")}
      </div>` : `<p class="muted">The practice tests for this chapter are not ready yet.</p>`}
      <h2>Flashcards</h2>
      <div class="row">
        <a class="btn primary" href="#/ch/${n}/cards">All ${c.cards} cards</a>
        ${deckCounts.map(([d, k]) => `<a class="btn" href="#/ch/${n}/cards/${encodeURIComponent(d)}">${esc(DECK_LABEL[d])} (${k})</a>`).join("")}
      </div>
      <h2>Review</h2>
      <div class="row">
        <a class="btn" href="#/srs/${n}">Spaced repetition${due ? ` (${due} due)` : ""}</a>
        <a class="btn" href="#/bank/${n}">Missed questions${bank ? ` (${bank})` : ""}</a>
      </div>`;
  }

  function cardHTML(card, reverse, ch) {
    const def = `${reverse ? "" : `<div class="term-small">${rich(card.front)}</div>`}<div class="def">${rich(cap(card.back))}</div>${card.more && card.more.length ? `<ul>${card.more.map(m => `<li>${rich(m.trim())}</li>`).join("")}</ul>` : ""}`;
    const term = `<div class="term">${rich(card.front)}</div>`;
    const tag = `<div class="tag">${ch ? `Ch ${ch} · ` : ""}${esc(card.topic)}</div>`;
    return `<div class="flash-inner">
      <div class="card face front">${tag}${reverse ? def : term}</div>
      <div class="card face back">${tag}${reverse ? term : def}</div>
    </div>`;
  }

  // A deck from one chapter, or (review) a custom list of [chapter, front] pairs.
  function cardsView(n, deck, review) {
    const c = chap(n);
    if (!review && !c) return home();
    setCrumbs(review ? [{ label: "Home", href: "#/" }, { label: "Review deck" }]
      : [{ label: "Home", href: "#/" }, { label: `Chapter ${n}`, href: `#/ch/${n}` }, { label: "Flashcards" }]);
    document.title = review ? "Review deck" : `Flashcards: Chapter ${n}`;
    const all = review
      ? review.cards.map(([ch, f]) => { const x = findCard(ch, f); return x && Object.assign({ ch }, x); }).filter(Boolean)
      : (flashcards[n] || []).map(x => Object.assign({ ch: n }, x));
    const multi = new Set(all.map(x => x.ch)).size > 1;
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
      app.innerHTML = `
        <div class="flash-wrap">
          <h1>${review ? "Review deck" : `Chapter ${n} flashcards`}</h1>
          ${review ? `<p class="muted small">${esc(review.label)}</p>` : ""}
          <div class="chips" role="group" aria-label="Deck">
            ${["All", ...DECKS].filter(d => d === "All" || all.some(x => x.deck === d)).map(d =>
              `<button class="chip" type="button" data-deck="${esc(d)}" aria-pressed="${d === filter}">${esc(d === "All" ? "All" : DECK_LABEL[d])}</button>`).join("")}
          </div>
          ${total ? `
          <div class="row small muted"><span>Card ${pos + 1} of ${total}</span><span class="spacer"></span><span>${learning.size} marked still learning</span></div>
          <div class="progress"><div style="width:${((pos + 1) / total) * 100}%"></div></div>
          <div class="flash${flipped ? " flipped" : ""}" id="flash" role="button" tabindex="0" aria-label="Flip card">${cardHTML(card, reverse, multi && card.ch)}</div>
          <p class="hint">Tap the card or press Space to flip. Use the arrow keys to move. Cards marked still learning come up in spaced repetition.</p>
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
      document.getElementById("learn").onclick = () => {
        const k = order[pos];
        if (learning.has(k)) learning.delete(k);
        else { learning.add(k); srsMiss(all[k].ch, [all[k].front]); syncSoon(); }
        render();
      };
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
          <p>You went through ${plural(order.length, "card")} and marked ${missed.length} as still learning.</p>
          <div class="row">
            ${missed.length ? `<button class="btn primary" type="button" id="again">Study the ${missed.length} marked cards</button>` : ""}
            <button class="btn" type="button" id="restart">Start the deck over</button>
            <a class="btn" href="${review ? "#/" : `#/ch/${n}`}">${review ? "Home" : `Back to Chapter ${n}`}</a>
          </div>
        </div>`;
      const again = document.getElementById("again");
      if (again) again.onclick = () => { order = shuffle(missed); pos = 0; flipped = false; learning = new Set(); render(); };
      document.getElementById("restart").onclick = () => { build(false); render(); };
      onKey(null);
    }

    render();
  }

  // ---------- spaced repetition session ----------
  function srsView(n) {
    if (n && !chap(n)) return home();
    setCrumbs(n ? [{ label: "Home", href: "#/" }, { label: `Chapter ${n}`, href: `#/ch/${n}` }, { label: "Spaced repetition" }] : [{ label: "Home", href: "#/" }, { label: "Spaced repetition" }]);
    document.title = "Spaced repetition";
    const srs = store.get("srs", {});
    const due = srsDue(n).sort((a, b) => a[1].due - b[1].due).map(([k]) => [+k.split("|")[0], k.slice(k.indexOf("|") + 1)]);
    const fresh = [];
    for (const c of chapters) {
      if (n && c.n !== n) continue;
      for (const card of flashcards[c.n] || []) {
        if (fresh.length >= SRS_NEW) break;
        if (!srs[srsKey(c.n, card.front)]) fresh.push([c.n, card.front]);
      }
      if (fresh.length >= SRS_NEW) break;
    }
    const queue = due.concat(fresh).filter(([ch, f]) => findCard(ch, f)).slice(0, 60);
    const reverse = store.get("cards.reverse", false);
    let flipped = false, reviewed = 0, again = 0;
    const scope = n ? `Chapter ${n}` : "all chapters";
    const nextIn = (b, grade) => {
      const nb = grade === "again" ? 1 : Math.min(SRS_DAYS.length - 1, b + (grade === "easy" ? 2 : 1));
      return grade === "again" ? "now" : plural(SRS_DAYS[nb], "day");
    };

    function render() {
      if (!queue.length) return done();
      const [ch, front] = queue[0], card = findCard(ch, front), cur = store.get("srs", {})[srsKey(ch, front)];
      const b = cur ? cur.b : 0;
      app.innerHTML = `
        <div class="flash-wrap">
          <h1>Spaced repetition</h1>
          <p class="muted small">${esc(cap(scope))}. Cards you know come back after longer and longer gaps; cards you miss come back soon.</p>
          <div class="row small muted"><span>${plural(queue.length, "card")} left</span><span class="spacer"></span><span>${b ? `Box ${b}` : "New card"}</span></div>
          <div class="flash${flipped ? " flipped" : ""}" id="flash" role="button" tabindex="0" aria-label="Flip card">${cardHTML(card, reverse, ch)}</div>
          ${flipped ? `<div class="row grades">
            <button class="btn grade bad" type="button" data-g="again">Again <span class="small muted">${nextIn(b, "again")}</span></button>
            <button class="btn grade" type="button" data-g="good">Good <span class="small muted">${nextIn(b, "good")}</span></button>
            <button class="btn grade good" type="button" data-g="easy">Easy <span class="small muted">${nextIn(b, "easy")}</span></button>
          </div><p class="hint">Press 1, 2, or 3.</p>` : `<p class="hint">Tap the card or press Space to show the answer.</p>`}
        </div>`;
      const flip = () => { flipped = !flipped; render(); };
      document.getElementById("flash").onclick = flip;
      app.querySelectorAll("[data-g]").forEach(btn => btn.onclick = () => grade(btn.dataset.g));
      onKey(e => {
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); }
        else if (flipped && "123".includes(e.key)) grade(["again", "good", "easy"][+e.key - 1]);
      });
    }
    function grade(g) {
      const [ch, front] = queue.shift();
      srsSet(ch, front, g);
      reviewed++;
      if (g === "again") { again++; queue.splice(Math.min(queue.length, 4), 0, [ch, front]); }
      flipped = false;
      render();
    }
    function done() {
      onKey(null);
      syncSoon();
      const next = Object.values(store.get("srs", {})).filter(v => v.due > Date.now()).sort((a, b) => a.due - b.due)[0];
      app.innerHTML = `
        <div class="flash-wrap">
          <h1>${reviewed ? "Session done" : "Nothing due"}</h1>
          <p>${reviewed ? `You reviewed ${plural(reviewed, "card")} and pressed Again ${plural(again, "time")}.` : `No cards are due for ${scope}.`}
          ${next ? ` The next card is due ${new Date(next.due).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}.` : ""}</p>
          <div class="row">
            <button class="btn primary" type="button" id="more">Add ${SRS_NEW} new cards</button>
            <a class="btn" href="${n ? `#/ch/${n}` : "#/"}">${n ? `Back to Chapter ${n}` : "Home"}</a>
          </div>
        </div>`;
      document.getElementById("more").onclick = () => {
        const srsNow = store.get("srs", {});
        const extra = [];
        for (const c of chapters) {
          if (n && c.n !== n) continue;
          for (const card of flashcards[c.n] || []) if (extra.length < SRS_NEW && !srsNow[srsKey(c.n, card.front)]) extra.push([c.n, card.front]);
        }
        if (!extra.length) { document.getElementById("more").replaceWith(Object.assign(document.createElement("span"), { className: "muted", textContent: "You've started every card." })); return; }
        queue.push(...extra);
        render();
      };
    }
    render();
  }

  // ---------- search ----------
  function searchView(q) {
    setCrumbs([{ label: "Home", href: "#/" }, { label: "Search" }]);
    document.title = "Search flashcards";
    app.innerHTML = `
      <h1>Search flashcards</h1>
      <input class="search" id="q" type="search" placeholder="Try RADIUS, 443, or show crypto" value="${esc(q || "")}" aria-label="Search every flashcard" autocomplete="off">
      <div id="results"></div>`;
    const input = document.getElementById("q"), out = document.getElementById("results");
    const mark = (s, re) => rich(s).replace(re, m => `<mark>${m}</mark>`);
    function run() {
      const term = input.value.trim();
      window.history.replaceState(null, "", term ? `#/search/${encodeURIComponent(term)}` : "#/search");
      if (term.length < 2) { out.innerHTML = `<p class="muted small">Type at least two characters. Searches every term, definition, and detail.</p>`; return; }
      const needle = term.toLowerCase();
      const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      const hits = [];
      chapters.forEach(c => (flashcards[c.n] || []).forEach(card => {
        const f = card.front.toLowerCase().replace(/\*\*/g, "");
        const rest = (card.back + " " + (card.more || []).join(" ")).toLowerCase();
        const score = f === needle ? 4 : f.startsWith(needle) ? 3 : f.includes(needle) ? 2 : rest.includes(needle) ? 1 : 0;
        if (score) hits.push({ score, ch: c.n, card });
      }));
      hits.sort((a, b) => b.score - a.score || a.ch - b.ch);
      out.innerHTML = `<p class="muted small">${plural(hits.length, "card")}${hits.length > 100 ? ", showing the first 100" : ""}.</p>
        ${hits.length ? `<div class="row" style="margin-bottom:12px"><button class="btn small-btn" type="button" id="deck">Study these as a deck</button></div>` : ""}
        <div class="review">${hits.slice(0, 100).map(h => `<div class="card hit-card">
          <div class="tag"><a href="#/ch/${h.ch}">Ch ${h.ch}</a> · ${esc(DECK_LABEL[h.card.deck] || h.card.deck)} · ${esc(h.card.topic)}</div>
          <p><b>${mark(h.card.front, re)}</b></p>
          <p class="small">${mark(cap(h.card.back), re)}</p>
          ${h.card.more && h.card.more.length ? `<ul class="small muted">${h.card.more.map(m => `<li>${mark(m.trim(), re)}</li>`).join("")}</ul>` : ""}
        </div>`).join("")}</div>`;
      const deck = document.getElementById("deck");
      if (deck) deck.onclick = () => studyCards(hits.slice(0, 100).map(h => [h.ch, h.card.front]), `Search results for "${term}".`);
    }
    let t = null;
    input.addEventListener("input", () => { clearTimeout(t); t = setTimeout(run, 150); });
    run();
    input.focus();
  }

  // ---------- quiz engine ----------
  // An item is { ch, t, i, q, order, chosen, flag }. Tests and drills show feedback after each answer;
  // the mock exam doesn't, lets you change answers and flag questions, and runs on a clock.
  const packItems = items => items.map(({ ch, t, i, order, chosen, flag }) => ({ ch, t, i, order, chosen, flag: !!flag }));
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
    onLeave(() => { save(); clearInterval(tick); });
    if (cfg.limit) {
      tick = setInterval(() => {
        const left = cfg.limit - elapsed(), el = document.getElementById("clock");
        if (el) { el.textContent = fmtClock(left); el.classList.toggle("low", left < 5 * 60000); }
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
          <div class="progress"><div style="width:${(done / items.length) * 100}%"></div></div>
          ${exam && showMap ? `<div class="qmap" aria-label="Jump to a question">${items.map((x, k) => `<button type="button" class="qcell${x.chosen !== null ? " answered" : ""}${x.flag ? " flagged" : ""}${k === pos ? " current" : ""}" data-go="${k}" aria-label="Question ${k + 1}${x.flag ? ", flagged" : ""}${x.chosen !== null ? ", answered" : ""}">${k + 1}</button>`).join("")}</div>` : ""}
          <p class="question">${esc(it.q.q)}</p>
          <div class="choices">
            ${it.order.map((ci, k) => {
              let cls = "";
              if (locked && ci === it.q.answer) cls = " correct";
              else if (locked && ci === it.chosen) cls = " wrong";
              else if (exam && ci === it.chosen) cls = " picked";
              return `<button class="choice${cls}" type="button" data-ci="${ci}" ${locked ? "disabled" : ""}>
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
      app.querySelectorAll(".choice").forEach(b => b.onclick = () => choose(+b.dataset.ci));
      app.querySelectorAll("[data-go]").forEach(b => b.onclick = () => { pos = +b.dataset.go; render(); });
      document.getElementById("prev").onclick = () => { pos--; save(); render(); };
      const nextBtn = document.getElementById("next");
      if (nextBtn) nextBtn.onclick = next;
      if (exam) {
        document.getElementById("flag").onclick = () => { it.flag = !it.flag; save(); render(); };
        document.getElementById("map").onclick = () => { showMap = !showMap; render(); };
        document.getElementById("end").onclick = () => {
          const open = items.filter(x => x.chosen === null).length, flagged = items.filter(x => x.flag).length;
          if ((open || flagged) && !confirm(`${open ? `${plural(open, "question")} unanswered. ` : ""}${flagged ? `${plural(flagged, "question")} flagged. ` : ""}Finish the exam now?`)) return;
          finish();
        };
      }
      onKey(e => {
        const k = e.key.toUpperCase();
        const idx = "1234".indexOf(k) >= 0 ? "1234".indexOf(k) : LETTERS.indexOf(k);
        if (!locked && idx >= 0 && k.length === 1) choose(it.order[idx]);
        else if ((answered || exam) && (e.key === "Enter" || e.key === "ArrowRight") && !(exam && last)) next();
        else if (e.key === "ArrowLeft" && pos > 0) { pos--; render(); }
      });
      const fbEl = app.querySelector(".feedback");
      if (fbEl && fbEl.getBoundingClientRect().bottom > innerHeight) fbEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
    function next() { if (pos < items.length - 1) { pos++; save(); render(); scrollTo(0, 0); } else finish(); }
    function finish() {
      if (finished) return;
      finished = true;
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
    const weak = rows.filter(x => x.r < x.tot).slice(0, exam ? 10 : 99), strong = rows.filter(x => x.r === x.tot);
    const allCards = weak.flatMap(x => x.cards.map(f => [x.ch, f]));

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
          ${missed.length && !exam && r.kind !== "bank" ? `<button class="btn primary" type="button" id="retry">Retry the ${missed.length} missed</button>` : ""}
          ${allCards.length ? `<button class="btn" type="button" id="study-all">Study ${plural(allCards.length, "flashcard")} from your misses</button>` : ""}
          <a class="btn" href="${again}" id="again">${r.kind === "bank" ? (bankLeft ? "Keep drilling" : "Back to the bank") : exam ? "New exam" : "Retake the full test"}</a>
          ${r.kind === "test" && r.t < 5 ? `<a class="btn" href="#/ch/${r.ch}/test/${r.t + 1}">Next test</a>` : ""}
          <a class="btn" href="#/progress">Dashboard</a>
        </div>
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
        </div>` : `<h2>Areas to study</h2><p>Nothing missed. Every section was 100%.</p>`}
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
        <p class="muted">Questions from every chapter, weighted by chapter size, on a clock (72 seconds a question, the pace of the real 350-701). Answers aren't shown until you finish, you can change answers and flag questions to come back to, and you can leave and resume.</p>
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
      const all = await Promise.all(chapters.map(c => getTests(c.n)));
      const pools = chapters.map((c, k) => shuffle((all[k] ? all[k].tests : []).flatMap((tt, ti) => tt.questions.map((q, i) => [c.n, ti + 1, i, q]))));
      const size = pools.reduce((a, p) => a + p.length, 0);
      // Share of questions per chapter follows its share of the question pool, rounded so the total is exact.
      const quota = pools.map(p => Math.floor((p.length / size) * len));
      let extra = len - quota.reduce((a, b) => a + b, 0);
      pools.map((p, k) => [(p.length / size) * len - quota[k], k]).sort((a, b) => b[0] - a[0]).forEach(([, k]) => { if (extra > 0) { quota[k]++; extra--; } });
      const items = shuffle(pools.flatMap((p, k) => p.slice(0, quota[k]).map(([ch, t, i, q]) => newItem(ch, t, i, q))));
      startExam(items, { limit: untimed ? 0 : len * EXAM_SECS_PER_Q * 1000 });
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

  // ---------- progress dashboard ----------
  async function dashboard() {
    setCrumbs([{ label: "Home", href: "#/" }, { label: "Progress" }]);
    document.title = "Progress dashboard";
    const h = attempts(), best = bests(), latest = latestByTest();
    const totalTests = chapters.length * 5;
    const taken = Object.keys(best).length, passed = Object.values(best).filter(v => v >= PASS).length;
    const latestScores = Object.keys(best).map(k => latest[k] ? pctOf(latest[k].right, latest[k].total) : best[k]);
    const avg = latestScores.length ? Math.round(latestScores.reduce((a, b) => a + b, 0) / latestScores.length) : null;
    const answered = h.reduce((a, x) => a + x.total, 0);
    const time = h.reduce((a, x) => a + (x.ms || 0), 0);
    const exams = examAttempts();

    if (!taken && !exams.length) {
      app.innerHTML = `<h1>Progress dashboard</h1>
        <p class="muted">Finish a practice test and your scores, trends, and weakest areas show up here.</p>
        ${resumeBanner(unfinished())}
        <div class="row"><a class="btn primary" href="#/ch/1/test/1">Start Chapter 1, Test 1</a></div>
        ${syncHTML()}${backupHTML()}`;
      wireSync(); wireBackup();
      return;
    }

    // Weak areas: section scores from the latest full attempt of every test.
    const areas = {};
    Object.values(latest).forEach(a => {
      Object.entries(a.secs || {}).forEach(([s, [r, tot]]) => {
        const k = `${a.ch}|${s}`;
        const x = areas[k] = areas[k] || { ch: a.ch, s, r: 0, tot: 0, missed: [] };
        x.r += r; x.tot += tot;
      });
    });
    for (const a of Object.values(latest)) {
      for (const i of a.missed || []) {
        const q = await question(a.ch, a.t, i);
        const k = q && `${a.ch}|${q.section || "General"}`;
        if (q && areas[k]) areas[k].missed.push(...(q.cards || []));
      }
    }
    const weak = Object.values(areas).filter(x => x.r < x.tot && x.tot >= 2)
      .map(x => Object.assign(x, { p: pctOf(x.r, x.tot), cards: [...new Set(x.missed)] }))
      .sort((a, b) => a.p - b.p || b.tot - a.tot).slice(0, 8);

    const full = fullAttempts().slice(-40);
    app.innerHTML = `
      <h1>Progress dashboard</h1>
      <p class="muted">Every practice test you finish. Weak areas and averages use your latest attempt at each test.</p>
      ${resumeBanner(unfinished())}
      <div class="kpis">
        <div class="card kpi"><div class="kpi-num">${passed}<span class="muted"> / ${totalTests}</span></div><div class="muted small">tests passed (${PASS}%+)</div>${meter(pctOf(passed, totalTests))}</div>
        <div class="card kpi"><div class="kpi-num">${avg === null ? "–" : avg + "%"}</div><div class="muted small">average score</div></div>
        <div class="card kpi"><div class="kpi-num">${taken}<span class="muted"> / ${totalTests}</span></div><div class="muted small">tests taken</div></div>
        <div class="card kpi"><div class="kpi-num">${answered}</div><div class="muted small">questions answered</div></div>
        <div class="card kpi"><div class="kpi-num">${streak()}</div><div class="muted small">day streak</div></div>
        <div class="card kpi"><div class="kpi-num">${time ? fmtDur(time) : "–"}</div><div class="muted small">time in tests</div></div>
        <a class="card kpi kpi-link" href="#/bank"><div class="kpi-num">${bankActive().length}</div><div class="muted small">missed questions to clear</div></a>
        <a class="card kpi kpi-link" href="#/srs"><div class="kpi-num">${srsDue().length}</div><div class="muted small">flashcards due</div></a>
      </div>

      <h2>Score trend</h2>
      ${full.length >= 2 ? `<div class="card chart-card">${trendChart(full)}</div>` : `<p class="muted small">Take at least two full tests to see your trend.</p>`}

      ${exams.length ? `<h2>Mock exams</h2>${attemptStrip(exams)}<div class="row" style="margin-top:8px"><a class="btn small-btn" href="#/exam/last">Last exam results</a><a class="btn small-btn" href="#/exam">New exam</a></div>` : ""}

      <h2>Areas to study</h2>
      ${weak.length ? `<div class="areas">
        ${weak.map((x, k) => `<div class="card area">
          <div class="row"><span class="badge">Ch ${x.ch}</span><b>${esc(secName(x.s))}</b><span class="spacer"></span><span class="small muted">${x.r} of ${x.tot} right</span></div>
          ${meter(x.p)}
          <div class="row">
            ${x.cards.length ? `<button class="btn small-btn" type="button" data-weak="${k}">Study ${plural(x.cards.length, "card")}</button>` : ""}
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
              ${vals.map((v, i) => `<td><a class="cell ${v === undefined ? "none" : level(v)}" href="${store.get(`last.${c.n}.${i + 1}`, null) ? `#/ch/${c.n}/test/${i + 1}/last` : `#/ch/${c.n}/test/${i + 1}`}" title="Chapter ${c.n}, Test ${i + 1}: ${v === undefined ? "not taken" : `best ${v}%`}">${v === undefined ? "–" : v}</a></td>`).join("")}
              <td class="avg">${cavg === null ? "–" : cavg + "%"}</td></tr>`;
          }).join("")}</tbody>
        </table>
        <p class="legend small muted"><span class="cell good">80+</span> passed <span class="cell warn">60–79</span> close <span class="cell bad">&lt;60</span> needs work <span class="cell none">–</span> not taken. Tap a score to see your last results.</p>
      </div>

      <h2>Recent attempts</h2>
      ${h.length ? `<div class="card table-wrap"><table class="recent">
        <thead><tr><th scope="col">Date</th><th scope="col">Test</th><th scope="col">Score</th><th scope="col">Time</th></tr></thead>
        <tbody>${h.slice(-12).reverse().map(a => `<tr>
          <td>${fmtDate(a.at)}</td>
          <td>${a.exam ? `<a href="#/exam">Mock exam</a>` : `<a href="#/ch/${a.ch}/test/${a.t}">${testTitle(a.ch, a.t)}</a>`}${a.retry ? ` <span class="badge">retry</span>` : ""}</td>
          <td><span class="badge ${pctOf(a.right, a.total) >= PASS ? "good" : "bad"}">${pctOf(a.right, a.total)}%</span> <span class="muted small">${a.right}/${a.total}</span></td>
          <td class="muted small">${a.ms ? fmtDur(a.ms) : "–"}</td></tr>`).join("")}</tbody>
      </table></div>` : `<p class="muted small">Scores from before the dashboard existed show in the table above. New attempts will be listed here.</p>`}
      ${syncHTML()}
      ${backupHTML()}`;

    app.querySelectorAll("[data-weak]").forEach(b => b.onclick = () => {
      const x = weak[+b.dataset.weak];
      studyCards(x.cards.map(f => [x.ch, f]), `Cards for ${secName(x.s)}, from questions you missed.`);
    });
    wireTrend();
    wireSync();
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
        tip.innerHTML = `<b>${pctOf(a.right, a.total)}%</b> ${testTitle(a.ch, a.t)}<br><span class="muted">${fmtDate(a.at)}, ${a.right}/${a.total}</span>`;
        tip.hidden = false;
        tip.style.left = Math.min(Math.max(r.left - box.left + r.width / 2, 70), box.width - 70) + "px";
        tip.style.top = (r.top - box.top) + "px";
      };
      c.addEventListener("mouseenter", show);
      c.addEventListener("click", show);
      c.addEventListener("mouseleave", () => { tip.hidden = true; });
    });
  }

  function syncHTML() {
    const s = store.get("sync", null);
    return `<h2>Sync across devices</h2>
      <div class="card sync" id="sync">
      ${s && s.gist ? `<p><span class="badge good">On</span> Progress syncs to a private gist on your GitHub account. ${s.last ? `Last synced ${fmtAgo(s.last)}.` : ""}</p>
        ${s.error ? `<p class="small" style="color:var(--bad)">${esc(s.error)}</p>` : ""}
        <div class="row"><button class="btn" type="button" id="sync-now">Sync now</button><button class="btn" type="button" id="sync-off">Turn off on this device</button></div>`
      : `<p class="small">Sync uses a private GitHub gist, so your laptop and phone share scores, unfinished tests, missed questions, and flashcard progress.</p>
        <ol class="small muted">
          <li>On GitHub, open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Settings › Developer settings › Fine-grained tokens › Generate new token</a>.</li>
          <li>Give it a name and an expiration. Under <b>Account permissions</b>, set <b>Gists</b> to <b>Read and write</b>. No repository access is needed.</li>
          <li>Paste the token here on each device. It's stored only in this browser and sent only to GitHub.</li>
        </ol>
        <div class="row"><input class="search" id="token" type="password" placeholder="github_pat_…" autocomplete="off" aria-label="GitHub token"><button class="btn primary" type="button" id="sync-on">Turn on sync</button></div>`}
      <p class="small" id="sync-msg" role="status"></p>
      </div>`;
  }
  function wireSync() {
    const msg = document.getElementById("sync-msg");
    const run = async (fn, okText) => {
      msg.textContent = "Syncing…";
      try { await fn(); msg.textContent = okText; setTimeout(route, 600); } catch (e) { msg.textContent = e.message || "Sync failed."; msg.style.color = "var(--bad)"; }
    };
    const on = document.getElementById("sync-on");
    if (on) on.onclick = () => { const t = document.getElementById("token").value.trim(); if (t) run(() => syncConnect(t), "Sync is on."); };
    const now = document.getElementById("sync-now");
    if (now) now.onclick = () => run(() => syncNow(), "Synced.");
    const off = document.getElementById("sync-off");
    if (off) off.onclick = () => { store.del("sync"); route(); };
  }

  // Scores live in this browser only unless sync is on, so offer a file too.
  function backupHTML() {
    return `<h2>Back up your progress</h2>
      <p class="muted small">Export your progress to a file to keep a copy or load it somewhere else.</p>
      <div class="row">
        <button class="btn" type="button" id="export">Export progress</button>
        <label class="btn" for="import">Import progress</label><input type="file" id="import" accept="application/json,.json" hidden>
        <span class="spacer"></span>
        <button class="btn danger" type="button" id="reset">Reset all progress</button>
      </div>`;
  }
  function wireBackup() {
    const pushOver = () => store.get("sync", null) && syncNow(true).catch(() => {});
    document.getElementById("export").onclick = () => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: "scor-study", v: 2, data: snapshot() }, null, 1)], { type: "application/json" }));
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
        // Version 1 files stored raw localStorage strings under "scor."-prefixed keys.
        const data = j.v === 1 ? Object.fromEntries(Object.entries(j.data).map(([k, v]) => [k.replace(/^scor\./, ""), JSON.parse(v)])) : j.data;
        restore(data);
        pushOver();
        route();
      } catch (err) { alert("That file isn't a progress export from this site."); }
    };
    document.getElementById("reset").onclick = () => {
      if (!confirm(`Delete every saved score, attempt, and review in this browser${store.get("sync", null) ? " and in your synced copy" : ""}? Export first if you want a copy.`)) return;
      restore({});
      pushOver();
      route();
    };
  }

  // ---------- router ----------
  async function route() {
    onKey(null);
    leaveFns.forEach(f => f());
    leaveFns = [];
    const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
    try {
      if (parts[0] === "ch" && parts[1]) {
        const n = parseInt(parts[1], 10);
        if (parts[2] === "cards") cardsView(n, parts[3]);
        else if (parts[2] === "test" && parts[3] && parts[4] === "last") await lastView(n, parseInt(parts[3], 10));
        else if (parts[2] === "test" && parts[3]) await testView(n, parseInt(parts[3], 10));
        else await chapterView(n);
      } else if (parts[0] === "review") { const r = store.get("review", null); r && r.cards ? cardsView(null, null, r) : home(); }
      else if (parts[0] === "srs") srsView(parts[1] ? parseInt(parts[1], 10) : undefined);
      else if (parts[0] === "bank") await bankView(parts[1] ? parseInt(parts[1], 10) : undefined);
      else if (parts[0] === "exam") parts[1] === "last" ? await lastView("exam") : await examView();
      else if (parts[0] === "search") searchView(parts.slice(1).join("/"));
      else if (parts[0] === "progress") await dashboard();
      else home();
    } catch (e) {
      app.innerHTML = `<p>Something went wrong loading this page. <a href="#/">Go home</a></p>`;
      console.error(e);
    }
    app.focus({ preventScroll: true });
    scrollTo(0, 0);
  }

  Promise.all([getJSON("data/chapters.json"), getJSON("data/flashcards.json")])
    .then(([c, f]) => {
      chapters = c; flashcards = f;
      addEventListener("hashchange", route);
      route();
      if (store.get("sync", null)) syncNow().catch(() => {});
    })
    .catch(() => { app.innerHTML = `<p>Couldn't load the study data. If you opened this file directly, serve the folder over HTTP or use the GitHub Pages link.</p>`; });
})();
