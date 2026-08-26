# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-26T16:24:35Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Audit PreferencesPage: preferensi tampilan SOGo (SOGoMailComposeMessageType, SOGoMailReplyPlacement, SOGoFirstDayOfWeek, SOGoConfirmDelete) sebelumnya disimpan tapi TIDAK dikonsumsi webmail — pola 'setting tanpa efek'. Pola wiring: cek konsumen dgn grep sebelum menganggap setting berfungsi; query preferences pakai key ['preferences', token] (cache react-query shared antar halaman). SOGoFirstDayOfWeek: 0=Minggu,1=Senin; rotasi label hari = DAYS_ID.slice(1)+DAYS_ID[0]. SOGoConfirmDelete '0' = hapus langsung, '1' = konfirmasi (webmail pakai undo toast 6dtk sbg konfirmasi). SOGoDateFormat strftime tidak dipetakan — webmail punya format id-ID sendiri (renderDate).
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 4 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
