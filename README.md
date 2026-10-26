# CCNP Security SCOR 350-701 Study

Flashcards and practice tests for each chapter of the *CCNP and CCIE Security Core SCOR 350-701 Official Cert Guide* (2nd edition), built from my chapter study notes.

- **Flashcards:** every vocabulary term, port, command, and number from the notes, grouped by deck. Flip, shuffle, and mark cards to study again.
- **Practice tests:** 5 tests of 20 questions per chapter. Answer choices are shuffled each time. A wrong answer shows the right answer, why it's right, and why the chosen answer was wrong.
- **Results:** the score at the top, a comparison with your last attempt, and the areas to study: the chapter sections where you missed questions, weakest first, with a one-click deck of the flashcards behind those misses.
- **Progress dashboard** (`#/progress`): tests passed, average score, streak, a score trend chart, your weakest sections across all tests, a best-score grid for all 55 tests, and recent attempts. Progress is saved in the browser; export and import it to move between devices.

It's a static site (plain HTML, CSS, and JavaScript, no build step) served by GitHub Pages from the `main` branch.

## Files

- `index.html`, `assets/` — the site.
- `data/chapters.json`, `data/flashcards.json` — generated from the notes by `tools/build_flashcards.py`.
- `data/tests/chNN.json` — the practice tests. Check them with `python3 tools/validate_tests.py`.
- Each question's `section` and `cards` fields (used for areas to study) come from `python3 tools/tag_questions.py NOTES_DIR`. Re-run it after the tests or flashcards change.

## Run locally

```
python3 -m http.server 8000
```

Then open http://localhost:8000.
https://elspaniard97.github.io/CCNP-Security/
