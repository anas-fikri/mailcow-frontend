# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-26T02:23:56Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Konflik sorting MailPage: sortedMessages kini urut by TANGGAL (sortMessagesByDate — uid SOGo tidak dijamin sekuensial dgn waktu). sortAsc hanya membalik urutan GRUP (reorderDateGroups utk date-group, groupMessages asc utk conversation thread), isi grup tetap date-descending. Keyboard j/k + range-select visibleOrderUids pakai sumber urutan sama dengan render; fallback saat conversation view tanpa grup. 49/49 test PASS, deploy live hash terverifikasi.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 4 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
