# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-09-06T14:40:41Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Send dengan lampiran ATAU sendAt selalu via /api/send proxy dan ditahan SEND_UNDO_SECONDS (3 menit) di queue sebelum flush — kedatangan email ±3,5 menit, by design bukan bug; SOGo draft/save protokol 2-fase (multipart attachments lalu JSON headers) — satu request saja menghasilkan draft rusak; klik elemen React di puppeteer harus via page.evaluate (query ulang) bukan evaluateHandle+click karena re-render menyebabkan stale-node 'not clickable'; penanda modal compose tertutup pada reply = placeholder editor hilang karena reader di belakangnya juga memuat teks 'Kepada:'; polling kedatangan email di E2E butuh horizon 5 menit (postfix delays 20-60s + queue undo).
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 4 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
