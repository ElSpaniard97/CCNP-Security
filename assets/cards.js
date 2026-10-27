import { onLeave, getJSON, loadAllCards, chap, app, DECKS, DECK_LABEL, SRS_DAYS, SRS_NEW, chapters, flashcards, setCrumbs, onKey, question, findCard, studyCards, home, store, syncSoon, esc, cap, rich, shuffle, plural, srsKey, srsSet, srsMiss, srsDue, isStarred, toggleStar } from "./runtime.js";
import { icon } from "./visuals.js";


  function setFlashState(flipped) {
    const flash = document.getElementById("flash");
    flash.classList.toggle("flipped", flipped);
    flash.setAttribute("aria-label", flipped ? "Showing answer. Show question" : "Showing question. Show answer");
    flash.querySelector(".front").setAttribute("aria-hidden", String(flipped));
    flash.querySelector(".back").setAttribute("aria-hidden", String(!flipped));
    const button = document.getElementById("flip");
    if (button) button.textContent = flipped ? "Show question" : "Show answer";
  }
  function cardHTML(card, reverse, ch) {
    const def = `${reverse ? "" : `<div class="term-small">${rich(card.front)}</div>`}<div class="def">${rich(cap(card.back))}</div>${card.more && card.more.length ? `<ul>${card.more.map(m => `<li>${rich(m.trim())}</li>`).join("")}</ul>` : ""}`;
    const term = `<div class="term">${rich(card.front)}</div>`;
    const tag = `<div class="tag">${ch ? `Ch ${ch} · ` : ""}${esc(card.topic)}</div>`;
    return `<div class="flash-inner${card.deck === "Commands and Tools" ? " command" : ""}">
      <div class="card face front" aria-hidden="false">${tag}${reverse ? def : term}</div>
      <div class="card face back" aria-hidden="true">${tag}${reverse ? term : def}</div>
    </div>`;
  }

  const starButton = (ch, front, id) => {
    const on = isStarred(ch, front);
    return `<button class="btn star-btn" type="button" ${id ? `id="${id}"` : `data-ch="${ch}" data-front="${esc(front)}"`} aria-pressed="${on}" aria-label="Star ${esc(front.replace(/\*\*/g, ""))}">${icon("star")}<span>${on ? "Starred" : "Star"}</span></button>`;
  };
  function wireStar(btn, ch, front) {
    btn.onclick = e => {
      e.stopPropagation();
      const on = toggleStar(ch, front);
      btn.setAttribute("aria-pressed", on);
      btn.querySelector("span").textContent = on ? "Starred" : "Star";
      syncSoon();
    };
  }

  // A deck from one chapter, or (review) a custom list of [chapter, front] pairs.
  // review.starred marks the deck of every starred card.
  function cardsView(n, deck, review) {
    const c = chap(n);
    if (!review && !c) return home();
    const heading = review ? review.title || "Review deck" : `Chapter ${n} flashcards`;
    setCrumbs(review ? [{ label: "Home", href: "#/" }, { label: heading }]
      : [{ label: "Home", href: "#/" }, { label: `Chapter ${n}`, href: `#/ch/${n}` }, { label: "Flashcards" }]);
    document.title = review ? heading : `Flashcards: Chapter ${n}`;
    const all = review
      ? review.cards.map(([ch, f]) => { const x = findCard(ch, f); return x && Object.assign({ ch }, x); }).filter(Boolean)
      : (flashcards[n] || []).map(x => Object.assign({ ch: n }, x));
    const multi = new Set(all.map(x => x.ch)).size > 1;
    let filter = DECKS.includes(deck) || deck === "Starred" && !(review && review.starred) ? deck : "All";
    let reverse = store.get("cards.reverse", false);
    let order = [], pos = 0, flipped = false, learning = new Set(), shuffled = false, resumed = false, subset = false;

    // The place in each deck is saved by card, so it survives a starred deck growing or shrinking.
    const placeKey = review ? (review.starred ? "starred" : null) : `ch${n}`;
    const saveKey = () => placeKey && `cards.place.${placeKey}.${filter}`;
    const id = i => `${all[i].ch}|${all[i].front}`;
    function savePlace() {
      if (!saveKey() || subset) return;
      if (!pos && !shuffled) return store.del(saveKey());
      store.set(saveKey(), { card: id(order[pos]), order: shuffled ? order.map(id) : null, at: Date.now() });
    }

    function build(keepShuffled, fromStart) {
      const pool = all.map((card, i) => i).filter(i => filter === "All" || (filter === "Starred" ? isStarred(all[i].ch, all[i].front) : all[i].deck === filter));
      const saved = !keepShuffled && !fromStart && saveKey() && store.get(saveKey(), null);
      const byId = new Map(pool.map(i => [id(i), i]));
      const savedOrder = saved && saved.order && saved.order.map(x => byId.get(x)).filter(x => x !== undefined);
      shuffled = keepShuffled || !!(savedOrder && savedOrder.length === pool.length);
      order = keepShuffled ? shuffle(pool) : shuffled ? savedOrder : pool;
      pos = saved ? Math.max(0, order.indexOf(byId.get(saved.card))) : 0;
      resumed = pos > 0; subset = false;
      flipped = false; learning = new Set();
    }
    build(false);

    function render() {
      const total = order.length;
      const card = total ? all[order[pos]] : null;
      const starredCount = all.filter(x => isStarred(x.ch, x.front)).length;
      if (total) savePlace();
      app.innerHTML = `
        <div class="flash-wrap">
          <h1>${esc(heading)}</h1>
          ${review ? `<p class="muted small">${esc(review.label)}</p>` : ""}
          <div class="chips" role="group" aria-label="Deck">
            ${["All", ...DECKS].filter(d => d === "All" || all.some(x => x.deck === d)).map(d =>
              `<button class="chip" type="button" data-deck="${esc(d)}" aria-pressed="${d === filter}">${esc(d === "All" ? "All" : DECK_LABEL[d])}</button>`).join("")}
            ${review && review.starred ? "" : `<button class="chip star-chip" type="button" data-deck="Starred" aria-pressed="${filter === "Starred"}">${icon("star")}Starred (${starredCount})</button>`}
          </div>
          ${total ? `
          <div class="row small muted"><form class="goto" id="goto-form" novalidate><label for="goto">Card</label> <input id="goto" type="number" inputmode="numeric" min="1" max="${total}" value="${pos + 1}" aria-describedby="goto-of"> <span id="goto-of">of ${total}</span><button class="btn small-btn" type="submit">Go</button><span aria-hidden="true">·</span><span>${learning.size} still learning</span></form><span class="spacer"></span>${starButton(card.ch, card.front, "star")}</div>
          <div class="progress"><div style="width:${((pos + 1) / total) * 100}%"></div></div>
          ${resumed ? `<p class="small muted resume-note">Picked up where you left off. <button class="text-btn" type="button" id="from-start">Start from card 1</button></p>` : ""}
          <div class="flash${flipped ? " flipped" : ""}" id="flash" role="button" tabindex="0" aria-label="Showing question. Show answer">${cardHTML(card, reverse, multi && card.ch)}</div>
          <button class="btn" id="flip" type="button">Show answer</button>
          <p class="hint">Tap the card or press Space to flip. Use the arrow keys to move, and press S to star a card, or G to type a card number. Cards marked still learning come up in spaced repetition. Starred cards stay in their own deck until you unstar them.</p>
          <div class="row">
            <button class="btn" type="button" id="prev" ${pos === 0 ? "disabled" : ""}>← Back</button>
            <button class="btn" type="button" id="learn">${learning.has(order[pos]) ? "Unmark" : "Still learning"}</button>
            <button class="btn primary" type="button" id="next">${pos === total - 1 ? "Finish" : "Next →"}</button>
          </div><div class="row preferences" aria-label="Deck preferences">
            <button class="btn" type="button" id="shuffle">Shuffle</button>
            <button class="btn" type="button" id="reverse" aria-pressed="${reverse}">${reverse ? "Show term first" : "Show definition first"}</button>
          </div>` : review && review.starred ? `<p class="muted">You haven't starred any cards yet. Select Star on a flashcard or a search result to keep it in this deck.</p><div class="row"><a class="btn primary" href="#/study">Choose a flashcard deck</a></div>`
            : filter === "Starred" ? `<p class="muted">No starred cards in this deck yet. Select Star on a card to add it here.</p>` : `<p class="muted">No cards in this deck.</p>`}
        </div>`;
      app.querySelectorAll(".chip").forEach(b => b.onclick = () => { filter = b.dataset.deck; build(false); render(); });
      if (!total) return;
      const flash = document.getElementById("flash");
      const flip = () => { flipped = !flipped; setFlashState(flipped); };
      setFlashState(flipped);
      document.getElementById("flip").onclick = flip;
      flash.onclick = flip;
      const gotoInput = document.getElementById("goto");
      document.getElementById("goto-form").onsubmit = e => {
        e.preventDefault();
        const k = Math.round(+gotoInput.value);
        if (!(k >= 1 && k <= total)) { gotoInput.setCustomValidity(`Enter a number from 1 to ${total}.`); gotoInput.reportValidity(); return; }
        pos = k - 1; flipped = false; resumed = false; render();
        document.getElementById("flash").focus();
      };
      gotoInput.oninput = () => gotoInput.setCustomValidity("");
      gotoInput.onfocus = () => gotoInput.select();
      const fromStart = document.getElementById("from-start");
      if (fromStart) fromStart.onclick = () => { build(false, true); render(); document.getElementById("flash").focus(); };
      const star = document.getElementById("star");
      star.onclick = () => { toggleStar(card.ch, card.front); syncSoon(); render(); };
      document.getElementById("prev").onclick = () => go(-1);
      document.getElementById("next").onclick = () => go(1);
      document.getElementById("learn").onclick = () => {
        const k = order[pos];
        if (learning.has(k)) learning.delete(k);
        else { learning.add(k); srsMiss(all[k].ch, [all[k].front]); syncSoon(); }
        render();
      };
      document.getElementById("shuffle").onclick = () => { build(true); render(); };
      document.getElementById("reverse").onclick = () => { reverse = !reverse; store.set("cards.reverse", reverse); flipped = false; render(); };
      onKey(e => {
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); }
        else if (e.key === "ArrowRight") go(1);
        else if (e.key === "ArrowLeft") go(-1);
        else if (e.key.toLowerCase() === "s") star.click();
        else if (e.key.toLowerCase() === "g") { e.preventDefault(); gotoInput.focus(); }
      });
    }

    function go(d) {
      if (d > 0 && pos === order.length - 1) return finish();
      pos = Math.max(0, Math.min(order.length - 1, pos + d));
      flipped = false; resumed = false; render();
    }

    function finish() {
      if (saveKey()) store.del(saveKey());
      const missed = [...learning];
      app.innerHTML = `
        <div class="flash-wrap">
          <h1>Deck finished</h1>
          <p>You went through ${plural(order.length, "card")} and marked ${missed.length} as still learning.</p>
          <div class="row">
            ${missed.length ? `<button class="btn primary" type="button" id="again">Study the ${missed.length} marked cards</button>` : ""}
            <button class="btn" type="button" id="restart">Start the deck over</button>
            <a class="btn" href="${review ? "#/" : `#/ch/${n}`}">${review ? "Home" : `Back to Chapter ${n}`}</a>
          </div>
        </div>`;
      const again = document.getElementById("again");
      if (again) again.onclick = () => { order = shuffle(missed); pos = 0; flipped = false; learning = new Set(); subset = true; render(); };
      document.getElementById("restart").onclick = () => { build(false); render(); };
      onKey(null);
    }

    render();
  }

  // ---------- spaced repetition session ----------
  function srsView(n) {
    if (n && !chap(n)) return home();
    setCrumbs(n ? [{ label: "Home", href: "#/" }, { label: `Chapter ${n}`, href: `#/ch/${n}` }, { label: "Spaced repetition" }] : [{ label: "Home", href: "#/" }, { label: "Spaced repetition" }]);
    document.title = "Spaced repetition";
    const srs = store.get("srs", {});
    const due = srsDue(n).sort((a, b) => a[1].due - b[1].due).map(([k]) => [+k.split("|")[0], k.slice(k.indexOf("|") + 1)]);
    const fresh = [];
    for (const c of chapters) {
      if (n && c.n !== n) continue;
      for (const card of flashcards[c.n] || []) {
        if (fresh.length >= SRS_NEW) break;
        if (!srs[srsKey(c.n, card.front)]) fresh.push([c.n, card.front]);
      }
      if (fresh.length >= SRS_NEW) break;
    }
    const queue = due.concat(fresh).filter(([ch, f]) => findCard(ch, f)).slice(0, 60);
    const reverse = store.get("cards.reverse", false);
    let flipped = false, reviewed = 0, again = 0;
    const scope = n ? `Chapter ${n}` : "all chapters";
    const nextIn = (b, grade) => {
      const nb = grade === "again" ? 1 : Math.min(SRS_DAYS.length - 1, b + (grade === "easy" ? 2 : 1));
      return grade === "again" ? "now" : plural(SRS_DAYS[nb], "day");
    };

    function render() {
      if (!queue.length) return done();
      const [ch, front] = queue[0], card = findCard(ch, front), cur = store.get("srs", {})[srsKey(ch, front)];
      const b = cur ? cur.b : 0;
      app.innerHTML = `
        <div class="flash-wrap">
          <h1>Spaced repetition</h1>
          <p class="muted small">${esc(cap(scope))}. Cards you know come back after longer and longer gaps; cards you miss come back soon.</p>
          <div class="row small muted"><span>${plural(queue.length, "card")} left</span><span class="spacer"></span><span>${b ? `Box ${b}` : "New card"}</span></div>
          <div class="flash${flipped ? " flipped" : ""}" id="flash" role="button" tabindex="0" aria-label="Showing question. Show answer">${cardHTML(card, reverse, ch)}</div>
          <button class="btn" id="flip" type="button">Show answer</button>
          <div id="grades" hidden><div class="row grades">
            <button class="btn grade bad" type="button" data-g="again">Again <span class="small muted">${nextIn(b, "again")}</span></button>
            <button class="btn grade" type="button" data-g="good">Good <span class="small muted">${nextIn(b, "good")}</span></button>
            <button class="btn grade good" type="button" data-g="easy">Easy <span class="small muted">${nextIn(b, "easy")}</span></button>
          </div><p class="hint">Press 1, 2, or 3.</p></div><p class="hint">Tap the card or press Space to show the answer.</p>
        </div>`;
      const flip = () => { flipped = !flipped; setFlashState(flipped); document.getElementById("grades").hidden = !flipped; };
      setFlashState(flipped);
      document.getElementById("grades").hidden = !flipped;
      document.getElementById("flip").onclick = flip;
      document.getElementById("flash").onclick = flip;
      app.querySelectorAll("[data-g]").forEach(btn => btn.onclick = () => grade(btn.dataset.g));
      onKey(e => {
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); }
        else if (flipped && "123".includes(e.key)) grade(["again", "good", "easy"][+e.key - 1]);
      });
    }
    function grade(g) {
      const [ch, front] = queue.shift();
      srsSet(ch, front, g);
      reviewed++;
      if (g === "again") { again++; queue.splice(Math.min(queue.length, 4), 0, [ch, front]); }
      flipped = false;
      render();
    }
    function done() {
      onKey(null);
      syncSoon();
      const next = Object.values(store.get("srs", {})).filter(v => v.due > Date.now()).sort((a, b) => a.due - b.due)[0];
      app.innerHTML = `
        <div class="flash-wrap">
          <h1>${reviewed ? "Session done" : "Nothing due"}</h1>
          <p>${reviewed ? `You reviewed ${plural(reviewed, "card")} and pressed Again ${plural(again, "time")}.` : `No cards are due for ${scope}.`}
          ${next ? ` The next card is due ${new Date(next.due).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}.` : ""}</p>
          <div class="row">
            <button class="btn primary" type="button" id="more">Add ${SRS_NEW} new cards</button>
            <a class="btn" href="${n ? `#/ch/${n}` : "#/"}">${n ? `Back to Chapter ${n}` : "Home"}</a>
          </div>
        </div>`;
      document.getElementById("more").onclick = () => {
        const srsNow = store.get("srs", {});
        const extra = [];
        for (const c of chapters) {
          if (n && c.n !== n) continue;
          for (const card of flashcards[c.n] || []) if (extra.length < SRS_NEW && !srsNow[srsKey(c.n, card.front)]) extra.push([c.n, card.front]);
        }
        if (!extra.length) { document.getElementById("more").replaceWith(Object.assign(document.createElement("span"), { className: "muted", textContent: "You've started every card." })); return; }
        queue.push(...extra);
        render();
      };
    }
    render();
  }

  // ---------- search ----------
  async function searchView(q) {
    const index = await getJSON("data/search-index.json");
    setCrumbs([{ label: "Home", href: "#/" }, { label: "Search" }]);
    document.title = "Search flashcards";
    app.innerHTML = `
      <h1>Search flashcards</h1>
      <input class="search" id="q" type="search" placeholder="Try RADIUS, 443, or show crypto" value="${esc(q || "")}" aria-label="Search every flashcard" autocomplete="off">
      <div id="results"></div>`;
    const input = document.getElementById("q"), out = document.getElementById("results");
    // Mark matches in the raw text, then escape it, so a search for "amp" or "class" can't land inside markup.
    const mark = (s, re) => rich(s.replace(re, m => `\u0001${m}\u0002`)).replace(/\u0001/g, "<mark>").replace(/\u0002/g, "</mark>");
    let runId=0;
    async function run() {
      const id=++runId;
      const term = input.value.trim();
      window.history.replaceState(null, "", term ? `#/search/${encodeURIComponent(term)}` : "#/search");
      if (term.length < 2) { out.innerHTML = `<p class="muted small">Type at least two characters. Searches every term, definition, and detail.</p>`; return; }
      const needle = term.toLowerCase();
      const terms=index.filter(([,front])=>front.toLowerCase().includes(needle));
      out.innerHTML=`<p class="muted" role="status">${terms.length} matching terms. Searching definitions…</p>`;
      try { await loadAllCards(); } catch { if(id===runId) out.innerHTML='<p role="alert">Search data could not load. Reconnect or download all study data for offline search.</p>'; return; }
      if(id!==runId || !input.isConnected) return;
      const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      const hits = [];
      chapters.forEach(c => (flashcards[c.n] || []).forEach(card => {
        const f = card.front.toLowerCase().replace(/\*\*/g, "");
        const rest = (card.back + " " + (card.more || []).join(" ")).toLowerCase();
        const score = f === needle ? 4 : f.startsWith(needle) ? 3 : f.includes(needle) ? 2 : rest.includes(needle) ? 1 : 0;
        if (score) hits.push({ score, ch: c.n, card });
      }));
      hits.sort((a, b) => b.score - a.score || a.ch - b.ch);
      out.innerHTML = `<p class="muted small">${plural(hits.length, "card")}${hits.length > 100 ? ", showing the first 100" : ""}.</p>
        ${hits.length ? `<div class="row" style="margin-bottom:12px"><button class="btn small-btn" type="button" id="deck">Study these as a deck</button></div>` : ""}
        <div class="review">${hits.slice(0, 100).map(h => `<div class="card hit-card">
          <div class="hit-head"><div class="tag"><a href="#/ch/${h.ch}">Ch ${h.ch}</a> · ${esc(DECK_LABEL[h.card.deck] || h.card.deck)} · ${esc(h.card.topic)}</div>${starButton(h.ch, h.card.front)}</div>
          <p><b>${mark(h.card.front, re)}</b></p>
          <p class="small">${mark(cap(h.card.back), re)}</p>
          ${h.card.more && h.card.more.length ? `<ul class="small muted">${h.card.more.map(m => `<li>${mark(m.trim(), re)}</li>`).join("")}</ul>` : ""}
        </div>`).join("")}</div>`;
      out.querySelectorAll(".star-btn").forEach(b => wireStar(b, +b.dataset.ch, b.dataset.front));
      const deck = document.getElementById("deck");
      if (deck) deck.onclick = () => studyCards(hits.slice(0, 100).map(h => [h.ch, h.card.front]), `Search results for "${term}".`);
    }
    let t = null;
    input.addEventListener("input", () => { runId++; clearTimeout(t); t = setTimeout(run, 150); });
    onLeave(()=>{runId++;clearTimeout(t);});
    run();
    input.focus();
  }


export { setFlashState, cardHTML, cardsView, srsView, searchView };
