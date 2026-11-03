// Guided labs: each lab is a scenario worked through step by step. A step unlocks only when the one
// before it is done. Steps are typed into a simulated device prompt, set on a mock product screen,
// put in order, or answered as a choice. Wrong tries, hints and reveals lower the score.
import { app, setCrumbs, onLeave, getJSON, store, syncSoon, esc, rich, shuffle, plural, fmtClock, fmtDur, fmtAgo, untilChoice } from "./runtime.js";
import { icon } from "./visuals.js";

// Lab text supports **bold** and `code`.
const rt = s => rich(s).replace(/`([^`]+)`/g, "<code>$1</code>");
const WRONG = 4, WRONG_CAP = 12, HINT = 5, REVEAL = 15, HINT_AFTER = 2, REVEAL_AFTER = 4;
const MAX_RUNS = 20;

let index = null;
function labIndex() {
  if (!index) index = getJSON("data/labs/index.json").catch(e => { index = null; throw e; });
  return index;
}
const labRuns = id => (store.get("labs", {})[id]?.runs) || [];
// A saved place older than the latest finished run is left over from another device's sync.
function labPos(id) {
  const pos = store.get(`lab.pos.${id}`, null), runs = labRuns(id);
  if (pos && runs.length && runs[runs.length - 1].at >= pos.at) { store.del(`lab.pos.${id}`); return null; }
  return pos;
}
const avgMs = runs => runs.length ? runs.reduce((s, r) => s + r.ms, 0) / runs.length : 0;

// ---------- command matching ----------
// IOS accepts any unambiguous start of a keyword ("conf t", "sh run"). The lab can't know every
// keyword a real device has, so it accepts two or more letters of a keyword, plus the single-letter
// forms people really use. Values (addresses, names, keys) must be typed in full; interface names
// accept their usual short forms (g0/1, gi0/1, Gig0/1).
const ONE_LETTER = { terminal: "t" };
const IFACE = /^(gigabitethernet|fastethernet|tengigabitethernet|ethernet|loopback|tunnel|vlan|port-channel|management|serial)([\d/.:]+)$/i;
const isKeyword = t => /^[a-z][a-z-]*$/.test(t);
function tokenMatches(user, want) {
  const u = user.toLowerCase(), w = want.toLowerCase();
  if (u === w) return true;
  if (want === "{any}") return true;
  const wi = want.match(IFACE), ui = user.match(/^([a-z-]+)([\d/.:]+)$/i);
  if (wi) return !!ui && wi[1].toLowerCase().startsWith(ui[1].toLowerCase()) && wi[2] === ui[2];
  if (!isKeyword(want)) return false;
  return (u.length >= 2 && w.startsWith(u)) || ONE_LETTER[w] === u;
}
// After "interface", the name may be typed with a space before the number: "interface g 0/1".
function tokens(s) {
  const t = s.trim().split(/\s+/).filter(Boolean), out = [];
  for (let i = 0; i < t.length; i++) {
    const prev = (out[out.length - 1] || "").toLowerCase();
    if (prev.length >= 2 && "interface".startsWith(prev) && /^[a-z-]+$/i.test(t[i]) && /^\d/.test(t[i + 1] || "")) { out.push(t[i] + t[i + 1]); i++; }
    else out.push(t[i]);
  }
  return out;
}
function commandMatches(typed, canonical) {
  const u = tokens(typed), w = canonical.trim().split(/\s+/);
  if (w[w.length - 1] === "{rest}") return u.length >= w.length - 1 && w.slice(0, -1).every((t, i) => tokenMatches(u[i], t));
  return u.length === w.length && w.every((t, i) => tokenMatches(u[i], t));
}
const forms = c => [c.cmd].concat(c.alt || []);

// ---------- device prompt ----------
// A device keeps its mode stack across steps. Modes: exec (R1>), priv (R1#), config (R1(config)#)
// and any configuration sub-mode named by the command that enters it, e.g. config-if.
function prompt(dev) {
  const m = dev.modes[dev.modes.length - 1];
  return m === "exec" ? `${dev.host}>` : m === "priv" ? `${dev.host}#` : `${dev.host}(${m})#`;
}
function builtin(dev, typed) {
  const m = dev.modes[dev.modes.length - 1];
  const is = c => commandMatches(typed, c);
  if (m === "exec" && is("enable")) { dev.modes.push("priv"); return true; }
  if (m === "priv" && is("disable")) { dev.modes.pop(); return true; }
  if (m === "priv" && is("configure terminal")) { dev.modes.push("config"); return true; }
  if (m !== "exec" && m !== "priv" && is("end")) { dev.modes = dev.modes.slice(0, dev.modes.indexOf("priv") + 1); return true; }
  if (is("exit")) { if (dev.modes.length > 1) dev.modes.pop(); return true; }
  return false;
}
const MODE_NAME = { exec: "user EXEC mode (the > prompt)", priv: "privileged EXEC mode (the # prompt)", config: "global configuration mode" };
const modeName = m => MODE_NAME[m] || `${m} mode`;

