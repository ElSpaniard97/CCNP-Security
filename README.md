# CCNP Security SCOR 350-701 Study

Flashcards and practice tests for each chapter of the *CCNP and CCIE Security Core SCOR 350-701 Official Cert Guide* (2nd edition), built from my chapter study notes.

- **Flashcards:** every vocabulary term, port, command, and number from the notes, grouped by deck. Flip, shuffle, and mark cards to study again.
- **Practice tests:** 5 tests of 20 questions per chapter. Answer choices are shuffled each time. A wrong answer shows the right answer, why it's right, and why the chosen answer was wrong.
- **Results:** the score at the top, a comparison with your last attempt, and the areas to study: the chapter sections where you missed questions, weakest first, with a one-click deck of the flashcards behind those misses.
- **Progress dashboard** (`#/progress`): tests passed, average score, streak, a score trend chart, your weakest sections across all tests, a best-score grid for all 55 tests, and recent attempts. Progress is saved in the browser; export and import it to move between devices.
- **Resume:** leave any test, exam, or drill and pick it back up where you were. Unfinished tests show on the home page.
- **Last results:** each test keeps the full results of your latest attempt (replaced on every retake), plus a bar chart of every score.
- **Mock exam** (`#/exam`): 25, 50, or 100 questions from every chapter, allocated by the SCOR study preset, 72 seconds a question, flag and review, no answers until the end.
- **Missed questions** (`#/bank`): every wrong answer lands here until you get it right twice in a row.
- **Spaced repetition** (`#/srs`): flashcards come back after 1, 3, 7, 14, 30, then 60 days; cards behind missed questions come due right away.
- **Search** (`#/search`): every flashcard term, definition, and detail.
- **Sync:** optional, through a private GitHub gist and a fine-grained token with only Gists read and write.

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

## Development and checks

The site uses native ES modules and still has no production build or runtime package dependencies. Serve it over HTTP; opening `index.html` as a file will not work.

```sh
python3 -m http.server 8000
```

Development-only browser tests use Node.js 22+ and Playwright:

```sh
npm ci
npx playwright install --with-deps chromium
npm test
python3 tools/validate_tests.py
python3 -m unittest discover -s tests -p 'test_*.py'
python3 tools/build_site_data.py --check
```

Use `CHROMIUM_PATH=/usr/bin/chromium npm test` to use an existing system Chromium. The tests start their own local server. GitHub Actions runs these checks on pushes and pull requests. Tests cover tile-body clicks, resume and retakes, missed-question clearing, spaced repetition, exports including v1, mocked sync, keyboard controls, recommendations, mobile layouts, study-domain quotas, and offline use under both root and GitHub Pages project paths.

After changing site assets or study data, run:

```sh
python3 tools/build_site_data.py
```

This refreshes chapter flashcard files, the term/chapter search index, and the content-derived offline cache version. The original `data/flashcards.json` remains the source for content tooling. Home fetches only chapter metadata and the small study preset. Chapter decks load on demand; searching loads definitions only after a query is entered.

## Study workflow

Home recommends resuming unfinished work, reviewing at least ten due cards, clearing at least five missed questions, retaking the weakest latest score below 80%, starting an untaken test, then a mock exam after all tests have passed. It displays one primary recommendation and up to two alternatives. Study brings together spaced repetition, missed questions, and chapter flashcards. Existing chapter links, `#/review` decks, and `scor.*` progress keys remain compatible.

The mock exam uses the **SCOR study preset** in `data/blueprint.json`, with weights of 25/20/15/15/10/15 percent. These come from the improvement plan; current Cisco blueprint verification is pending. The chapter mapping is an approximation for study, not an official classification or a prediction of the real exam. Chapter 8 fundamentals count as Security Concepts; its configuration sections count as Network Security. Questions are allocated by domain, balanced across its chapters, without duplication. Existing saved exams remain resumable and gain a derived domain breakdown if they predate the preset.

## Offline study and updates

The manifest and service worker support installation in browsers that offer it. The app shell and small startup datasets are cached after the first visit. In **Study → Download all study data**, wait for the ready message before disconnecting to use every deck, test, search, and mock exam offline. This explicit download avoids transferring the entire question bank on a first visit. Browser storage can be evicted, so keep progress exports; installation does not back up localStorage.

The service worker caches only listed, same-origin public assets. GitHub sync requests and credentials are never cached. An update offers a reload button when ready; finish or leave your current question first so its progress is saved. Cache versions are derived from assets and data, and CI rejects a stale asset list. GitHub Pages serves the static files directly; the development test server also checks the `/CCNP-Security/` deployment prefix.

## Reviewed section overrides

`data/section_overrides.json` uses `chapter.test.questionIndex` keys (chapter and test are one-based; question index is zero-based). Each override records exact question text, a reviewed section, and the reason. `tools/tag_questions.py` applies overrides last and refuses stale text matches. To apply reviewed overrides without the original notes:

```sh
python3 tools/section_overrides.py
python3 tools/build_site_data.py
```

The known vulnerability-definition mis-tag in Chapter 1 is corrected. For chapters 2, 3, and 11, the tagger now keeps `numbered section / subsection` instead of only the broad parent section. **Their existing committed tags have not been regenerated:** the required `chapter-NN-source.txt` source notes are not in this repository. Supply those notes and run the tagger, inspect the resulting sections, validate the questions, then refresh generated site data. No complete human review of all 1,100 tags is claimed.

## Browser security rule

Do not add third-party scripts, analytics scripts, or script CDNs. Optional gist sync stores a GitHub token in localStorage, accessible to scripts on this origin. Keep all application code local. If external scripts become necessary, first replace persistent token storage with a per-session re-entry flow. Exports and gist payloads exclude the token and other device-local settings.

## Workspace design

The default workspace follows a dark navy dashboard style with a persistent desktop sidebar, local mountain and network artwork, blue actions, and color-coded study cards. The theme button keeps light mode available and remembers your choice. On phones and tablets, bottom navigation replaces the sidebar.

Dashboard totals, scores, activity, due reviews, and weak sections come from existing local progress. New learners see empty states rather than sample scores. Chapter completion means practice tests passed, and the coverage metric is explicitly practice coverage rather than an estimate of exam readiness.

The sidebar adds chapter and practice directories plus Settings, which brings together existing sync, progress backups, and offline downloads. Header search supports Enter and Ctrl/Cmd+K. The original deep links, progress keys, question data, quiz engine, and review behavior are preserved. All artwork and icons are local assets, so the design works offline and loads no third-party scripts or fonts.
