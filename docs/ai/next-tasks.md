# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-09-23T02:04:59Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [HIGH] Resolve risk: (tercatat di atas)
- Why: Risk was recorded but not marked resolved.
- Source: current-task.md

## 2. [HIGH] Run or verify validation: Risk analysis: COMPLETE
- Why: Current task contains validation work that still needs explicit confirmation.
- Source: current-task.md

## 3. [MEDIUM] Follow up on discovered knowledge: buildEml (emlUtils.js): part dgn Content-ID WAJIB satu multipart/related bersama htmlBody — flat di mixed membuat cid: tak ter-resolve di Outlook/Thunderbird walau datanya ada. SOGo draft save protokol = 2 POST ke folderDrafts/{id}/save: multipart field 'attachments' DULU, lalu JSON headers (json saja = draft tanpa lampiran). Kirim dgn lampiran selalu via /api/send SMTP proxy (bukan SOGo /send) + masuk queue undo SMTP_SEND_UNDO_SECONDS=180 — E2E bisa intercept payload & batalkan via toast 'Urungkan' agar nol delivery nyata. Toast undo hanya muncul SETELAH response /api/send — tunggu dgn waitForFunction, bukan cek seketika (race/flaky).
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 4. [LOW] Review and commit current changes
- Why: 13 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
