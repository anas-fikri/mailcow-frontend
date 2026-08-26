# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-26T01:57:43Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Edge kontak & signature: (1) highlight seleksi kontak 'selected?.uid===contact.uid' crash-logika saat uid kosong (entri GAL/rusak) — SEMUA baris kosong-uid ke-highlight; pola aman: contact.uid ? uid===selected.uid : contact===selected. (2) Duplikat kontak: blokir duplikat PERSONAL (pesan jelas), IZINKAN duplikat GAL (direktori read-only, salinan personal dari kolega = normal) — findDuplicateKind prioritas personal > gal, case-insensitive. (3) Sync signature SOGo one-way push → perangkat lain stale selamanya (fallback SOGo hanya saat daftar lokal KOSONG); fix pull-back idempotent: shouldImportSogoSignature(list, html) = sogoHtml non-empty && tidak ada entri dgn html trim sama — tarik sebagai entri baru saat buka Settings; tidak menimpa editan lokal, tidak menumpuk. Test test:contact-signature-edge = 18 assertions.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 10 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
