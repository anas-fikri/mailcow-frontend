# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-19T14:38:25Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] (selesai) build + test + deploy
- Why: Explicit next step recorded on active task.
- Source: current-task.md

## 2. [HIGH] Resolve risk: getter innerHTML <template> di linkedom tidak merefleksikan mutasi content → ganti wrapper <div> agar konsisten browser & Node.
- Why: Risk was recorded but not marked resolved.
- Source: current-task.md

## 3. [HIGH] Run or verify validation: 16/16 test PASS (baru test:tracking-pixel) · npm run build OK
- Why: Current task contains validation work that still needs explicit confirmation.
- Source: current-task.md

## 4. [MEDIUM] Follow up on discovered knowledge: linkedom = DOM Node kecil (0.18.13, zero-dep) untuk menguji fungsi DOM-based (proxyExternalImages) tanpa browser. Catatan penting: getter innerHTML pada HTMLTemplateElement di linkedom TIDAK merefleksikan mutasi content (innerHTML menyimpan salinan asli) — gunakan wrapper <div> agar serialisasi konsisten antara browser & Node. Puppeteer Chrome TIDAK ter-download (cache dir kosong) jadi bukan opsi untuk test unit DOM.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 5. [LOW] Review and commit current changes
- Why: 9 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
