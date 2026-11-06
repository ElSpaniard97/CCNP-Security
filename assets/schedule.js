// Weekly study schedule: a repeating week of study blocks (day, time, length, activity, chapter).
// A block set to "Focus chapter" follows the roadmap, which spreads the 11 chapters over the weeks
// between the start date and the exam date (one chapter a week when there is no exam date), with
// the last week or two kept for review. Today's blocks link straight to the activity and can be
// checked off. The plan is saved in scor.schedule and check-offs in scor.schedule.done.
import { app, setCrumbs, onLeave, getJSON, store, syncSoon, esc, plural, chapters, chap, PASS } from "./runtime.js";
import { icon } from "./visuals.js";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SHORT = DAYS.map(d => d.slice(0, 3));
const DAY_MS = 864e5;
const ACTS = {
  read:   { label: "Listen and read",   icon: "headphones" },
  notes:  { label: "Review notes",      icon: "book" },
  cards:  { label: "Flashcards",        icon: "cards" },
  test:   { label: "Practice test",     icon: "test" },
  labs:   { label: "Lab",               icon: "terminal" },
  srs:    { label: "Spaced repetition", icon: "repeat" },
  bank:   { label: "Missed questions",  icon: "alert" },
  exam:   { label: "Mock exam",         icon: "target" },
  custom: { label: "Other",             icon: "clock" },
};
const NO_CHAPTER = new Set(["exam", "custom"]);

// ---------- dates (local time, as YYYY-MM-DD strings) ----------
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const dayIdx = d => (d.getDay() + 6) % 7;
const monday = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - dayIdx(x)); return x; };
const addDays = (d, k) => { const x = new Date(d); x.setDate(x.getDate() + k); return x; };
const weeksBetween = (a, b) => Math.round((monday(b) - monday(a)) / (7 * DAY_MS));
const fmtDay = d => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
const toMin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const fromMin = m => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
const fmtTime = t => { const [h, m] = t.split(":").map(Number); return `${(h % 12) || 12}:${pad(m)} ${h < 12 ? "AM" : "PM"}`; };
const fmtMins = m => m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
const newId = () => Math.random().toString(36).slice(2, 10);

// ---------- the plan ----------
const SPLIT_MIN = 20;
// Builds a week from the chosen days, times and activities. Each study day's session is shared
// evenly by the chosen activities, back to back. If a session is too short to share, the days take
// turns instead, one activity a day.
function buildWeek({ days, wdTime, wdMins, weTime, weMins, acts }) {
  const blocks = [], list = acts && acts.length ? acts : ["read", "cards", "test"];
  let turn = 0;
  [...days].sort((a, b) => a - b).forEach(day => {
    const start = day < 5 ? wdTime : weTime, mins = day < 5 ? wdMins : weMins;
    const today = mins / list.length >= SPLIT_MIN ? list : [list[turn++ % list.length]];
    const each = Math.floor(mins / today.length / 5) * 5;
    let at = toMin(start);
    today.forEach((act, i) => {
      const len = i === today.length - 1 ? mins - each * (today.length - 1) : each;
      blocks.push({ id: newId(), day, start: fromMin(at), mins: len, act, ch: act === "srs" || act === "bank" ? 0 : "focus", note: "" });
      at += len;
    });
  });
  return blocks;
}
// Zeke's answers (Nov 2026): Monday to Friday, about 4 hours a day, exam on Feb 22, 2027,
// focused on Listen and read, flashcards and practice tests.
const STARTER = { days: [0, 1, 2, 3, 4], wdTime: "18:00", wdMins: 240, weTime: "09:00", weMins: 120, acts: ["read", "cards", "test"], exam: "2027-02-22" };
const BUILDER_ACTS = ["read", "cards", "test", "labs", "srs", "bank", "notes", "exam"];
function loadPlan() {
  const saved = store.get("schedule", null);
  if (saved && Array.isArray(saved.blocks)) return saved;
  return { at: 0, start: ymd(monday(new Date())), exam: STARTER.exam, blocks: buildWeek(STARTER) };
}
let plan = null, weekOffset = 0, undo = null;
// The builder shows the choices it was last used with.
const prefs = () => Object.assign({}, STARTER, plan.prefs || {});
function save() { plan.at = Date.now(); store.set("schedule", plan); syncSoon(); }
const doneMap = () => store.get("schedule.done", {});
const doneKey = (date, b) => `${ymd(date)}|${b.id}`;
function setDone(date, b, on) {
  const d = doneMap(), k = doneKey(date, b);
  if (on) d[k] = Date.now(); else delete d[k];
  store.set("schedule.done", d); syncSoon();
}
const sortBlocks = list => list.slice().sort((a, b) => a.day - b.day || toMin(a.start) - toMin(b.start));

