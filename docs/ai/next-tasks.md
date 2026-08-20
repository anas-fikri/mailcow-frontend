# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-20T12:51:06Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [HIGH] Resolve risk: toLocaleString('id') ribuan pakai locale id-ID — browser harus mendukung ICU id.
- Why: Risk was recorded but not marked resolved.
- Source: current-task.md

## 2. [HIGH] Run or verify validation: 14/14 test PASS · npm run build OK
- Why: Current task contains validation work that still needs explicit confirmation.
- Source: current-task.md

## 3. [MEDIUM] Follow up on discovered knowledge: Indikator auto-load yang informatif: header pill menampilkan 'loaded / total' saat messages.length < totalMessageCount, dengan spinner mini ketika loadingMore. Sentinel bawah list menampilkan 'Memuat N email…' (N = Math.min(PAGE_SIZE, remainingUids.length)) ketika loadingMore, dan 'Scroll untuk memuat lagi…' saat hasMore tapi tidak ada fetch aktif. Math.min(PAGE_SIZE, remainingUids.length) = jumlah email dalam batch yang sedang di-fetch (maks 50, atau sisa bila kurang).
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 4. [LOW] Review and commit current changes
- Why: 6 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
