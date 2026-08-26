# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-26T03:21:11Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Restorasi lampiran draft SOGo: downloadURL dari /view memuat token sesi — fetch + credentials include + sogoHeaders (XSRF); base64 chunked 32KB. extractAttachments di messageHtml.js (dedup reader+mail). Unduh paralel Promise.allSettled, gagal satu → skip + warning. Restore ≠ user edit (tidak memicu autosave). Keterbatasan: saveDraft SOGo hanya teks — lampiran restore hanya hidup di sesi compose.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 4 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
