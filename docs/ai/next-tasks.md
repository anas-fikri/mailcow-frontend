# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-21T09:38:38Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [HIGH] Run or verify validation: 36/36 test PASS · npm run build OK
- Why: Current task contains validation work that still needs explicit confirmation.
- Source: current-task.md

## 2. [MEDIUM] Follow up on discovered knowledge: Audit normalisasi data storage selesai: getRules (autoArchive), loadPrefsFromLocal + fetchContacts (api.js), loadSnoozes (snooze.js), flattenMailboxes (mailboxTree.js), getStore (flagColors) kini menormalkan data legacy di source reader (pola loadSignatures). Jebakan: Number(null)=0, Number(true)=1. Test baru test:autoarchive + perluasan test:snooze/mailbox-tree/preferences-fallback. 36/36 PASS.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 3. [LOW] Review and commit current changes
- Why: 14 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
