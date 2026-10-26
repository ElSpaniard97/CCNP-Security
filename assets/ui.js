const PASS = 80;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const rich = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
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


export { esc, cap, rich, shuffle, plural, pctOf, level, secName, fmtDate, fmtDur, fmtClock, fmtAgo, dayKey, testTitle };
