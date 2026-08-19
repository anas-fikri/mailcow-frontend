# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-19T11:00:08Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: SOGo leaf part punya shouldDisplayAttachment (boolean): false = gambar inline (CID) di body, true = lampiran asli. extractAttachments harus skip part dengan shouldDisplayAttachment === false agar gambar inline tidak diduplikasi di daftar Lampiran. Gambar inline tetap di-render di body via resolveCidImages (extractInlineImages). Filter lampiran pakai msg.hasAtt (kolom hasAttachment di SOGO_MESSAGE_HEADERS).
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [MEDIUM] Advance goal: Sub-goal G-001.S-002 — Documentation currency
- Why: Goal remains ACTIVE — historical deployment records are complete, but current login delivery status must remain synchronized..
- Source: goals.md

## 3. [LOW] Review and commit current changes
- Why: 7 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
