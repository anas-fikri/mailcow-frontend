# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-19T14:17:46Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] (selesai) commit + push
- Why: Explicit next step recorded on active task.
- Source: current-task.md

## 2. [HIGH] Resolve risk: Smoke test gambar eksternal bersifat non-fatal (warn) — tergantung koneksi keluar server; cek SSRF guard (403) tetap deterministik/fatal.
- Why: Risk was recorded but not marked resolved.
- Source: current-task.md

## 3. [HIGH] Run or verify validation: bash -n deploy.sh OK · test:nginx-routes PASS · deploy live: SSRF 403 + gambar eksternal 200 image/png
- Why: Current task contains validation work that still needs explicit confirmation.
- Source: current-task.md

## 4. [MEDIUM] Follow up on discovered knowledge: deploy.sh verify_image_proxy() memvalidasi anti tracking-pixel secara live pasca-deploy: cek SSRF guard pakai URL internal (127.0.0.1 → wajib 403, deterministik, tanpa perlu koneksi keluar server) + smoke test gambar eksternal (non-fatal warn karena tergantung egress network). Fungsi warn() di deploy.sh sebelumnya dipanggil (ensure_ssh) tanpa definisi — latent bug, kini terdefinisi.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 5. [MEDIUM] Advance goal: Sub-goal G-001.S-002 — Documentation currency
- Why: Goal remains ACTIVE — historical deployment records are complete, but current login delivery status must remain synchronized..
- Source: goals.md

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
