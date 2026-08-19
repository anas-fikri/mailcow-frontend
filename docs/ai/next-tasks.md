# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-19T14:56:49Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] (selesai) build + test + deploy
- Why: Explicit next step recorded on active task.
- Source: current-task.md

## 2. [HIGH] Resolve risk: Fallback SMTP kini ketat ke 501 — kalau SOGo di production ternyata return kode lain saat /send gagal, kirim akan surface error (lebih aman daripada kirim ganda).
- Why: Risk was recorded but not marked resolved.
- Source: current-task.md

## 3. [HIGH] Run or verify validation: 16/16 test PASS · npm run build OK · node --check server.js OK
- Why: Current task contains validation work that still needs explicit confirmation.
- Source: current-task.md

## 4. [MEDIUM] Follow up on discovered knowledge: Node http.request timeout = idle timeout, BUKAN total deadline — slow-drip upstream (1 byte tiap <10s) lolos dan menahan koneksi image-proxy tak terbatas. Mitigasi: deadline absolut Date.now()+10s dihitung sekali, diteruskan ke tiap hop, stream di-destroy saat lewat. sendMessage SOGo /send non-ok: fallback ke /api/send harus dibatasi ke 501 saja — status 4xx/5xx lain = SOGo sudah memproses, fallback = risiko kirim ganda.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 5. [LOW] Review and commit current changes
- Why: 8 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
