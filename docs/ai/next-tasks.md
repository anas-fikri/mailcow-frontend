# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-27T03:30:49Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Batch fitur live: Undo Send 180s server-side queue (kredensial AES-256-GCM di data/pending-sends.json, flush 5s, retry 3x, /api/send/undo + /api/send/pending) + Kirim Terjadwal via sendAt (wajib lewat SMTP proxy, SOGo tak dukung send-at). Dark mode auto via prefers-color-scheme dengan anti-FOUC script EKSTERNAL theme-init.js karena CSP script-src 'self' memblokir inline. PWA: sw.js network-first utk navigasi + stale-while-revalidate asset, TIDAK pernah cache /api; nginx wajib no-cache utk file non-hash (sw/theme-init/manifest) + mime application/manifest+json. NGINX LESSON: route /api baru harus ditambah location exact di configs/site.webmail.custom; tanpa itu request jatuh ke SPA fallback (200 index.html) atau 405. Route API di ROOT domain, bukan /webmail prefix.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 4 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
