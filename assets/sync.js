import { store, snapshot, restore, merge } from "./store.js";
  // ---------- sync across devices (a private GitHub gist) ----------
  const GIST_FILE = "scor-progress.json";
  const GIST_DESC = "SCOR study progress (written by the study site)";
  let syncTimer = null;

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


export { syncConnect, syncNow, syncSoon };