// ---------- roadmap ----------
// Returns the chapters to focus on in the week that contains date (empty means review week).
function roadmap() {
  const start = parse(plan.start), n = chapters.length;
  if (!plan.exam || parse(plan.exam) < start) return { weeks: n + 1, review: 1, chapterWeeks: n, start };
  const total = weeksBetween(start, parse(plan.exam)) + 1;
  let review = total >= 16 ? 3 : total >= 8 ? 2 : total >= 4 ? 1 : 0;
  return { weeks: total, review, chapterWeeks: total - review, start };
}
function focusRange(date) {
  const r = roadmap(), n = chapters.length, w = Math.max(0, weeksBetween(r.start, date));
  if (w >= r.chapterWeeks) return [];
  const a = Math.floor(w * n / r.chapterWeeks) + 1, b = Math.max(a, Math.floor((w + 1) * n / r.chapterWeeks));
  return chapters.filter(c => c.n >= a && c.n <= b).map(c => c.n);
}
// When a week covers more than one chapter, earlier days take the earlier chapter.
function focusFor(date) {
  const range = focusRange(date);
  return range.length ? range[Math.min(range.length - 1, Math.floor(dayIdx(date) * range.length / 7))] : 0;
}
const chapterFor = (b, date) => NO_CHAPTER.has(b.act) ? 0 : b.ch === "focus" ? focusFor(date) : +b.ch || 0;
const rangeLabel = r => !r.length ? "Review all chapters" : r.length === 1 ? `Chapter ${r[0]}: ${chap(r[0])?.title || ""}` : `Chapters ${r[0]} to ${r[r.length - 1]}`;

// ---------- where a block's Start button goes ----------
let labList = [];
function nextTest(n) {
  const best = t => store.get(`best.${n}.${t}`, null), ts = [1, 2, 3, 4, 5];
  const t = ts.find(t => best(t) === null) || ts.filter(t => best(t) < PASS).sort((a, b) => best(a) - best(b))[0] || 1;
  return `#/ch/${n}/test/${t}`;
}
function labFor(n) {
  const runs = store.get("labs", {}), mine = labList.filter(l => !n || l.chapter === n);
  const next = mine.find(l => !runs[l.id]?.runs?.length) || mine[0];
  return next ? `#/labs/${next.id}` : "#/labs";
}
function hrefFor(b, n) {
  switch (b.act) {
    case "read": return n ? `#/ch/${n}/read` : "#/read";
    case "notes": return n ? `#/ch/${n}` : "#/chapters";
    case "cards": return n ? `#/ch/${n}/cards` : "#/study";
    case "test": return n ? nextTest(n) : "#/practice";
    case "labs": return labFor(n);
    case "srs": return n ? `#/srs/${n}` : "#/srs";
    case "bank": return n ? `#/bank/${n}` : "#/bank";
    case "exam": return "#/exam";
    default: return null;
  }
}
const blockTitle = b => b.act === "custom" ? (b.note || "Study block") : ACTS[b.act].label;
const chapterText = (b, n) => NO_CHAPTER.has(b.act) ? "" : n ? `Ch ${n}` : "All chapters";

