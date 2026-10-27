import { store } from "./store.js";
const DAY=86400000, SRS_DAYS=[0,1,3,7,14,30,60];
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
    fronts.forEach(f => { if (f) srs[srsKey(n, f)] = { b: 1, due: now, at: now }; });
    store.set("srs", srs);
  }
  const srsDue = n => Object.entries(store.get("srs", {})).filter(([k, v]) => v.due <= Date.now() && (n === undefined || +k.split("|")[0] === n));

  // ---------- starred cards ----------
  // starred["ch|front"] = { on, at }. Unstarring keeps the entry with on: false so sync can tell it from a card never starred.
  const isStarred = (n, front) => !!(store.get("starred", {})[srsKey(n, front)] || {}).on;
  function toggleStar(n, front) {
    const starred = store.get("starred", {}), k = srsKey(n, front), on = !(starred[k] || {}).on;
    starred[k] = { on, at: Date.now() };
    store.set("starred", starred);
    return on;
  }
  // [[chapter, front], ...] in chapter order, oldest star first within a chapter.
  const starredList = n => Object.entries(store.get("starred", {}))
    .filter(([k, v]) => v.on && (n === undefined || +k.split("|")[0] === n))
    .sort((a, b) => +a[0].split("|")[0] - +b[0].split("|")[0] || a[1].at - b[1].at)
    .map(([k]) => [+k.split("|")[0], k.slice(k.indexOf("|") + 1)]);

export { srsKey, srsSet, srsMiss, srsDue, isStarred, toggleStar, starredList };
