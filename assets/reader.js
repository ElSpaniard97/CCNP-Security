// Read-along chapter reader modeled on Immersive Reader: narration with word highlighting,
// text and grammar preferences, line focus, dictionary, translation and reading practice.
import { app, chap, setCrumbs, onKey, onLeave, getJSON, loadCards, flashcards, store, esc, fmtClock } from "./runtime.js";
import { icon } from "./visuals.js";

const DEFAULTS = { size: 26, spacing: true, font: "sans", page: "site", syll: false, pos: { n: false, v: false, a: false, r: false }, labels: false,
  focus: 0, dict: true, lang: "", byWord: true, doc: false, practice: false, rate: 1, follow: true };
const FONTS = { sans: "Sans", serif: "Serif", rounded: "Rounded" };
const PAGES = { site: "Match site", white: "White", cream: "Cream", sepia: "Sepia", mint: "Mint", gray: "Gray", night: "Night", black: "Black" };
const POS = { n: ["Nouns", "n"], v: ["Verbs", "v"], a: ["Adjectives", "adj"], r: ["Adverbs", "adv"] };
const LANGS = { es: "Spanish", fr: "French", de: "German", it: "Italian", pt: "Portuguese", zh: "Chinese", ja: "Japanese", ko: "Korean", ar: "Arabic", hi: "Hindi", ru: "Russian", vi: "Vietnamese", tl: "Tagalog" };
const RATES = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const getPrefs = () => { const p = store.get("reader", {}); return { ...DEFAULTS, ...p, pos: { ...DEFAULTS.pos, ...(p.pos || {}) } }; };
const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");

let index = null;
async function readerIndex() {
  if (!index) index = await getJSON("data/reader/index.json").catch(() => []);
  return index;
}

async function readerListView() {
  setCrumbs([{ label: "Home", href: "#/" }, { label: "Listen and read" }]);
  document.title = "Listen and read";
  const list = await readerIndex(), have = new Map(list.map(x => [x.n, x]));
  app.innerHTML = `<h1>Listen and read</h1>
    <p class="muted">Each chapter's study notes, read aloud with every word highlighted as it's spoken. Change the text size, spacing, font and page color, color parts of speech, focus on one line, look up words, translate, and practice reading aloud.</p>
    <div class="tests reader-list">${[...have.values()].map(x => `<div class="card test-tile">
      <a class="tile-link" href="#/ch/${x.n}/read"><strong>Chapter ${x.n}: ${esc(x.title)}</strong></a>
      <span class="muted small">${Math.round(x.duration / 60)} min narration${store.get(`reader.pos.${x.n}`, 0) > 5 ? ` · stopped at ${fmtClock(store.get(`reader.pos.${x.n}`, 0) * 1000)}` : ""}</span>
    </div>`).join("")}</div>
    <p class="muted small">More chapters are added as their narration is recorded.</p>`;
}

