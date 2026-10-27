import { store, LOCAL_ONLY, snapshot, restore, merge } from "./store.js";
import { syncConnect, syncNow, syncSoon } from "./sync.js";
import { esc, cap, rich, shuffle, plural, pctOf, level, secName, fmtDate, fmtDur, fmtClock, fmtAgo, dayKey, testTitle } from "./ui.js";
import { srsKey, srsSet, srsMiss, srsDue, isStarred, toggleStar, starredList } from "./srs.js";
import { domainFor, selectExam } from "./blueprint.js";

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
  const chap = n => chapters.find(c => c.n === n);
  let blueprint;
  let flashcards = {};
  const testCache = {};
  let keyHandler = null;
  let leaveFns = [];

  // ---------- storage ----------
  // ---------- helpers ----------
  function setCrumbs(parts) {
    crumbs.innerHTML = parts.map(p => p.href ? `<a href="${p.href}">${esc(p.label)}</a>` : esc(p.label)).join(" › ");
  }
  function onKey(fn) { keyHandler = fn; }
  function onLeave(fn) { leaveFns.push(fn); }
  document.addEventListener("keydown", e => {
    if (!keyHandler || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest("input, textarea, select, button, a")) return;
    keyHandler(e);
  });
  addEventListener("pagehide", () => leaveFns.forEach(f => f()));

  async function getJSON(path) {
    const r = await fetch(path, { cache: "no-cache" });
    if (!r.ok) throw new Error(path + " " + r.status);
    return r.json();
  }
  async function loadCards(n) {
    if (!flashcards[n]) flashcards[n] = await getJSON(`data/flashcards/ch${String(n).padStart(2,"0")}.json`);
    return flashcards[n];
  }
  const loadAllCards = () => Promise.all(chapters.map(c=>loadCards(c.n)));
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


  function setExamActive(active) {
    document.body.classList.toggle("exam-active", active);
    if (!active) document.getElementById("timer-announcement").textContent="";
  }

// Router callbacks are installed before data loading; views need no imports from main.
const navigation = {};
function leaveView() { onKey(null); leaveFns.forEach(f=>f()); leaveFns=[]; }
function setNavigation(callbacks) { Object.assign(navigation, callbacks); }
function home(...args) { return navigation.home(...args); }
function chapterView(...args) { return navigation.chapterView(...args); }
function route(...args) { return navigation.route(...args); }
function setStudyData(c, b) { chapters = c; blueprint = b; }

export { leaveView, app, crumbs, DECKS, DECK_LABEL, LETTERS, PASS, DAY, SRS_DAYS, SRS_NEW, BANK_CLEAR, EXAM_SECS_PER_Q, chapters, chap, blueprint, flashcards, testCache, keyHandler, leaveFns, setCrumbs, onKey, onLeave, getJSON, loadCards, loadAllCards, getTests, question, findCard, attempts, addAttempt, fullAttempts, examAttempts, bests, latestByTest, streak, bestBadge, getResume, clearResume, unfinished, resumeHref, bankRecord, bankActive, studyCards, cardChips, meter, resumeBanner, setExamActive, store, LOCAL_ONLY, snapshot, restore, merge, syncConnect, syncNow, syncSoon, esc, cap, rich, shuffle, plural, pctOf, level, secName, fmtDate, fmtDur, fmtClock, fmtAgo, dayKey, testTitle, srsKey, srsSet, srsMiss, srsDue, isStarred, toggleStar, starredList, domainFor, selectExam, setNavigation, home, chapterView, route, setStudyData };