// ---------- views ----------
async function labsView() {
  setCrumbs([{ label: "Home", href: "#/" }, { label: "Labs" }]);
  document.title = "Labs";
  const list = await labIndex(), all = store.get("labs", {});
  const domains = [...new Set(list.map(l => l.domain))];
  const done = list.filter(l => all[l.id]?.runs?.length).length;
  app.innerHTML = `<div class="page-heading"><p class="eyebrow">HANDS-ON PRACTICE</p><h1>Labs</h1>
    <p class="muted">Guided labs that walk you through configuring SCOR technologies. Each step unlocks when the one before it is done. Wrong tries, hints and revealed answers lower your score, and your time is compared with the target and with your own average.</p>
    <p class="small muted">${done} of ${list.length} labs completed. Work through them in the suggested order, or open any lab.</p></div>
    <div class="chips" role="group" aria-label="Show labs for">${["All"].concat(domains).map((d, k) => `<button class="chip" type="button" data-domain="${esc(d)}" aria-pressed="${!k}">${esc(d)}</button>`).join("")}</div>
    <div class="lab-grid">${list.map(labTile).join("")}</div>`;
  app.querySelectorAll("[data-domain]").forEach(b => b.onclick = () => {
    app.querySelectorAll("[data-domain]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    app.querySelectorAll(".lab-tile").forEach(t => { t.hidden = b.dataset.domain !== "All" && t.dataset.domain !== b.dataset.domain; });
  });
}
function labTile(l) {
  const runs = labRuns(l.id), best = runs.length ? Math.max(...runs.map(r => r.score)) : null, pos = labPos(l.id);
  return `<div class="card lab-tile" data-lab="${esc(l.id)}" data-domain="${esc(l.domain)}">
    <a class="tile-link" href="#/labs/${esc(l.id)}"><span class="lab-num">${l.n}</span><strong>${esc(l.title)}</strong></a>
    <span class="lab-domain small">${esc(l.domain)}</span>
    <span class="muted small">${esc(l.summary)}</span>
    <span class="small lab-meta">${icon("clock")}${l.minutes} min target · ${plural(l.steps, "step")} · ${esc(l.level)}${l.chapter ? ` · Ch ${l.chapter}` : ""}</span>
    <div class="row">${pos ? `<span class="badge warn">◷ In progress · step ${pos.step + 1}</span>` : best === null ? `<span class="badge">Not started</span>`
      : `<span class="badge ${best >= 80 ? "good" : "warn"}">Best ${best} · avg ${fmtClock(avgMs(runs))}</span>`}</div>
  </div>`;
}

async function labView(id) {
  const list = await labIndex(), meta = list.find(l => l.id === id);
  setCrumbs([{ label: "Home", href: "#/" }, { label: "Labs", href: "#/labs" }, { label: meta ? meta.title : "Lab" }]);
  if (!meta) { app.innerHTML = `<h1>Lab not found</h1><p><a href="#/labs">See all labs</a></p>`; return; }
  document.title = `Lab: ${meta.title}`;
  const lab = await getJSON(`data/labs/${id}.json`);
  let saved = labPos(id);
  if (saved && !(saved.step < lab.steps.length)) { store.del(`lab.pos.${id}`); saved = null; }
  if (saved) {
    app.innerHTML = `<div class="quiz"><h1>${esc(lab.title)}</h1><div class="card resume-list"><p><b>You have this lab in progress.</b> Stopped at step ${saved.step + 1} of ${lab.steps.length}, ${fmtAgo(saved.at)}, with ${fmtClock(saved.ms)} on the clock.</p>
      <div class="row"><button class="btn primary" type="button" id="resume">Resume at step ${saved.step + 1}</button><button class="btn" type="button" id="restart">Start over</button></div></div></div>`;
    const resume = await untilChoice(res => { document.getElementById("resume").onclick = () => res(true); document.getElementById("restart").onclick = () => res(false); });
    if (resume === null) return;
    if (!resume) { store.del(`lab.pos.${id}`); saved = null; }
  }
  runLab(meta, lab, saved);
}

function freshState() { return { step: 0, ms: 0, steps: [], devices: {}, at: Date.now() }; }

function runLab(meta, lab, saved) {
  const st = saved ? Object.assign(freshState(), saved) : freshState();
  const N = lab.steps.length;
  let started = performance.now(), timer = 0, gone = false;
  const elapsed = () => st.ms + (document.hidden ? 0 : performance.now() - started);
  const persist = () => { st.at = Date.now(); store.set(`lab.pos.${lab.id}`, Object.assign({}, st, { ms: Math.round(elapsed()) })); };
  const pauseClock = () => { if (document.hidden) { st.ms += performance.now() - started; } else started = performance.now(); };
  document.addEventListener("visibilitychange", pauseClock);
  onLeave(() => { gone = true; clearInterval(timer); document.removeEventListener("visibilitychange", pauseClock); if (st.step < N) persist(); });

  const runs = labRuns(lab.id), avg = avgMs(runs);
  app.innerHTML = `<div class="lab">
    <div class="lab-head"><div><p class="eyebrow">LAB ${meta.n} · ${esc(meta.domain.toUpperCase())}</p><h1>${esc(lab.title)}</h1></div>
      <div class="lab-clock" role="timer" aria-label="Time on this lab">${icon("clock")}<span id="clock">0:00</span><small class="muted">target ${lab.minutes} min${avg ? ` · your avg ${fmtClock(avg)}` : ""}</small></div></div>
    <details class="card lab-brief" ${st.step ? "" : "open"}><summary><b>Scenario</b></summary>
      <p>${rt(lab.scenario)}</p>
      ${lab.topology ? `<pre class="lab-topo" aria-label="Topology">${esc(lab.topology)}</pre>` : ""}
      ${lab.objectives ? `<p><b>You will:</b></p><ul>${lab.objectives.map(o => `<li>${rt(o)}</li>`).join("")}</ul>` : ""}
    </details>
    <ol class="lab-steps" id="steps"></ol>
  </div>`;
  const stepsEl = document.getElementById("steps"), clock = document.getElementById("clock");
  timer = setInterval(() => { clock.textContent = fmtClock(elapsed()); }, 500);
  clock.textContent = fmtClock(elapsed());

  const stepRec = i => (st.steps[i] = st.steps[i] || { wrong: 0, hint: false, reveal: false, done: [] });
  const device = name => {
    const d = lab.devices?.[name] || { host: name, start: "priv" };
    if (!st.devices[name]) st.devices[name] = { modes: ["exec", "priv", "config"].slice(0, ["exec", "priv", "config"].indexOf(d.start || "priv") + 1), log: [] };
    return Object.assign(st.devices[name], { host: d.host || name });
  };

  function render() {
    stepsEl.innerHTML = lab.steps.map((s, i) => `<li class="lab-step ${i < st.step ? "done" : i === st.step ? "current" : "locked"}" id="step-${i}" ${i > st.step ? 'aria-disabled="true"' : ""}>
      <div class="lab-step-head"><span class="lab-step-num" aria-hidden="true">${i < st.step ? icon("check") : i > st.step ? icon("lock") : i + 1}</span>
        <h2>${esc(s.title)}</h2><span class="sr-only">${i < st.step ? "done" : i > st.step ? "locked" : "current step"}</span></div>
      ${i <= st.step ? `<div class="lab-step-body" id="body-${i}"></div>` : ""}
    </li>`).join("");
    for (let i = 0; i <= Math.min(st.step, N - 1); i++) (i < st.step ? doneBody : liveBody)(i);
  }
  function learnHTML(s) { return s.learn ? `<div class="lab-learn">${s.learn.split("\n\n").map(p => `<p>${rt(p)}</p>`).join("")}</div>` : ""; }
  function doneBody(i) {
    const s = lab.steps[i], r = stepRec(i), body = document.getElementById(`body-${i}`);
    body.innerHTML = `<details><summary class="small">Review this step${r.wrong || r.hint || r.reveal ? ` · ${[r.wrong && plural(r.wrong, "wrong try"), r.hint && "hint used", r.reveal && "answer revealed"].filter(Boolean).join(", ")}` : " · no mistakes"}</summary>
      ${learnHTML(s)}<p><b>Task:</b> ${rt(s.task)}</p>${answerHTML(s)}${s.why ? `<p class="lab-why">${rt(s.why)}</p>` : ""}</details>`;
  }
  function answerHTML(s) {
    if (s.type === "cli") return `<pre class="lab-answer">${s.commands.map(c => esc(c.cmd)).join("\n")}</pre>`;
    if (s.type === "choice") return `<p class="lab-answer">${s.options.filter(o => o.correct).map(o => esc(o.text)).join("<br>")}</p>`;
    if (s.type === "order") return `<ol class="lab-answer">${s.items.map(x => `<li>${esc(x)}</li>`).join("")}</ol>`;
    if (s.type === "form") return `<dl class="lab-answer">${s.fields.map(f => `<dt>${esc(f.label)}</dt><dd>${esc(f.kind === "check" ? (f.answer ? "On" : "Off") : [].concat(f.answer)[0])}</dd>`).join("")}</dl>`;
    return "";
  }
  function liveBody(i) {
    const s = lab.steps[i], r = stepRec(i), body = document.getElementById(`body-${i}`);
    body.innerHTML = `${learnHTML(s)}<p class="lab-task"><b>Task:</b> ${rt(s.task)}</p><div class="lab-work" id="work"></div>
      <div class="lab-feedback" id="feedback" role="status" aria-live="polite"></div>
      <div class="row lab-help"><button class="btn small-btn" type="button" id="hint">${icon("alert")}Hint</button><button class="btn small-btn" type="button" id="reveal">Show answer</button>
      <span class="small muted" id="help-note"></span></div><div id="hint-text"></div><div id="reveal-text"></div>`;
    const fb = document.getElementById("feedback");
    const say = (html, tone) => { fb.className = `lab-feedback ${tone || ""}`; fb.innerHTML = html; };
    const helpBtns = () => {
      const h = document.getElementById("hint"), v = document.getElementById("reveal"), note = document.getElementById("help-note");
      h.disabled = r.hint || r.wrong < HINT_AFTER || !s.hint; v.disabled = r.reveal || r.wrong < REVEAL_AFTER;
      note.textContent = r.reveal ? "" : r.wrong < HINT_AFTER ? `A hint opens after ${HINT_AFTER} wrong tries (−${HINT} points).` : r.wrong < REVEAL_AFTER ? `The answer opens after ${REVEAL_AFTER} wrong tries (−${REVEAL} points).` : `Showing the answer costs ${REVEAL} points.`;
      if (r.hint && s.hint) document.getElementById("hint-text").innerHTML = `<p class="lab-hint">${icon("alert")}${rt(s.hint)}</p>`;
      if (r.reveal) document.getElementById("reveal-text").innerHTML = `<div class="lab-hint"><b>Answer</b>${answerHTML(s)}</div>`;
    };
    const miss = msg => { r.wrong++; say(msg, "bad"); helpBtns(); persist(); };
    document.getElementById("hint").onclick = () => { r.hint = true; helpBtns(); persist(); };
    document.getElementById("reveal").onclick = () => { r.reveal = true; helpBtns(); persist(); if (s.type !== "cli") fillAnswer(); };
    const completeSoon = () => setTimeout(() => { if (!gone) complete(); }, 450);
    const complete = () => {
      st.step = i + 1; persist(); render();
      if (st.step >= N) return finish();
      const next = document.getElementById(`step-${st.step}`);
      next.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      next.querySelector("input, button, select")?.focus({ preventScroll: true });
    };
    const work = document.getElementById("work");
    let fillAnswer = () => {};
    if (s.type === "cli") cliStep(); else if (s.type === "choice") choiceStep(); else if (s.type === "order") orderStep(); else if (s.type === "form") formStep();
    helpBtns();

    function cliStep() {
      const dev = device(s.device), need = s.commands;
      const left = () => need.map((c, k) => k).filter(k => !r.done.includes(k));
      work.innerHTML = `<div class="term" role="group" aria-label="${esc(s.device)} console"><div class="term-title">${icon("terminal")}${esc(s.device)}</div>
        <div class="term-out" id="term-out" aria-live="polite"></div>
        <form class="term-line" id="term-form" autocomplete="off"><label for="term-in" id="term-prompt">${esc(prompt(dev))}</label><input id="term-in" type="text" spellcheck="false" autocapitalize="off" autocorrect="off" enterkeyhint="send" aria-describedby="term-prompt"></form></div>
        <div class="row term-keys" aria-label="Insert a command">${["enable", "configure terminal", "exit", "end", "show running-config"].map(k => `<button class="chip" type="button" data-insert="${k}">${k}</button>`).join("")}</div>
        <p class="small muted">${need.length > 1 ? `${need.length} commands to enter${s.ordered ? ", in order" : ""}.` : "One command to enter."} Short forms like <code>conf t</code> work. ↑ recalls earlier commands.</p>`;
      const out = document.getElementById("term-out"), input = document.getElementById("term-in"), pr = document.getElementById("term-prompt");
      const print = (txt, cls) => { const p = document.createElement("div"); if (cls) p.className = cls; p.textContent = txt; out.append(p); out.scrollTop = out.scrollHeight; };
      dev.log.slice(-40).forEach(l => print(l[0], l[1]));
      const history = dev.log.filter(l => l[1] === "cmd").map(l => l[0].replace(/^\S+[>#]\s?/, ""));
      let hpos = history.length;
      work.querySelectorAll("[data-insert]").forEach(b => b.onclick = () => { input.value = b.dataset.insert; input.focus(); });
      input.addEventListener("keydown", e => {
        if (e.key === "ArrowUp" && hpos > 0) { e.preventDefault(); input.value = history[--hpos]; }
        else if (e.key === "ArrowDown") { e.preventDefault(); hpos = Math.min(history.length, hpos + 1); input.value = history[hpos] || ""; }
      });
      const log = (txt, cls) => { dev.log.push([txt, cls]); dev.log = dev.log.slice(-200); print(txt, cls); };
      document.getElementById("term-form").onsubmit = e => {
        e.preventDefault();
        const typed = input.value.trim(); input.value = "";
        if (!typed) return log(prompt(dev), "cmd");
        log(`${prompt(dev)} ${typed}`, "cmd"); history.push(typed); hpos = history.length;
        const mode = dev.modes[dev.modes.length - 1];
        let cmd = typed;
        // "do show ..." runs an EXEC command from configuration mode, as on a real device.
        const doCmd = /^do\s+/i.test(typed) && !["exec", "priv"].includes(mode);
        if (doCmd) cmd = typed.replace(/^do\s+/i, "");
        const todo = left(), pool = s.ordered ? todo.slice(0, 1) : todo;
        const hit = pool.find(k => forms(need[k]).some(f => commandMatches(cmd, f)));
        const anyHit = hit === undefined ? todo.find(k => forms(need[k]).some(f => commandMatches(cmd, f))) : undefined;
        const want = hit !== undefined ? need[hit] : null;
        if (want) {
          const wm = want.mode || "config", inConfig = !["exec", "priv"].includes(mode);
          const okMode = wm === mode || (doCmd && wm === "priv") || (wm === "config" && inConfig && mode !== "config") || (wm === "priv" && mode === "priv");
          if (!okMode) { pr.textContent = prompt(dev); return miss(`Right command, wrong mode. <b>${esc(want.cmd)}</b> is entered in ${esc(modeName(wm))}; you are in ${esc(modeName(mode))}.`); }
          if (wm === "config" && inConfig && mode !== "config") dev.modes = dev.modes.slice(0, dev.modes.indexOf("config") + 1);
          if (want.enter) dev.modes.push(want.enter);
          if (want.output) want.output.split("\n").forEach(l => log(l, "res"));
          r.done.push(hit); pr.textContent = prompt(dev); persist();
          say(`${icon("check")} ${want.note ? rt(want.note) : "Accepted."}`, "good");
          if (!left().length) completeSoon();
          return;
        }
        if (builtin(dev, cmd)) { pr.textContent = prompt(dev); persist(); return; }
        // Re-entering a command that was already accepted is harmless on a real device, so it costs nothing here.
        const earlier = lab.steps.slice(0, i + 1).some((x, j) => x.type === "cli" && x.device === s.device && x.commands.some((c, k) => (j < i || r.done.includes(k)) && forms(c).some(f => commandMatches(cmd, f))));
        if (earlier) { say("That's already configured. Carry on with the rest of the task."); return; }
        if (/^(show|sh|ping|traceroute|debug|wr|write|copy)\b/i.test(cmd) || /^do\s/i.test(typed)) { log("(The simulated device has no output for that command in this step.)", "res"); return; }
        if (anyHit !== undefined) return miss(`That command belongs to this step, but not yet: the commands go in order. Next is the ${ordinal(need.findIndex((c, k) => !r.done.includes(k)) + 1)} one.`);
        log("% Invalid input detected at '^' marker.", "err");
        miss(`That isn't what this step needs. Check the task and the values in the scenario.`);
      };
      if (need.length && !left().length) return complete();
      input.focus({ preventScroll: true });
    }
    function choiceStep() {
      const multi = s.options.filter(o => o.correct).length > 1, opts = s.shuffle === false ? s.options : shuffle(s.options);
      work.innerHTML = `<fieldset class="lab-choice"><legend>${rt(s.question || "Choose the answer.")}${multi ? ` <span class="muted small">Choose all that apply.</span>` : ""}</legend>
        ${opts.map((o, k) => `<label class="lab-opt"><input type="${multi ? "checkbox" : "radio"}" name="opt" value="${s.options.indexOf(o)}"><span>${rt(o.text)}</span></label>`).join("")}</fieldset>
        <button class="btn primary" type="button" id="check">Check</button>`;
      const boxes = [...work.querySelectorAll("input[name=opt]")];
      document.getElementById("check").onclick = () => {
        const picked = boxes.filter(b => b.checked).map(b => +b.value);
        if (!picked.length) return say("Choose an answer first.");
        const wrong = picked.filter(k => !s.options[k].correct), missing = s.options.filter((o, k) => o.correct && !picked.includes(k));
        if (!wrong.length && !missing.length) { say(`${icon("check")} Correct.`, "good"); return completeSoon(); }
        miss(wrong.length ? wrong.map(k => `<p><b>${rt(s.options[k].text)}:</b> ${rt(s.options[k].why || "Not this one.")}</p>`).join("") : `Some of that is right, but ${plural(missing.length, "answer")} ${missing.length > 1 ? "are" : "is"} missing.`);
      };
      fillAnswer = () => { boxes.forEach(b => b.checked = !!s.options[+b.value].correct); };
    }
    function orderStep() {
      let order = shuffle(s.items.map((x, k) => k));
      if (order.every((k, j) => k === j)) order.reverse();
      const draw = () => {
        work.innerHTML = `<p>${rt(s.question || "Put these in order.")}</p><ol class="lab-order">${order.map((k, j) => `<li><span>${rt(s.items[k])}</span>
          <button class="icon-btn" type="button" data-up="${j}" aria-label="Move up: ${esc(s.items[k])}" ${j ? "" : "disabled"}>↑</button><button class="icon-btn" type="button" data-down="${j}" aria-label="Move down: ${esc(s.items[k])}" ${j < order.length - 1 ? "" : "disabled"}>↓</button></li>`).join("")}</ol>
          <button class="btn primary" type="button" id="check">Check order</button>`;
        work.querySelectorAll("[data-up],[data-down]").forEach(b => b.onclick = () => {
          const j = +(b.dataset.up ?? b.dataset.down), t = b.dataset.up !== undefined ? j - 1 : j + 1;
          [order[j], order[t]] = [order[t], order[j]]; draw(); work.querySelector(`[data-${b.dataset.up !== undefined ? "up" : "down"}="${t}"]`)?.focus();
        });
        document.getElementById("check").onclick = () => {
          const right = order.filter((k, j) => k === j).length;
          if (right === order.length) { say(`${icon("check")} Correct order.`, "good"); return completeSoon(); }
          miss(`${right} of ${order.length} are in the right place.`);
        };
      };
      draw();
      fillAnswer = () => { order = s.items.map((x, k) => k); draw(); };
    }
    function formStep() {
      work.innerHTML = `<div class="mock-screen"><div class="mock-bar">${esc(s.screen || "")}</div><div class="mock-body">
        ${s.fields.map((f, k) => `<div class="mock-field" data-f="${k}">${f.kind === "check"
          ? `<label class="check"><input type="checkbox" id="f${k}"> ${esc(f.label)}</label>`
          : `<label for="f${k}">${esc(f.label)}</label>${f.kind === "select"
            ? `<select id="f${k}"><option value="">Choose…</option>${f.options.map(o => `<option>${esc(o)}</option>`).join("")}</select>`
            : `<input id="f${k}" type="text" autocomplete="off" spellcheck="false" ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ""}>`}`}</div>`).join("")}
        <button class="btn primary" type="button" id="check">${esc(s.button || "Save")}</button></div></div>`;
      const val = (f, k) => { const el = document.getElementById(`f${k}`); return f.kind === "check" ? el.checked : el.value.trim(); };
      const ok = (f, v) => f.kind === "check" ? v === !!f.answer : [].concat(f.answer).some(a => String(a).toLowerCase() === String(v).toLowerCase());
      document.getElementById("check").onclick = () => {
        const bad = s.fields.map((f, k) => [f, k]).filter(([f, k]) => !ok(f, val(f, k)));
        work.querySelectorAll(".mock-field").forEach(el => el.classList.toggle("wrong", bad.some(([, k]) => k === +el.dataset.f)));
        if (!bad.length) { say(`${icon("check")} Saved. Every setting is right.`, "good"); return completeSoon(); }
        miss(`${plural(bad.length, "setting")} ${bad.length > 1 ? "aren't" : "isn't"} right yet: ${bad.map(([f]) => esc(f.label)).join(", ")}.`);
      };
      fillAnswer = () => s.fields.forEach((f, k) => { const el = document.getElementById(`f${k}`); if (f.kind === "check") el.checked = !!f.answer; else el.value = [].concat(f.answer)[0]; });
    }
  }
  const ordinal = k => ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"][k - 1] || `#${k}`;

  function finish() {
    clearInterval(timer);
    const ms = Math.round(elapsed());
    const totals = st.steps.reduce((t, r) => ({ wrong: t.wrong + (r?.wrong || 0), hints: t.hints + (r?.hint ? 1 : 0), reveals: t.reveals + (r?.reveal ? 1 : 0),
      lost: t.lost + Math.min(WRONG_CAP, (r?.wrong || 0) * WRONG) + (r?.hint ? HINT : 0) + (r?.reveal ? REVEAL : 0) }), { wrong: 0, hints: 0, reveals: 0, lost: 0 });
    const score = Math.max(0, 100 - totals.lost);
    const before = labRuns(lab.id), prevAvg = avgMs(before), prevBest = before.length ? Math.max(...before.map(x => x.score)) : null;
    const all = store.get("labs", {});
    all[lab.id] = { runs: before.concat([{ at: Date.now(), score, ms, wrong: totals.wrong, hints: totals.hints, reveals: totals.reveals }]).slice(-MAX_RUNS) };
    store.set("labs", all); store.del(`lab.pos.${lab.id}`); syncSoon();
    const newAvg = avgMs(all[lab.id].runs), target = lab.minutes * 60000;
    const res = document.createElement("section");
    res.className = "card lab-result"; res.setAttribute("aria-labelledby", "lab-done");
    res.innerHTML = `<h2 id="lab-done">${icon("check")}Lab complete</h2>
      <div class="lab-score"><div><strong class="${score >= 80 ? "good" : score >= 60 ? "warn" : "bad"}">${score}</strong><small>score out of 100${prevBest !== null ? ` · best ${Math.max(prevBest, score)}` : ""}</small></div>
      <div><strong>${fmtClock(ms)}</strong><small>your time · target ${lab.minutes}:00</small></div>
      <div><strong>${fmtClock(newAvg)}</strong><small>your average over ${plural(all[lab.id].runs.length, "run")}${prevAvg ? ` (was ${fmtClock(prevAvg)})` : ""}</small></div></div>
      <p>${ms <= target ? `You finished ${fmtDur(target - ms)} under the target time.` : `That took ${fmtDur(ms - target)} longer than the target time.`}
        ${totals.wrong || totals.hints || totals.reveals ? `Points lost: ${[totals.wrong && `${plural(totals.wrong, "wrong try")}`, totals.hints && plural(totals.hints, "hint"), totals.reveals && plural(totals.reveals, "revealed answer")].filter(Boolean).join(", ")}.` : "No mistakes, no hints."}</p>
      ${lab.summary ? `<p><b>What you configured:</b> ${rt(lab.summary)}</p>` : ""}
      <div class="row"><button class="btn" type="button" id="again">Do this lab again</button>${lab.next ? `<a class="btn primary" href="#/labs/${esc(lab.next)}">Next lab ${icon("arrow")}</a>` : ""}<a class="btn" href="#/labs">All labs</a></div>`;
    stepsEl.after(res);
    document.getElementById("again").onclick = () => { if (!gone) { res.remove(); runLab(meta, lab, null); } };
    res.scrollIntoView({ block: "start" });
    res.querySelector("h2").setAttribute("tabindex", "-1"); res.querySelector("h2").focus({ preventScroll: true });
  }
  render();
}

export { labsView, labView, labIndex, commandMatches };
