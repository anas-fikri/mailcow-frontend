# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-26T09:40:04Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Auto-advance reader (navigateAfter) sempat hilang saat merge restore fitur 08bef9c: prop siblingUids/onNavigateTo tetap di-pass MailPage tapi tidak dikonsumsi → hapus/pindah/spam selalu tutup reader. Pola yang benar: setelah aksi, siblingUids[idx+1] ?? siblingUids[idx-1] → onNavigateTo, fallback onClose. Guard test statis wajib untuk fitur yang pernah hilang karena overwrite.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 4 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
