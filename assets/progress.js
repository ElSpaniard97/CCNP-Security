import { chap, app, PASS, chapters, flashcards, setCrumbs, question, attempts, fullAttempts, examAttempts, bests, latestByTest, streak, unfinished, bankActive, studyCards, meter, resumeBanner, route, store, snapshot, restore, syncConnect, syncNow, esc, plural, pctOf, level, secName, fmtDate, fmtDur, fmtAgo, testTitle, srsDue } from "./runtime.js";
import { attemptStrip } from "./quiz.js";


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
        <div class="card kpi"><div class="kpi-num">${avg === null ? "–" : avg + "%"}</div><div class="muted small">average of latest scores</div></div>
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
          <thead><tr><th scope="col">Chapter</th>${[1, 2, 3, 4, 5].map(t => `<th scope="col">T${t}</th>`).join("")}<th scope="col">Best avg</th></tr></thead>
          <tbody>${chapters.map(c => {
            const vals = [1, 2, 3, 4, 5].map(t => best[`${c.n}.${t}`]);
            const got = vals.filter(v => v !== undefined);
            const cavg = got.length ? Math.round(got.reduce((a, b) => a + b, 0) / got.length) : null;
            return `<tr><th scope="row"><a href="#/ch/${c.n}" title="${esc(c.title)}">${c.n}.<span class="ch-name"> ${esc(c.title)}</span></a></th>
              ${vals.map((v, i) => `<td data-label="Test ${i+1}"><a class="cell ${v === undefined ? "none" : level(v)}" href="${store.get(`last.${c.n}.${i + 1}`, null) ? `#/ch/${c.n}/test/${i + 1}/last` : `#/ch/${c.n}/test/${i + 1}`}" title="Chapter ${c.n}, Test ${i + 1}: ${v === undefined ? "not taken" : `best ${v}%`}">${v === undefined ? "–" : v}</a></td>`).join("")}
              <td class="avg" data-label="Best average">${cavg === null ? "–" : cavg + "%"}</td></tr>`;
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
    const W = Math.max(220, Math.min(900, app.clientWidth - 64)), H = 220, L = 34, R = 12, T = 12, B = 26;
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
        <button class="btn" type="button" id="import-button">Import progress</button><input type="file" id="import" accept="application/json,.json" hidden>
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
    document.getElementById("import-button").onclick = () => document.getElementById("import").click();
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


export { dashboard, trendChart, wireTrend, syncHTML, wireSync, backupHTML, wireBackup };
