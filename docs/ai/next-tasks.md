# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-20T11:44:31Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [HIGH] Resolve risk: /headers membalas baris dalam urutan IMAP (bukan urutan request) → merge di-sort
- Why: Risk was recorded but not marked resolved.
- Source: current-task.md

## 2. [HIGH] Run or verify validation: 14/14 test PASS · npm run build OK
- Why: Current task contains validation work that still needs explicit confirmation.
- Source: current-task.md

## 3. [MEDIUM] Follow up on discovered knowledge: SOGo /view membalas daftar UID lengkap (data.uids) tapi hanya mem-prefetch ~100 header (headersPrefetchMaxSize=100). Header sisanya diambil via POST /Mail/0/{folder}/headers body {uids:[...]} yang membalas ARRAY BARE [columnNames, ...rows] (bukan {headers:[...]}), dalam urutan IMAP (tidak sesuai urutan request) — jadi wajib di-sort ulang by uid desc di client sebelum reveal. Endpoint /headers menolak uids kosong dgn 404 {message:'No UID specified'}. getMessageTotal pakai data.uids.length. auto-load kotak masuk sekarang server-side (lewat 100) dgn batas 5 bulan via stopFetchingRef.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 4. [LOW] Review and commit current changes
- Why: 8 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
