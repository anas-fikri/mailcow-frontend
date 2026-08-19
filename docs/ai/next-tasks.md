# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-19T14:22:30Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] (selesai) commit + push
- Why: Explicit next step recorded on active task.
- Source: current-task.md

## 2. [HIGH] Resolve risk: Entry historis di decisions.md dipertahankan sebagai audit history (tidak ditulis ulang), hanya ditandai superseded.
- Why: Risk was recorded but not marked resolved.
- Source: current-task.md

## 3. [HIGH] Run or verify validation: git diff --check OK · tidak ada sisa klaim "BLOCKED/NOT LIVE"/"does not resolve locally" yang menyesatkan
- Why: Current task contains validation work that still needs explicit confirmation.
- Source: current-task.md

## 4. [MEDIUM] Follow up on discovered knowledge: Alias SSH produksi kini 'deploy-mail' (SERVER=deploy-mail ./deploy.sh); 'mailserver' tidak lagi resolve dari workspace. docs/ai sempat basi: masih mengklaim deploy BLOCKED/NOT LIVE dan CSP img-src 'self' data: https: — sudah dikoreksi ke state LIVE (HEAD 2feb96c). Decision log bersifat historis: entry lama dipertahankan dan hanya ditandai superseded, bukan ditulis ulang.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 5. [LOW] Review and commit current changes
- Why: 9 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
