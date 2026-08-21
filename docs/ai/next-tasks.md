# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-21T09:29:56Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [HIGH] Run or verify validation: 35/35 test PASS (termasuk test:settings-signature + test:signatures baru)
- Why: Current task contains validation work that still needs explicit confirmation.
- Source: current-task.md

## 2. [MEDIUM] Follow up on discovered knowledge: Settings crash root cause terkonfirmasi: sig.html.length pada entri signature legacy (tanpa field html) di localStorage -> TypeError -> ErrorBoundary root. Fix: guard optional chaining + normalisasi entri di loadSignatures + SectionErrorBoundary per-tab. Repro jsdom end-to-end (test-settings-signature.mjs) + unit test legacy. Teknik verifikasi: deployed chunk == HEAD via normalisasi nama chunk; VITE_API_KEY di-bake saat build membuat semua hash chunk berubah.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 3. [LOW] Review and commit current changes
- Why: 10 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
