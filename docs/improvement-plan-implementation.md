# Improvement plan implementation

Based on the October 26, 2026 updated plan and commit `4538631`.

| Stage | Implementation |
| --- | --- |
| A | Playwright smoke coverage and PR/push CI, including tile-body click regression protection. |
| B | Native modules for persistence, sync, SRS, quiz/results, cards/search, progress, shared runtime, UI helpers, offline support, and study-domain selection. No production bundler. |
| C | Existing colors retained; spacing/focus/width tokens, skip link, 44 px controls, command monospace, and reduced-motion feedback scroll. |
| D | Desktop navigation, mobile tabs, Study hub, breadcrumbs inside main, `aria-current`, and hidden mobile tabs during active exams. Deep links preserved. |
| E | Ordered recommendations, first-visit guidance, chapter status, filters, and scoped chapter continuation. |
| F | Radio semantics with arrow keys, deliberate focus after rendering, progressbar semantics, in-page exam review, and 10/5/1-minute live announcements. |
| G | Contextual result actions, separate one-off misses, two-question minimum for ranked areas, explicit latest/best averages, mobile chapter score cards. |
| H | Hidden-face ARIA, visible flip control, one keyboard path, grouped deck preferences, and class-based SRS flips. |
| I | User-approved plan weights as a labeled study preset, unique domain allocation, and domain results. Current official verification remains pending. |
| J | Reviewed override file, known Chapter 1 correction, and subsection support in the tagger. Actual finer re-tagging for chapters 2/3/11 needs source notes, absent from the repository. |
| K | Chapter flashcard assets, term/chapter index, lazy definition loading, install manifest, versioned service worker, and full offline download action. |

The full offline download is explicit, rather than automatic on every first visit, to reconcile offline readiness with the plan's first-load transfer budget. The shell is available offline after a first visit; all data is available after the download's ready message.

Compatibility is tested with existing v1 exports, device-local review decks, quiz resumes, mocked two-device history merges, and token exclusion. The suite also checks mobile widths of 320, 390, and 768 px and the GitHub Pages project prefix. A mutation check removes the stretched tile click area and confirms that the smoke test fails opening the quiz.

No real-device timings, full manual tag review, current official blueprint confirmation, hosted GitHub Action results, or fresh deployment results are claimed. Those require the device, source notes, external verification, or GitHub publication respectively.