// ---------- views ----------
function blockRow(b, date, today) {
  const n = chapterFor(b, date), href = hrefFor(b, n), done = !!doneMap()[doneKey(date, b)];
  const end = fromMin(toMin(b.start) + b.mins);
  return `<li class="sched-item${done ? " done" : ""}" data-block="${esc(b.id)}">
    <label class="sched-check"><input type="checkbox" data-done="${esc(b.id)}"${done ? " checked" : ""} aria-label="Mark ${esc(blockTitle(b))} done"></label>
    <span class="sched-icon">${icon(ACTS[b.act].icon)}</span>
    <span class="sched-text"><b>${esc(blockTitle(b))}${chapterText(b, n) ? ` · ${esc(chapterText(b, n))}` : ""}</b>
      <small>${fmtTime(b.start)} to ${fmtTime(end)} · ${fmtMins(b.mins)}${n ? ` · ${esc(chap(n)?.title || "")}` : ""}${b.note && b.act !== "custom" ? ` · ${esc(b.note)}` : ""}</small></span>
    ${today && href ? `<a class="btn small-btn" href="${esc(href)}">Start ${icon("arrow")}</a>` : ""}
  </li>`;
}
function todayHTML() {
  const now = new Date(), list = sortBlocks(plan.blocks.filter(b => b.day === dayIdx(now)));
  const left = list.filter(b => !doneMap()[doneKey(now, b)]).length;
  return `<section class="card sched-today" aria-labelledby="today-h">
    <div class="sched-head"><h2 id="today-h">Today · ${DAYS[dayIdx(now)]}, ${fmtDay(now)}</h2>
      <span class="badge ${list.length && !left ? "good" : ""}">${!list.length ? "Rest day" : left ? `${plural(left, "block")} to go` : "✓ All done"}</span></div>
    ${list.length ? `<ul class="sched-list">${list.map(b => blockRow(b, now, true)).join("")}</ul>`
      : `<p class="muted">Nothing planned today. Add a block below if you want to study anyway.</p>`}
  </section>`;
}
function weekHTML() {
  const mon = addDays(monday(new Date()), weekOffset * 7), done = doneMap(), todayStr = ymd(new Date());
  const range = focusRange(mon), total = plan.blocks.length;
  const finished = plan.blocks.filter(b => done[doneKey(addDays(mon, b.day), b)]).length;
  const mins = plan.blocks.reduce((s, b) => s + b.mins, 0);
  return `<section class="sched-week" aria-labelledby="week-h">
    <div class="sched-head"><h2 id="week-h">Week of ${fmtDay(mon)}</h2>
      <div class="row"><button class="btn small-btn" type="button" data-week="-1" aria-label="Previous week">‹</button>
      <button class="btn small-btn" type="button" data-week="0"${weekOffset ? "" : " disabled"}>This week</button>
      <button class="btn small-btn" type="button" data-week="1" aria-label="Next week">›</button></div></div>
    <p class="muted small"><b>Focus:</b> ${esc(rangeLabel(range))} · ${finished} of ${plural(total, "block")} done · ${fmtMins(mins)} planned</p>
    <div class="sched-grid">${DAYS.map((d, i) => {
      const date = addDays(mon, i), list = sortBlocks(plan.blocks.filter(b => b.day === i));
      return `<div class="sched-day card${ymd(date) === todayStr ? " is-today" : ""}" data-day="${i}">
        <h3><span>${SHORT[i]}</span> <small>${fmtDay(date)}</small></h3>
        ${list.map(b => {
          const n = chapterFor(b, date), isDone = done[doneKey(date, b)];
          return `<button class="sched-block act-${b.act}${isDone ? " done" : ""}" type="button" data-edit="${esc(b.id)}" aria-label="Edit ${esc(blockTitle(b))} on ${d} at ${fmtTime(b.start)}">
            <span class="sched-time">${fmtTime(b.start)} · ${fmtMins(b.mins)}${isDone ? " ✓" : ""}</span>
            <span class="sched-what">${icon(ACTS[b.act].icon)}${esc(blockTitle(b))}</span>
            ${chapterText(b, n) ? `<span class="sched-ch">${esc(chapterText(b, n))}</span>` : ""}</button>`;
        }).join("")}
        <button class="sched-add" type="button" data-add="${i}">+ Add</button>
      </div>`;
    }).join("")}</div>
  </section>`;
}
function roadmapHTML() {
  const r = roadmap(), thisWeek = Math.max(0, weeksBetween(r.start, new Date())), weeks = [];
  for (let w = 0; w < r.weeks; w++) {
    const mon = addDays(monday(r.start), w * 7);
    weeks.push(`<li class="${w === thisWeek ? "now" : w < thisWeek ? "past" : ""}"><span>Week ${w + 1} · ${fmtDay(mon)}</span><b>${esc(rangeLabel(focusRange(mon)))}</b></li>`);
  }
  const days = plan.exam ? Math.ceil((parse(plan.exam) - parse(ymd(new Date()))) / DAY_MS) : null;
  return `<details class="card sched-plan">
    <summary><b>Dates and chapter roadmap</b> <span class="muted small">${plan.exam ? (days >= 0 ? `${plural(days, "day")} to your exam` : "Exam date has passed") : "No exam date set"}</span></summary>
    <div class="sched-fields">
      <label>Start date<input type="date" id="s-start" value="${esc(plan.start)}"></label>
      <label>Exam date<input type="date" id="s-exam" value="${esc(plan.exam)}"></label>
      ${plan.exam ? `<button class="btn small-btn" type="button" id="s-clear-exam">Clear exam date</button>` : ""}
    </div>
    <p class="muted small">Blocks set to “Focus chapter” follow this roadmap. ${plan.exam ? `The chapters are spread across the weeks before your exam${r.review ? `, with the last ${plural(r.review, "week")} for review and mock exams` : ""}.` : "With no exam date it moves one chapter a week, then a review week."}</p>
    <ol class="sched-roadmap">${weeks.join("")}</ol>
  </details>`;
}
function builderHTML() {
  const p = prefs();
  return `<details class="card sched-builder"${plan.at ? "" : " open"}>
    <summary><b>Build my week</b> <span class="muted small">Pick your days and times and get a balanced week you can then edit</span></summary>
    <fieldset class="sched-days"><legend>Study days</legend>${DAYS.map((d, i) => `<label class="chip"><input type="checkbox" name="b-day" value="${i}"${p.days.includes(i) ? " checked" : ""}> ${SHORT[i]}</label>`).join("")}</fieldset>
    <div class="sched-fields">
      <label>Weekday start<input type="time" id="b-wd-time" value="${p.wdTime}" step="900"></label>
      <label>Weekday minutes<input type="number" id="b-wd-mins" value="${p.wdMins}" min="15" max="480" step="15"></label>
      <label>Weekend start<input type="time" id="b-we-time" value="${p.weTime}" step="900"></label>
      <label>Weekend minutes<input type="number" id="b-we-mins" value="${p.weMins}" min="15" max="480" step="15"></label>
    </div>
    <fieldset class="sched-days"><legend>Focus on (each session is shared by these)</legend>${BUILDER_ACTS.map(k => `<label class="chip"><input type="checkbox" name="b-act" value="${k}"${p.acts.includes(k) ? " checked" : ""}> ${ACTS[k].label}</label>`).join("")}</fieldset>
    <div class="row"><button class="btn primary" type="button" id="b-go">${plan.at ? "Replace my week" : "Build my week"}</button><span class="muted small" id="b-msg" role="status"></span></div>
  </details>`;
}
function editorHTML() {
  const chOpts = [`<option value="focus">Focus chapter for the week</option>`, `<option value="0">All chapters</option>`]
    .concat(chapters.map(c => `<option value="${c.n}">Chapter ${c.n}: ${esc(c.title)}</option>`)).join("");
  return `<dialog class="sched-dialog" id="s-dialog" aria-labelledby="s-dialog-h"><form method="dialog" id="s-form">
    <h2 id="s-dialog-h">Study block</h2>
    <div class="sched-fields">
      <label>Day<select id="e-day">${DAYS.map((d, i) => `<option value="${i}">${d}</option>`).join("")}</select></label>
      <label>Start<input type="time" id="e-start" required step="300"></label>
      <label>Minutes<input type="number" id="e-mins" required min="5" max="480" step="5"></label>
      <label>Activity<select id="e-act">${Object.entries(ACTS).map(([k, a]) => `<option value="${k}">${a.label}</option>`).join("")}</select></label>
      <label class="wide" id="e-ch-wrap">Chapter<select id="e-ch">${chOpts}</select></label>
      <label class="wide">Note<input type="text" id="e-note" maxlength="80" placeholder="Optional, e.g. chapter 5 Do I Know This Already quiz"></label>
    </div>
    <div class="row"><button class="btn primary" type="submit" value="save">Save</button><button class="btn" type="submit" value="cancel" formnovalidate>Cancel</button><span class="spacer"></span><button class="btn danger" type="button" id="e-del">Delete</button></div>
  </form></dialog>`;
}

