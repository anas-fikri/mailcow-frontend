# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-19T10:30:44Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Lampiran: URL /SOGo/ same-origin bisa di-fetch credentials:'include' lalu blob + anchor download (hindari popup blocker/N tab). SOGo size part = string '1.2 MB' → parseSizeToBytes (B/KB/MB/GB/TB/KiB/MiB/GiB/TiB + koma desimal) utk total ukuran. Ikon tipe file via lucide File* family + getFileKind (ext + contentType).; Infinite scroll inbox: IntersectionObserver + sentinel bawah list; batas 5 bulan filter client-side parseMessageDate (date SOGo = ISO/RFC/literal/epoch). SOGo list view default ~250 row — pagination server-side butuh offset/limit (buildMessageViewBody sudah dukung limit+offset).; scripts/test-*.mjs ke-gitignore (rule test-*) tapi test files tetap di-commit di repo ini (test-mailbox-tree/message-html) → pakai git add -f utk test baru.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [MEDIUM] Advance goal: Sub-goal G-001.S-002 — Documentation currency
- Why: Goal remains ACTIVE — historical deployment records are complete, but current login delivery status must remain synchronized..
- Source: goals.md

## 3. [LOW] Review and commit current changes
- Why: 9 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
