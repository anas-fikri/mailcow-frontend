# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-26T02:29:57Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Race multi-tab diperbaiki: (1) snooze sync via storage event listener (key pcp_snooze_v3/v2 + clear) → bump snoozeTick — event 'storage' hanya fire di tab lain; (2) auto-archive double-move dicegah via claimAutoArchiveUids (sessionStorage per-tab, TTL 5 mnt) + releaseAutoArchiveClaims; rulesProcessed hanya utk pesan yang benar-benar dipindah; (3) notifikasi sudah dedup via Notification tag. Pelajaran: sessionStorage utk klaim lintas tab (auto-clean saat tab tutup), storage event utk sync UI. 50/50 test PASS, deploy live hash terverifikasi.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 4 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
