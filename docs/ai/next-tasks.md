# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-27T02:55:27Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Pola bug: textarea plain mode yang menampilkan value dgn regex strip-tag (body.replace(/<[^>]*>?/gm,'')) di SETIAP render akan memakan karakter '<' milik user (mis. 'a < b', kode) — regex tidak bisa membedakan tag asli vs teks polos. Fix: deteksi tag HTML LENGKAP (/<[a-z][^>]*>/i) dulu; hanya strip bila body benar-benar HTML, teks polos dibiarkan. Pola race paste: e.preventDefault() di handler async WAJIB dipanggil synchron SEBELUM await apapun — kalau ditunda browser sudah menjalankan paste default → konten ganda. Untuk fallback Clipboard API cek dt.types (Files / image/*) utk tahu ada gambar tanpa await.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 4 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
