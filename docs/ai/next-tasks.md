# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-26T09:57:58Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Fitur lib bisa mati diam-diam walau unit test hijau: proxyExternalImages (imageProxy.js) lengkap + test 68 assertion tapi tidak pernah di-wire ke MessageReader → gambar eksternal bocor langsung ke pengirim (IP + read-receipt). Wajib assertion statis wiring di komponen untuk fitur yang berdampak keamanan/privacy. Juga: labelField 'to' utk folder Terkirim/Draf di header percakapan (konsisten dgn renderMessageRow); SOGo viewPart kirim X-Frame-Options SAMEORIGIN → iframe lightbox PDF aman.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 4 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