async function scheduleView() {
  setCrumbs([{ label: "Home", href: "#/" }, { label: "Study schedule" }]);
  document.title = "Study schedule";
  plan = loadPlan();
  labList = await getJSON("data/labs/index.json").catch(() => []);
  render();
  onLeave(() => document.getElementById("s-dialog")?.close());
}
function render() {
  app.innerHTML = `<div class="page-heading"><p class="eyebrow">PLAN YOUR WEEK</p><h1>Study schedule</h1>
    <p class="muted">Your repeating study week. Each block has a time, a length, an activity and a chapter. Tap a block to change it, check blocks off as you finish them, and use Start to jump straight in.</p></div>
    ${plan.at ? "" : `<p class="card sched-note">This is your starter week: Monday to Friday, 6 to 10 PM, split between Listen and read, flashcards and a practice test, working toward your exam on February 22, 2027. Use <b>Build my week</b> to fit it to your days, or edit any block. Nothing is saved until you change something.</p>`}
    ${todayHTML()}${weekHTML()}
    <div class="row sched-actions"><button class="btn" type="button" id="s-ics">${icon("arrow")}Add to my calendar (.ics)</button>${undo ? `<button class="btn" type="button" id="s-undo">Undo rebuild</button>` : ""}</div>
    ${roadmapHTML()}${builderHTML()}${editorHTML()}`;
  wire();
}
function wire() {
  app.querySelectorAll("[data-done]").forEach(el => el.onchange = () => {
    const b = plan.blocks.find(x => x.id === el.dataset.done);
    if (!plan.at) save(); // checking off a starter block keeps the starter week
    setDone(new Date(), b, el.checked); render();
    document.querySelector(`[data-done="${CSS.escape(b.id)}"]`)?.focus();
  });
  app.querySelectorAll("[data-week]").forEach(el => el.onclick = () => { const d = +el.dataset.week; weekOffset = d ? weekOffset + d : 0; render(); document.querySelector(`[data-week="${d}"]`)?.focus(); });
  app.querySelectorAll("[data-edit]").forEach(el => el.onclick = () => openEditor(plan.blocks.find(b => b.id === el.dataset.edit)));
  app.querySelectorAll("[data-add]").forEach(el => el.onclick = () => openEditor(null, +el.dataset.add));
  const start = document.getElementById("s-start"), exam = document.getElementById("s-exam");
  start.onchange = () => { if (start.value) { plan.start = start.value; save(); render(); app.querySelector(".sched-plan").open = true; } };
  exam.onchange = () => { plan.exam = exam.value || ""; save(); render(); app.querySelector(".sched-plan").open = true; };
  const clr = document.getElementById("s-clear-exam");
  if (clr) clr.onclick = () => { plan.exam = ""; save(); render(); app.querySelector(".sched-plan").open = true; };
  document.getElementById("b-go").onclick = () => {
    const days = [...app.querySelectorAll('[name="b-day"]:checked')].map(x => +x.value);
    const msg = document.getElementById("b-msg");
    const acts = [...app.querySelectorAll('[name="b-act"]:checked')].map(x => x.value);
    if (!days.length) { msg.textContent = "Pick at least one day."; return; }
    if (!acts.length) { msg.textContent = "Pick at least one activity."; return; }
    const num = id => Math.min(480, Math.max(15, Math.round((+document.getElementById(id).value || 60) / 5) * 5));
    undo = plan.at ? plan.blocks : null;
    plan.prefs = { days, wdTime: document.getElementById("b-wd-time").value || "18:00", wdMins: num("b-wd-mins"), weTime: document.getElementById("b-we-time").value || "09:00", weMins: num("b-we-mins"), acts };
    plan.blocks = buildWeek(plan.prefs);
    save(); render();
    document.getElementById("b-msg").textContent = `Built ${plural(plan.blocks.length, "block")}. Tap any block to change it.`;
    app.querySelector(".sched-builder").open = true;
  };
  const u = document.getElementById("s-undo");
  if (u) u.onclick = () => { plan.blocks = undo; undo = null; save(); render(); };
  document.getElementById("s-ics").onclick = downloadICS;
}
function openEditor(b, day) {
  const dlg = document.getElementById("s-dialog"), f = id => document.getElementById(id);
  const isNew = !b, cur = b || { day, start: "19:00", mins: 60, act: "cards", ch: "focus", note: "" };
  f("s-dialog-h").textContent = isNew ? `Add a block on ${DAYS[cur.day]}` : "Edit study block";
  f("e-day").value = cur.day; f("e-start").value = cur.start; f("e-mins").value = cur.mins;
  f("e-act").value = cur.act; f("e-ch").value = String(cur.ch); f("e-note").value = cur.note || "";
  f("e-del").hidden = isNew;
  const syncCh = () => { f("e-ch-wrap").hidden = NO_CHAPTER.has(f("e-act").value); f("e-note").placeholder = f("e-act").value === "custom" ? "What you'll do, e.g. Watch a VPN video" : "Optional note"; };
  f("e-act").onchange = syncCh; syncCh();
  f("e-del").onclick = () => { plan.blocks = plan.blocks.filter(x => x !== b); dlg.close(); save(); render(); };
  f("s-form").onsubmit = e => {
    if (e.submitter?.value !== "save") return;
    const next = { id: cur.id || newId(), day: +f("e-day").value, start: f("e-start").value, mins: Math.min(480, Math.max(5, Math.round(+f("e-mins").value) || 60)),
      act: f("e-act").value, ch: f("e-ch").value === "focus" ? "focus" : +f("e-ch").value, note: f("e-note").value.trim().slice(0, 80) };
    plan.blocks = isNew ? plan.blocks.concat(next) : plan.blocks.map(x => x === b ? next : x);
    save(); setTimeout(render);
  };
  dlg.showModal();
}

