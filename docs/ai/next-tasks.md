# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-26T13:44:55Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Rotasi audit RulesPage (auto-archive vs snooze vs filter kategori): (1) sessionStorage adalah PER-TAB — klaim multi-tab yang memakai sessionStorage tidak pernah terlihat antar tab (double-move tetap terjadi); fix pakai localStorage (shared) + ownership per-instance + release hanya klaim sendiri + storage listener (bump state → re-run engine) untuk menutup race klaim berbarengan. Pelajaran: fitur multi-tab wajib diuji dengan DUA instance storage terpisah, bukan satu storage bersama (test lama lolos walau perilaku asli salah). (2) Setiap jalur yang memindahkan pesan (manual run-now vs engine otomatis) harus konsisten soal snooze: pesan di-snooze = 'tunda utk DILIHAT' → jangan pernah dipindah rule di jalur mana pun, dan TANDAI processed agar tidak di-arsip ulang saat bangun (pola Gmail: filter tidak dijalankan ulang saat wake; konsekuensi: rule baru tidak berlaku retroaktif ke pesan yang sudah di-snooze). (3) Hitung kategori client-side (countCategories) harus memakai pesan yang BENAR-BENAR terlihat — pesan tersembunyi (snooze) yang ikut dihitung membuat tab 'Promosi 5' padahal daftar 3. 137 a11y assertions, 55/55 PASS.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 4 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
