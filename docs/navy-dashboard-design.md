# Navy dashboard design

The supplied reference guides the navy surfaces, electric blue accents, desktop sidebar, mountain/server illustration, continuation card, five metrics, study shortcuts, chapter cards, and activity rail. Artwork is local SVG rather than a remote stock image. Supporting screens inherit the same surfaces, focus treatment, buttons, typography, and themes.

Metrics use saved progress: tests passed out of 55, average of latest full test attempts, study streak, due flashcards, and the percentage of practice tests passed. The reference's mock-exam readiness percentage is replaced with explicitly labeled practice coverage; no predictive score is invented. Activity is completed test history. Upcoming review groups existing SRS records by chapter. Weak sections require at least two answered questions. No user profile, notifications, or activity events are fabricated.

New directories are `#/chapters` and `#/practice`. `#/settings` reuses existing sync, backup/import/reset, and offline-download functions. Existing routes and localStorage formats remain compatible. The keyboard skip link focuses main without changing the route or leaving a quiz. Search supports Ctrl/Cmd+K and Enter. Mobile bottom navigation and exam distraction reduction remain supported.

Validation includes the existing functional suite and new navigation, search, settings, stored-metric, theme-persistence, and skip-link coverage. Routes are checked at 320, 390, 768, and 1448 px in both themes. Offline validation includes the GitHub Pages project prefix. Content validation checks all 1,100 questions. Sync is tested against a mocked GitHub API; live GitHub sync and publication are outside local validation.
