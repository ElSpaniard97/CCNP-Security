# CCNP Security SCOR 350-701 Study

Flashcards and practice tests for each chapter of the *CCNP and CCIE Security Core SCOR 350-701 Official Cert Guide* (2nd edition), built from my chapter study notes.

- **Flashcards:** every vocabulary term, port, command, and number from the notes, grouped by deck. Flip, shuffle, and mark cards to study again.
- **Practice tests:** 5 tests of 20 questions per chapter. Answer choices are shuffled each time. A wrong answer shows the right answer, why it's right, and why the chosen answer was wrong. Best scores are saved in the browser.

It's a static site (plain HTML, CSS, and JavaScript, no build step) served by GitHub Pages from the `main` branch.

## Files

- `index.html`, `assets/` — the site.
- `data/chapters.json`, `data/flashcards.json` — generated from the notes by `tools/build_flashcards.py`.
- `data/tests/chNN.json` — the practice tests. Check them with `python3 tools/validate_tests.py`.

## Run locally

```
python3 -m http.server 8000
```

Then open http://localhost:8000.
