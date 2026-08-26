# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-26T03:14:25Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Pola race autosave: 3 guard ref wajib — autosaveBusy (cegah tumpukan, finally reschedule), sentRef (autosave in-flight saat Send membersihkan draftnya sendiri), userEditedRef (autosave hanya setelah input user berubah). handleSend harus clearTimeout sebelum request. extractHtml SOGo parts: prefer text/html di kedalaman mana pun (findHtml dua-pass), fallback text/plain wrap div. Edit draft tanpa draftId SOGo: buka compose pre-filled dari /view + autosave ke draft baru + hapus draft asli saat kirim. Keterbatasan: draft ber-lampiran tidak bisa direstorasi (saveDraft tanpa lampiran).
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 4 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
