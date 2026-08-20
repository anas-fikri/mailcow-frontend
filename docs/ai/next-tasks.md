# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-20T12:53:40Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [HIGH] Resolve risk: Folder dengan ribuan email (Sent) akan auto-fetch semua header — bisa
- Why: Risk was recorded but not marked resolved.
- Source: current-task.md

## 2. [HIGH] Run or verify validation: 14/14 test PASS · npm run build OK
- Why: Current task contains validation work that still needs explicit confirmation.
- Source: current-task.md

## 3. [MEDIUM] Follow up on discovered knowledge: Auto-load server-side (MailPage.jsx via IntersectionObserver + /headers) memang universal untuk SEMUA folder (folderINBOX/folderSent/folderJunk/folderDrafts/folderTrash). Pengecekan 'selectedFolder === folderINBOX' hanya 4 lokasi: notifikasi email baru (INBOX saja), batas 5 bulan stopFetchingRef (INBOX saja — penghematan memori), tombol snooze per-baris (INBOX saja), dan beda copy footer (bukan gate). loadMore + sentinel + header pill + count indicator tidak punya pengecualian folder. fetchMessageHeaders sudah diuji utk 5 folder (test:message-api) — semuanya testify POST /Mail/0/{folder}/headers body {uids:[...]}.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 4. [LOW] Review and commit current changes
- Why: 7 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