// ---------- calendar export ----------
function downloadICS() {
  const icsEsc = s => String(s).replace(/[\\;,]/g, m => "\\" + m).replace(/\n/g, "\\n");
  const stamp = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const utc = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const from = new Date(Math.max(parse(plan.start), parse(ymd(new Date())))), site = location.href.split("#")[0] + "#/schedule";
  const until = plan.exam ? `UNTIL=${plan.exam.replace(/-/g, "")}T235959` : "COUNT=12";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SCOR Study//Study schedule//EN", "CALSCALE:GREGORIAN"];
  plan.blocks.forEach(b => {
    const first = addDays(from, (b.day - dayIdx(from) + 7) % 7), [h, m] = b.start.split(":").map(Number);
    first.setHours(h, m, 0, 0);
    const ch = NO_CHAPTER.has(b.act) ? "" : b.ch === "focus" ? " (focus chapter)" : +b.ch ? ` (Ch ${b.ch})` : " (all chapters)";
    lines.push("BEGIN:VEVENT", `UID:${b.id}@scor-study`, `DTSTAMP:${utc}`, `DTSTART:${stamp(first)}`, `DURATION:PT${b.mins}M`, `RRULE:FREQ=WEEKLY;${until}`,
      `SUMMARY:${icsEsc(`SCOR: ${blockTitle(b)}${ch}`)}`, `DESCRIPTION:${icsEsc(`${b.note ? b.note + "\n" : ""}Open your plan: ${site}`)}`, "END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  const url = URL.createObjectURL(new Blob([lines.join("\r\n") + "\r\n"], { type: "text/calendar" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "scor-study-schedule.ics" });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export { scheduleView, buildWeek };
