  const store = {
    get(k, d) { try { const v = localStorage.getItem("scor." + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("scor." + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem("scor." + k); } catch (e) { /* storage unavailable */ } },
    keys() { try { return Object.keys(localStorage).filter(k => k.startsWith("scor.")).map(k => k.slice(5)); } catch (e) { return []; } }
  };
  const LOCAL_ONLY = new Set(["theme", "sync", "review", "cards.reverse", "reader", "sidebar"]); // never exported or synced


  function snapshot() {
    const data = {};
    store.keys().filter(k => !LOCAL_ONLY.has(k)).forEach(k => { data[k] = store.get(k, null); });
    return data;
  }
  // Progress keys the site writes. A backup file or synced copy can hold anything, so restore keeps only
  // these, and history entries are reduced to their numeric fields before the pages render them.
  const PROGRESS_KEY = /^(history|bank|srs|starred|best\.\d+\.\d+|last\.(\d+\.\d+|exam)|resume\.(test\.\d+\.\d+|exam|bank)|reader\.pos\.\d+|labs|schedule|schedule\.done|lab\.pos\.[a-z0-9-]+|cards\.place\.(ch\d+|starred)\.[A-Za-z ]+)$/;
  const num = v => (Number.isFinite(+v) ? +v : 0);
  const LAB_ID = /^[a-z0-9-]{1,60}$/;
  function cleanLabs(v) {
    const out = {};
    Object.entries(v && typeof v === "object" ? v : {}).forEach(([id, rec]) => {
      if (!LAB_ID.test(id) || !rec || !Array.isArray(rec.runs)) return;
      out[id] = { runs: rec.runs.filter(r => r && typeof r === "object").slice(-20).map(r => ({ at: num(r.at), ms: num(r.ms) })) };
    });
    return out;
  }
  // An in-progress lab is replaced by a fresh start if anything in it looks wrong.
  function cleanLabPos(v) {
    if (!v || typeof v !== "object") return null;
    const steps = (Array.isArray(v.steps) ? v.steps : []).map(r => r && typeof r === "object" ? { wrong: num(r.wrong), done: (Array.isArray(r.done) ? r.done : []).map(num) } : null);
    const devices = {};
    Object.entries(v.devices && typeof v.devices === "object" ? v.devices : {}).forEach(([name, d]) => {
      if (!/^[\w-]{1,30}$/.test(name) || !d) return;
      devices[name] = { modes: (Array.isArray(d.modes) ? d.modes : []).map(String).filter(m => /^[\w-]{1,30}$/.test(m)), log: (Array.isArray(d.log) ? d.log : []).slice(-200).map(l => [String(l?.[0] ?? ""), ["cmd", "res", "err"].includes(l?.[1]) ? l[1] : "res"]) };
      if (!devices[name].modes.length) devices[name].modes = ["exec", "priv"];
    });
    return { step: num(v.step), ms: num(v.ms), at: num(v.at), steps, devices };
  }
  // A schedule from a backup or another device keeps only well-formed blocks.
  const DATE = /^\d{4}-\d\d-\d\d$/, ACTS = new Set(["read", "notes", "cards", "test", "labs", "srs", "bank", "exam", "custom"]);
  function cleanSchedule(v) {
    if (!v || typeof v !== "object" || !Array.isArray(v.blocks)) return null;
    const blocks = v.blocks.filter(b => b && typeof b === "object" && /^[a-z0-9]{1,12}$/.test(b.id) && ACTS.has(b.act) && /^\d\d:\d\d$/.test(b.start))
      .slice(0, 80).map(b => ({ id: b.id, day: Math.min(6, Math.max(0, Math.floor(num(b.day)))), start: b.start, mins: Math.min(480, Math.max(5, Math.round(num(b.mins)) || 60)),
        act: b.act, ch: b.ch === "focus" ? "focus" : Math.min(99, Math.max(0, Math.floor(num(b.ch)))), note: String(b.note ?? "").slice(0, 80) }));
    const p = v.prefs && typeof v.prefs === "object" ? v.prefs : null, time = t => /^\d\d:\d\d$/.test(t) ? t : "18:00", mins = m => Math.min(480, Math.max(15, Math.round(num(m)) || 60));
    const prefs = p && { days: (Array.isArray(p.days) ? p.days : []).map(num).filter(d => d >= 0 && d <= 6), wdTime: time(p.wdTime), wdMins: mins(p.wdMins), weTime: time(p.weTime), weMins: mins(p.weMins), acts: (Array.isArray(p.acts) ? p.acts : []).filter(a => ACTS.has(a)) };
    return { at: num(v.at), ...(prefs ? { prefs } : {}), start: DATE.test(v.start) ? v.start : new Date().toISOString().slice(0, 10), exam: DATE.test(v.exam) ? v.exam : "", blocks };
  }
  function cleanDone(v) {
    return Object.fromEntries(Object.entries(v && typeof v === "object" ? v : {}).filter(([k]) => /^\d{4}-\d\d-\d\d\|[a-z0-9]{1,12}$/.test(k))
      .map(([k, t]) => [k, num(t)]).sort((a, b) => b[1] - a[1]).slice(0, 2000));
  }
  function clean(k, v) {
    if (k === "labs") return cleanLabs(v);
    if (k === "schedule") return cleanSchedule(v);
    if (k === "schedule.done") return cleanDone(v);
    if (k.startsWith("lab.pos.")) return cleanLabPos(v);
    if (k !== "history") return v;
    return (Array.isArray(v) ? v : []).filter(h => h && typeof h === "object").map(h => {
      const out = {};
      for (const f of ["at", "ch", "t", "right", "total", "ms"]) if (h[f] !== undefined) out[f] = num(h[f]);
      if (h.exam) out.exam = true;
      if (h.retry) out.retry = true;
      if (Array.isArray(h.missed)) out.missed = h.missed.map(num);
      if (h.secs && typeof h.secs === "object") out.secs = Object.fromEntries(Object.entries(h.secs).map(([sec, rt]) => [sec, [num(rt && rt[0]), num(rt && rt[1])]]));
      return out;
    });
  }
  function restore(data) {
    store.keys().filter(k => !LOCAL_ONLY.has(k)).forEach(k => store.del(k));
    Object.entries(data || {}).forEach(([k, v]) => { if (!LOCAL_ONLY.has(k) && PROGRESS_KEY.test(k)) store.set(k, clean(k, v)); });
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
      else if (k === "schedule.done") out[k] = Object.assign({}, y, x);
      else if (k.startsWith("last.") || k.startsWith("resume.") || k.startsWith("lab.pos.") || k === "schedule") out[k] = newer(x, y);
      else if (k === "labs") {
        out[k] = {};
        for (const id of new Set(Object.keys(x).concat(Object.keys(y)))) {
          const seen = new Map();
          (x[id]?.runs || []).concat(y[id]?.runs || []).forEach(r => seen.set(r.at, r));
          out[k][id] = { runs: [...seen.values()].sort((p, q) => p.at - q.at).slice(-20) };
        }
      }
      else if (k === "bank" || k === "srs" || k === "starred") {
        out[k] = Object.assign({}, y);
        Object.entries(x).forEach(([e, v]) => { out[k][e] = newer(v, y[e]); });
      }
    }
    return out;
  }

export { store, LOCAL_ONLY, snapshot, restore, merge };