async function readerView(n) {
  const c = chap(n), list = await readerIndex();
  if (!c || !list.some(x => x.n === n)) {
    setCrumbs([{ label: "Home", href: "#/" }, { label: "Listen and read", href: "#/read" }, { label: `Chapter ${n}` }]);
    app.innerHTML = `<h1>Chapter ${n} narration isn't ready yet</h1><p><a href="#/read">See the chapters you can listen to</a></p>`;
    return;
  }
  setCrumbs([{ label: "Home", href: "#/" }, { label: "Listen and read", href: "#/read" }, { label: `Chapter ${n}` }]);
  document.title = `Listen and read: Chapter ${n}`;
  const [data] = await Promise.all([getJSON(`data/reader/ch${String(n).padStart(2, "0")}.json`), loadCards(n)]);
  let prefs = getPrefs();
  const save = () => store.set("reader", prefs);

  // Flat word list: times drive highlighting, elements receive the classes.
  const words = [], lineOf = [];
  const body = data.lines.map((ln, li) => {
    const colon = ln.k === "B" ? ln.w.findIndex((w, i) => i < 9 && /:$/.test(w.w)) : -1;
    const html = ln.w.map((w, wi) => {
      const i = words.length; words.push(w); lineOf.push(li);
      return `<span class="w${w.p ? " p-" + w.p : ""}${wi <= colon ? " lead" : ""}" data-i="${i}"${w.p ? ` data-pos="${POS[w.p][1]}"` : ""}><span class="plain">${esc(w.w)}</span>${w.s ? `<span class="syl">${esc(w.s)}</span>` : ""}</span>`;
    }).join(" ");
    const tag = ln.k === "H2" ? "h2" : ln.k === "H3" ? "h3" : "p";
    return `<${tag} class="rl${ln.k === "B" ? ` bullet nest-${Math.min(ln.n, 3)}` : ""}" data-l="${li}">${html}</${tag}>`;
  }).join("");
  const times = words.map(w => w.t);

  app.className = "reader-app";
  app.innerHTML = `
    <div class="reader-bar">
      <h1 class="reader-title">Chapter ${n}: ${esc(c.title)}</h1>
      <div class="reader-tabs" role="tablist" aria-label="Reader options">
        <button class="reader-tab" type="button" role="tab" data-panel="text" aria-selected="false" aria-controls="panel" title="Text preferences"><span class="aa" aria-hidden="true">Aa</span><span class="sr">Text preferences</span></button>
        <button class="reader-tab" type="button" role="tab" data-panel="grammar" aria-selected="false" aria-controls="panel" title="Grammar options">${icon("grammar")}<span class="sr">Grammar options</span></button>
        <button class="reader-tab" type="button" role="tab" data-panel="reading" aria-selected="false" aria-controls="panel" title="Reading preferences">${icon("book")}<span class="sr">Reading preferences</span></button>
      </div>
    </div>
    <aside class="reader-panel" id="panel" role="tabpanel" hidden></aside>
    <article class="reader-page" id="page" aria-label="Chapter text">${body}</article>
    <div class="focus-mask top" aria-hidden="true"></div><div class="focus-mask bottom" aria-hidden="true"></div>
    <div class="word-pop" id="pop" role="dialog" aria-label="Word" hidden></div>
    <div class="practice-pop" id="practice" role="dialog" aria-label="Reading practice" hidden></div>
    <div class="player" role="group" aria-label="Narration">
      <button class="icon-btn" type="button" id="back" aria-label="Back 10 seconds">${icon("back")}</button>
      <button class="icon-btn play" type="button" id="play" aria-label="Play">${icon("play")}</button>
      <button class="icon-btn" type="button" id="fwd" aria-label="Forward 10 seconds">${icon("forward")}</button>
      <span class="clock small" id="now">0:00</span>
      <input type="range" id="seek" min="0" max="${Math.floor(data.duration)}" step="1" value="0" aria-label="Position in narration">
      <span class="clock small muted" id="dur">${fmtClock(data.duration * 1000)}</span>
      <label class="rate small"><span class="sr">Reading speed</span><select id="rate">${RATES.map(r => `<option value="${r}"${r === prefs.rate ? " selected" : ""}>${r}×</option>`).join("")}</select></label>
      <button class="icon-btn" type="button" id="practice-btn" aria-label="Practice reading this line" ${prefs.practice ? "" : "hidden"}>${icon("mic")}</button>
    </div>
    <audio id="audio" preload="metadata" src="${data.audio}"></audio>`;

  const page = document.getElementById("page"), audio = document.getElementById("audio"), panel = document.getElementById("panel"), pop = document.getElementById("pop");
  const playBtn = document.getElementById("play"), seek = document.getElementById("seek"), now = document.getElementById("now");
  const els = [...page.querySelectorAll(".w")], lineEls = [...page.querySelectorAll(".rl")];
  const masks = [...app.querySelectorAll(".focus-mask")];
  let cur = -1, raf = 0, seeking = false, translator = null, translated = {}, userScrolled = 0;

  // ---------- preferences ----------
  function apply() {
    const cl = page.classList;
    page.style.setProperty("--reader-size", prefs.size + "px");
    cl.toggle("spaced", prefs.spacing);
    cl.toggle("syll", prefs.syll);
    cl.toggle("labels", prefs.labels && Object.values(prefs.pos).some(Boolean));
    for (const k in POS) cl.toggle("show-" + k, prefs.pos[k]);
    page.dataset.font = prefs.font;
    app.dataset.page = prefs.page;
    audio.playbackRate = prefs.rate;
    document.getElementById("practice-btn").hidden = !prefs.practice || !Recognition;
    page.querySelectorAll(".tr").forEach(x => x.hidden = !prefs.doc);
    placeFocus();
  }
  const toggle = (id, label, on, hint = "") => `<label class="switch"><span>${label}${hint ? `<small>${hint}</small>` : ""}</span><input type="checkbox" id="${id}" role="switch"${on ? " checked" : ""}></label>`;
  const panels = {
    text: () => `<h2>Text preferences</h2>
      <label class="field">Text size <span class="muted small" id="size-val">${prefs.size}px</span><input type="range" id="size" min="16" max="56" step="2" value="${prefs.size}"></label>
      ${toggle("spacing", "Increase spacing", prefs.spacing)}
      <fieldset><legend>Font</legend><div class="seg">${Object.entries(FONTS).map(([k, v]) => `<button type="button" class="seg-btn font-${k}" data-font="${k}" aria-pressed="${prefs.font === k}">${v}</button>`).join("")}</div></fieldset>
      <fieldset><legend>Page color</legend><div class="swatches">${Object.entries(PAGES).map(([k, v]) => `<button type="button" class="swatch sw-${k}" data-page="${k}" aria-pressed="${prefs.page === k}" title="${v}"><span>Aa</span><span class="sr">${v}</span></button>`).join("")}</div></fieldset>`,
    grammar: () => `<h2>Grammar options</h2>
      ${toggle("syll", "Syllables", prefs.syll, "Splits words like cy·ber·se·cu·ri·ty")}
      <fieldset><legend>Parts of speech</legend>${Object.entries(POS).map(([k, [label]]) => `<label class="switch"><span><span class="pos-key p-${k}">${label}</span></span><input type="checkbox" data-pos="${k}" role="switch"${prefs.pos[k] ? " checked" : ""}></label>`).join("")}
      ${toggle("labels", "Show labels", prefs.labels, "Puts n, v, adj or adv above colored words")}</fieldset>`,
    reading: () => `<h2>Reading preferences</h2>
      ${toggle("focus-on", "Line focus", prefs.focus > 0, "Dims everything but the lines being read")}
      <div class="seg" role="group" aria-label="Lines in focus">${[1, 3, 5].map(k => `<button type="button" class="seg-btn" data-focus="${k}" aria-pressed="${prefs.focus === k}" ${prefs.focus ? "" : "disabled"}>${k} line${k > 1 ? "s" : ""}</button>`).join("")}</div>
      ${toggle("dict", "Dictionary", prefs.dict, "Select a word for its meaning, syllables and chapter flashcard")}
      <fieldset><legend>Translate</legend>
        <select id="lang" aria-label="Translation language"><option value="">Choose a language</option>${Object.entries(LANGS).map(([k, v]) => `<option value="${k}"${prefs.lang === k ? " selected" : ""}>${v}</option>`).join("")}</select>
        ${toggle("by-word", "By word", prefs.byWord, "Shows the translation when you select a word")}
        ${toggle("doc", "Document", prefs.doc, "Adds a translation under each line")}
        <p class="small muted" id="tr-status" role="status">${"Translator" in self ? "" : "Translation uses the browser's built-in translator, which Chrome 138 or later on a computer has. This browser doesn't have it."}</p></fieldset>
      ${toggle("practice-on", "Reading practice", prefs.practice, Recognition ? "Read a line aloud and see which words you got right, plus your speed" : "Needs speech recognition, which this browser doesn't have. Try Safari or Chrome.")}
      ${toggle("follow", "Follow along", prefs.follow, "Scrolls to keep the spoken line in view")}`,
  };
  function openPanel(name) {
    const open = panel.dataset.open === name && !panel.hidden;
    app.querySelectorAll(".reader-tab").forEach(t => t.setAttribute("aria-selected", String(!open && t.dataset.panel === name)));
    panel.hidden = open;
    if (open) return;
    panel.dataset.open = name;
    panel.style.top = Math.round(app.querySelector(".reader-bar").getBoundingClientRect().bottom + 8) + "px";
    panel.innerHTML = `<button class="icon-btn close" type="button" id="panel-close" aria-label="Close options">×</button>${panels[name]()}`;
    wirePanel();
  }
  function wirePanel() {
    const $ = id => panel.querySelector("#" + id);
    const bind = (id, key, after) => { const el = $(id); if (el) el.onchange = () => { prefs[key] = el.checked; save(); apply(); after && after(); }; };
    $("panel-close").onclick = () => openPanel(panel.dataset.open);
    if ($("size")) $("size").oninput = e => { prefs.size = +e.target.value; $("size-val").textContent = prefs.size + "px"; save(); apply(); };
    bind("spacing", "spacing"); bind("syll", "syll"); bind("labels", "labels"); bind("dict", "dict"); bind("follow", "follow");
    bind("by-word", "byWord"); bind("doc", "doc", translateDoc); bind("practice-on", "practice");
    panel.querySelectorAll("[data-font]").forEach(b => b.onclick = () => { prefs.font = b.dataset.font; save(); apply(); panel.querySelectorAll("[data-font]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); });
    panel.querySelectorAll("[data-page]").forEach(b => b.onclick = () => { prefs.page = b.dataset.page; save(); apply(); panel.querySelectorAll("[data-page]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); });
    panel.querySelectorAll("input[data-pos]").forEach(b => b.onchange = () => { prefs.pos[b.dataset.pos] = b.checked; save(); apply(); });
    if ($("focus-on")) $("focus-on").onchange = e => { prefs.focus = e.target.checked ? (prefs.focus || 1) : 0; save(); apply(); panel.querySelectorAll("[data-focus]").forEach(b => { b.disabled = !prefs.focus; b.setAttribute("aria-pressed", String(prefs.focus === +b.dataset.focus)); }); };
    panel.querySelectorAll("[data-focus]").forEach(b => b.onclick = () => { prefs.focus = +b.dataset.focus; save(); apply(); panel.querySelectorAll("[data-focus]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); });
    if ($("lang")) $("lang").onchange = e => { prefs.lang = e.target.value; translator = null; translated = {}; page.querySelectorAll(".tr").forEach(x => x.remove()); save(); translateDoc(); };
  }
  app.querySelectorAll(".reader-tab").forEach(t => t.onclick = () => openPanel(t.dataset.panel));

  // ---------- translation (browser built-in, on device) ----------
  async function getTranslator() {
    if (!prefs.lang || !("Translator" in self)) return null;
    if (translator) return translator;
    const status = document.getElementById("tr-status");
    try {
      const say = t => { if (status) status.textContent = t; };
      if ((await Translator.availability({ sourceLanguage: "en", targetLanguage: prefs.lang })) === "unavailable") { say(`The browser can't translate to ${LANGS[prefs.lang]}.`); return null; }
      say("Getting the translator ready…");
      translator = await Translator.create({ sourceLanguage: "en", targetLanguage: prefs.lang, monitor: m => m.addEventListener("downloadprogress", e => say(`Downloading ${LANGS[prefs.lang]}: ${Math.round(e.loaded * 100)}%`)) });
      say("");
      return translator;
    } catch (e) { const s = document.getElementById("tr-status"); if (s) s.textContent = "Translation couldn't start in this browser."; return null; }
  }
  let docJob = 0;
  async function translateDoc() {
    if (!prefs.doc) { apply(); return; }
    const tr = await getTranslator(); if (!tr) return;
    const job = ++docJob, lang = prefs.lang;
    // Translate the lines near the reading position first, then the rest.
    const start = cur >= 0 ? lineOf[cur] : 0;
    const order = data.lines.map((_, i) => i).sort((a, b) => Math.abs(a - start) - Math.abs(b - start));
    for (const li of order) {
      if (job !== docJob || !prefs.doc || lang !== prefs.lang) return;
      if (lineEls[li].nextElementSibling?.classList.contains("tr")) continue;
      const text = data.lines[li].w.map(w => w.w).join(" ");
      try {
        const out = translated[text] || (translated[text] = await tr.translate(text));
        const el = document.createElement(lineEls[li].tagName === "P" ? "p" : "div");
        el.className = `tr${lineEls[li].classList.contains("bullet") ? " nest-" + Math.min(data.lines[li].n, 3) : ""}`; el.lang = lang; el.textContent = out;
        lineEls[li].after(el);
      } catch (e) { return; }
    }
  }

  // ---------- playback and highlighting ----------
  const wordAt = t => { let lo = 0, hi = times.length - 1, ans = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (times[m] <= t) { ans = m; lo = m + 1; } else hi = m - 1; } return ans; };
  function highlight(i, scroll) {
    if (i === cur) return;
    if (cur >= 0) { els[cur].classList.remove("on"); lineEls[lineOf[cur]].classList.remove("line-on"); }
    cur = i;
    if (i < 0) return;
    els[i].classList.add("on"); lineEls[lineOf[i]].classList.add("line-on");
    if (scroll && prefs.follow && Date.now() - userScrolled > 4000) {
      const r = els[i].getBoundingClientRect(), top = innerHeight * 0.3, bottom = innerHeight * 0.62;
      if (r.top < top || r.bottom > bottom) scrollBy({ top: r.top - innerHeight * 0.4, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
    placeFocus();
  }
  function placeFocus() {
    const on = prefs.focus > 0;
    masks.forEach(m => m.hidden = !on);
    if (!on) return;
    const el = els[Math.max(cur, 0)], r = el.getBoundingClientRect();
    const lh = parseFloat(getComputedStyle(el.parentElement).lineHeight) || r.height * 1.6;
    const mid = (r.top + r.bottom) / 2, half = lh * prefs.focus / 2;
    masks[0].style.height = Math.max(0, mid - half) + "px";
    masks[1].style.top = (mid + half) + "px";
  }
  function tick() {
    const t = audio.currentTime;
    highlight(wordAt(t + 0.05), true);
    if (!seeking) { seek.value = Math.floor(t); now.textContent = fmtClock(t * 1000); }
    if (!audio.paused) raf = requestAnimationFrame(tick);
  }
  function setPlaying() {
    const p = !audio.paused;
    playBtn.innerHTML = icon(p ? "pause" : "play"); playBtn.setAttribute("aria-label", p ? "Pause" : "Play");
    if (p) { cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); }
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = p ? "playing" : "paused";
  }
  const play = () => audio.play().catch(() => {});
  const toggleplay = () => audio.paused ? play() : audio.pause();
  const jump = s => { audio.currentTime = Math.min(Math.max(0, audio.currentTime + s), data.duration - 0.1); tick(); };
  const goWord = i => { audio.currentTime = Math.max(0, times[i] - 0.05); highlight(i, false); tick(); };
  const savePos = () => store.set(`reader.pos.${n}`, Math.floor(audio.currentTime));
  audio.addEventListener("play", setPlaying); audio.addEventListener("pause", () => { setPlaying(); savePos(); });
  audio.addEventListener("ended", () => { setPlaying(); store.set(`reader.pos.${n}`, 0); });
  audio.addEventListener("seeked", tick);
  let lastSave = 0;
  audio.addEventListener("timeupdate", () => { if (Date.now() - lastSave > 5000) { lastSave = Date.now(); savePos(); } });
  playBtn.onclick = toggleplay;
  document.getElementById("back").onclick = () => jump(-10);
  document.getElementById("fwd").onclick = () => jump(10);
  seek.oninput = () => { seeking = true; now.textContent = fmtClock(seek.value * 1000); };
  seek.onchange = () => { seeking = false; audio.currentTime = +seek.value; tick(); };
  document.getElementById("rate").onchange = e => { prefs.rate = +e.target.value; save(); apply(); };
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: `Chapter ${n}: ${c.title}`, artist: "CCNP SCOR study notes", album: "Listen and read" });
    const h = { play, pause: () => audio.pause(), seekbackward: () => jump(-10), seekforward: () => jump(10) };
    for (const k in h) try { navigator.mediaSession.setActionHandler(k, h[k]); } catch (e) { /* unsupported action */ }
  }
  const resumeAt = store.get(`reader.pos.${n}`, 0);
  if (resumeAt > 5) {
    audio.currentTime = resumeAt; seek.value = resumeAt; now.textContent = fmtClock(resumeAt * 1000);
    highlight(wordAt(resumeAt), false);
    requestAnimationFrame(() => els[Math.max(cur, 0)].scrollIntoView({ block: "center" }));
  }
  const onScroll = () => placeFocus();
  const onUser = () => { userScrolled = Date.now(); };
  addEventListener("scroll", onScroll, { passive: true }); addEventListener("resize", onScroll);
  addEventListener("wheel", onUser, { passive: true }); addEventListener("touchmove", onUser, { passive: true });
  onLeave(() => {
    savePos(); audio.pause(); cancelAnimationFrame(raf); cancelPractice();
    removeEventListener("scroll", onScroll); removeEventListener("resize", onScroll);
    removeEventListener("wheel", onUser); removeEventListener("touchmove", onUser);
    if ("mediaSession" in navigator) navigator.mediaSession.metadata = null;
  });
  onKey(e => {
    if (e.key === " " || e.key === "k") { e.preventDefault(); toggleplay(); }
    else if (e.key === "ArrowLeft" || e.key === "j") jump(-10);
    else if (e.key === "ArrowRight" || e.key === "l") jump(10);
    else if (e.key === "Escape") closeAll();
  });
  function closeAll() { pop.hidden = true; panel.hidden = true; app.querySelectorAll(".reader-tab").forEach(t => t.setAttribute("aria-selected", "false")); }
  // The page-level key handler skips keys typed on buttons and inputs, so the popups close on Escape themselves.
  [pop, panel].forEach(el => el.addEventListener("keydown", e => { if (e.key === "Escape") { e.stopPropagation(); closeAll(); page.focus?.(); } }));

  // ---------- words: dictionary, by-word translation, read from here ----------
  const cardFor = word => {
    const k = norm(word); if (!k) return null;
    return (flashcards[n] || []).find(x => { const f = x.front.replace(/\s*\(.*\)\s*$/, ""); return norm(f) === k || norm(x.front.split(/[\s(]/)[0]) === k && /^[A-Z0-9-]+$/.test(word.replace(/\W+$/, "")); });
  };
  async function showWord(i) {
    const w = words[i], bare = w.w.replace(/^\W+|\W+$/g, "");
    const card = cardFor(bare);
    pop.innerHTML = `<div class="row"><strong class="pop-word">${esc(w.s ? w.s.replace(/^\W+|\W+$/g, "") : bare)}</strong>${w.p ? `<span class="pos-key p-${w.p}">${POS[w.p][0].slice(0, -1).toLowerCase()}</span>` : ""}<span class="spacer"></span><button class="icon-btn close" type="button" aria-label="Close">×</button></div>
      ${card ? `<p class="pop-card"><span class="badge">Chapter ${n} flashcard</span><b>${esc(card.front)}</b><br>${esc(card.back)}</p>` : ""}
      <p class="pop-def muted small" id="pop-def">${card ? "" : "Looking up…"}</p>
      <p class="pop-tr small" id="pop-tr" hidden></p>
      <div class="row"><button class="btn" type="button" id="pop-hear">Hear it</button><button class="btn primary" type="button" id="pop-read">Read from here</button></div>`;
    pop.hidden = false;
    const r = els[i].getBoundingClientRect(), pw = Math.min(360, innerWidth - 24);
    pop.style.width = pw + "px";
    pop.style.left = Math.min(Math.max(12, r.left), innerWidth - pw - 12) + "px";
    pop.style.top = (r.bottom + 8 + pop.offsetHeight > innerHeight - 80 ? Math.max(12, r.top - pop.offsetHeight - 8) : r.bottom + 8) + "px";
    pop.querySelector(".close").onclick = () => { pop.hidden = true; els[i].focus(); };
    pop.querySelector("#pop-read").onclick = () => { pop.hidden = true; goWord(i); play(); };
    pop.querySelector("#pop-hear").onclick = () => playSpan(i, i);
    pop.querySelector("#pop-read").focus();
    if (prefs.byWord && prefs.lang) getTranslator().then(async tr => { if (!tr) return; const out = await tr.translate(bare).catch(() => ""); const el = pop.querySelector("#pop-tr"); if (el && out) { el.hidden = false; el.innerHTML = `<b>${esc(LANGS[prefs.lang])}:</b> <span lang="${prefs.lang}">${esc(out)}</span>`; } });
    if (!card) {
      const def = pop.querySelector("#pop-def");
      try {
        const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(bare.toLowerCase())}`);
        const j = res.ok ? await res.json() : null, m = j && j[0]?.meanings?.[0];
        if (def.isConnected) def.textContent = m ? `${m.partOfSpeech}: ${m.definitions[0].definition}` : "No dictionary entry for this word.";
      } catch (e) { if (def.isConnected) def.textContent = "The dictionary needs an internet connection."; }
    }
  }
  // Plays words a..b only, for "Hear it".
  let stopAt = null;
  function playSpan(a, b) {
    stopAt = b + 1 < times.length ? times[b + 1] : data.duration;
    audio.currentTime = Math.max(0, times[a] - 0.05); play();
    const check = () => { if (stopAt === null) return; if (audio.currentTime >= stopAt) { audio.pause(); stopAt = null; } else requestAnimationFrame(check); };
    requestAnimationFrame(check);
  }
  playBtn.addEventListener("click", () => { stopAt = null; }, true);
  page.addEventListener("click", e => {
    const w = e.target.closest(".w"); if (!w) return;
    const i = +w.dataset.i;
    if (prefs.dict || (prefs.byWord && prefs.lang)) showWord(i); else { goWord(i); play(); }
  });
  els.forEach(el => { el.tabIndex = -1; });
  document.addEventListener("click", function outside(e) {
    if (!app.contains(pop)) return document.removeEventListener("click", outside);
    if (!pop.hidden && !pop.contains(e.target) && !e.target.closest(".w")) pop.hidden = true;
  });

  // ---------- reading practice ----------
  let recog = null;
  const cancelPractice = () => { if (!recog) return; recog.onend = recog.onerror = null; recog.abort(); recog = null; };
  const practice = document.getElementById("practice");
  document.getElementById("practice-btn").onclick = () => startPractice(cur >= 0 ? lineOf[cur] : 0);
  function startPractice(li) {
    audio.pause(); pop.hidden = true;
    let line = li;
    const range = () => { const first = lineOf.indexOf(line); return [first, first + data.lines[line].w.length - 1]; };
    const render = (state, result) => {
      const [a, b] = range();
      practice.innerHTML = `<div class="row"><strong>Reading practice</strong><span class="spacer"></span><button class="icon-btn close" type="button" aria-label="Close practice">×</button></div>
        <p class="practice-line">${words.slice(a, b + 1).map((w, k) => `<span class="${result ? (result.hit[k] ? "hit" : "miss") : ""}">${esc(w.w)}</span>`).join(" ")}</p>
        ${result ? `<p><b>${result.acc}% accurate</b> · ${result.wpm} words a minute</p>${result.missed.length ? `<p class="small">Practice these words:</p><div class="row">${result.missed.map(k => `<button class="chip" type="button" data-hear="${a + k}">${esc(words[a + k].w.replace(/^\W+|\W+$/g, ""))}</button>`).join("")}</div>` : `<p class="small">Every word recognized. Nice reading.</p>`}` : ""}
        <p class="small muted" role="status">${state === "listening" ? "Listening. Read the line aloud, then press Stop." : state === "error" ? "The microphone didn't start. Check that this site may use it." : result ? "" : "Press Start and read the highlighted line aloud."}</p>
        <div class="row"><button class="btn" type="button" id="pr-prev" ${line ? "" : "disabled"}>← Line</button><button class="btn" type="button" id="pr-next" ${line < data.lines.length - 1 ? "" : "disabled"}>Line →</button><span class="spacer"></span>
        <button class="btn" type="button" id="pr-hear">Hear it</button><button class="btn primary" type="button" id="pr-go">${state === "listening" ? "Stop" : result ? "Try again" : "Start"}</button></div>`;
      practice.hidden = false;
      lineEls.forEach((el, k) => el.classList.toggle("practicing", k === line));
      lineEls[line].scrollIntoView({ block: "center", behavior: "smooth" });
      practice.querySelector(".close").onclick = () => { cancelPractice(); practice.hidden = true; lineEls.forEach(el => el.classList.remove("practicing")); };
      practice.querySelector("#pr-prev").onclick = () => { cancelPractice(); line--; render(); };
      practice.querySelector("#pr-next").onclick = () => { cancelPractice(); line++; render(); };
      practice.querySelector("#pr-hear").onclick = () => playSpan(a, b);
      practice.querySelectorAll("[data-hear]").forEach(x => x.onclick = () => playSpan(+x.dataset.hear, +x.dataset.hear));
      practice.querySelector("#pr-go").onclick = () => state === "listening" ? recog?.stop() : listen();
      practice.querySelector("#pr-go").focus();
    };
    function listen() {
      const [a, b] = range();
      recog = new Recognition(); recog.lang = "en-US"; recog.continuous = true; recog.interimResults = false;
      let heard = "", began = 0, failed = false;
      recog.onstart = () => { began = Date.now(); render("listening"); };
      recog.onresult = e => { heard = [...e.results].map(r => r[0].transcript).join(" "); };
      recog.onerror = e => { if (e.error !== "aborted" && e.error !== "no-speech") { failed = true; render("error"); } };
      recog.onend = () => {
        recog = null;
        if (!began || failed) return;
        const secs = Math.max(1, (Date.now() - began) / 1000);
        render("done", score(words.slice(a, b + 1).map(w => w.w), heard, secs));
      };
      try { recog.start(); } catch (e) { render("error"); }
    }
    render();
  }
  function score(expected, heard, secs) {
    const said = heard.split(/\s+/).map(norm).filter(Boolean);
    const want = expected.map(norm);
    let j = 0;
    const hit = want.map(w => {
      if (!w) return true;
      for (let k = j; k < Math.min(said.length, j + 4); k++) {
        // Acronyms are often recognized as separate letters, so join up to four spoken tokens.
        let joined = "";
        for (let m = k; m < Math.min(said.length, k + 4); m++) { joined += said[m]; if (joined === w || said[m] === w) { j = m + 1; return true; } }
      }
      return false;
    });
    const right = hit.filter(Boolean).length;
    return { hit, acc: Math.round(right / hit.length * 100), wpm: Math.round(said.length / secs * 60), missed: hit.map((h, k) => h ? -1 : k).filter(k => k >= 0) };
  }

  apply();
  if (prefs.doc) translateDoc();
}

export { readerView, readerListView, readerIndex };
