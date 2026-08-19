# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-19T14:26:56Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] (selesai) build + test + deploy
- Why: Explicit next step recorded on active task.
- Source: current-task.md

## 2. [HIGH] Resolve risk: Vektor srcset/<picture>/CSS background-image sebelumnya hanya diblokir CSP (fail-closed); kini di-rewrite aktif agar gambar tetap tampil + IP tetap aman.
- Why: Risk was recorded but not marked resolved.
- Source: current-task.md

## 3. [HIGH] Run or verify validation: 15/15 test PASS (test:image-proxy diperluas) · npm run build OK · bundle memuat logika srcset
- Why: Current task contains validation work that still needs explicit confirmation.
- Source: current-task.md

## 4. [MEDIUM] Follow up on discovered knowledge: DOMPurify EMAIL_PURIFY_CONFIG sudah mengizinkan tag picture/source + srcset, jadi HTML email bisa memuat gambar via srcset dan <picture><source>; rewrite berbasis DOM API (template.content.querySelectorAll) aman dari injection. rewriteSrcset harus mempertahankan whitespace asli antar kandidat (split koma) dan hanya rewrite kandidat http(s). rewriteCssUrls pakai regex url(...) dengan backreference quote agar quote asli dipertahankan.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 5. [LOW] Review and commit current changes
- Why: 7 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
