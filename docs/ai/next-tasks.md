# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-26T02:41:56Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Sync cache React Query lintas tab utk Calendar/Contacts: helper crossTab.js — bumpDomainVersion (monotonik Math.max(Date.now(), prev+1), key pcp_<domain>_v_<email>) + watchDomainVersion (storage event listener, invalidate saat versi naik; e.key null = clear). Dipasang di CalendarPage (create/update/delete+drag) dan ContactsPage (create/delete). Bug ditemukan test: bump berbasis Date.now() bisa sama dalam ms sama → wajib monotonik. 51/51 test PASS, deploy live hash terverifikasi.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 4 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
