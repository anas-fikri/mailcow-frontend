# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-26T01:35:07Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Edge case kalender: EventModal TIDAK validasi end>=start — SOGo menerima payload durasi negatif dan bikin event rusak/500; fix helper murni src/lib/eventValidation.js (validateEventTimes: all-day start==end valid, lintas tanggal valid, tanggal rusak ditolak tanpa crash) + normalizeRepeatCount (0/negatif/NaN→1, float floor) dipakai handleSave. Verified aman: pagination MailPage dedup by uid + sort desc + cutoff 5-bulan via uid MINIMUM batch (headers tak urut) + stopFetchingRef utk batch pendek; visibleCount sengaja tak di-reset (jaga scroll). StatsPage semua count default 0 via catch. ContactsPage key uid
- Why: |idx. RulesPage StatsBar guard total==0. ComposeModal guard to wajib + server validateRecipientList (emailValidation.js) 400. Test test:event-validation = 16 assertions.|Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 8 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
