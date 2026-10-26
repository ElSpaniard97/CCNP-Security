  const store = {
    get(k, d) { try { const v = localStorage.getItem("scor." + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("scor." + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem("scor." + k); } catch (e) { /* storage unavailable */ } },
    keys() { try { return Object.keys(localStorage).filter(k => k.startsWith("scor.")).map(k => k.slice(5)); } catch (e) { return []; } }
  };
  const LOCAL_ONLY = new Set(["theme", "sync", "review", "cards.reverse"]); // never exported or synced


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

export { store, LOCAL_ONLY, snapshot, restore, merge };
