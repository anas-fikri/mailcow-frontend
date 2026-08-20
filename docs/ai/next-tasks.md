# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-20T13:40:25Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [HIGH] Resolve risk: Browser lama tdk dukung SVG favicon → fallback ke default ikon browser
- Why: Risk was recorded but not marked resolved.
- Source: current-task.md

## 2. [HIGH] Resolve risk: RGB-mismatch dengan theme user yang bukan default (theme hue configurable).
- Why: Risk was recorded but not marked resolved.
- Source: current-task.md

## 3. [HIGH] Run or verify validation: 18/18 test PASS
- Why: Current task contains validation work that still needs explicit confirmation.
- Source: current-task.md

## 4. [MEDIUM] Follow up on discovered knowledge: Favicon SVG envelope: viewBox 0 0 64 64, bg #3b82f6 (Tailwind blue-500, default primary), envelope putih outline + V-flap. Path: public/favicon.svg → dist/favicon.svg via Vite. index.html: <link rel=icon type=image/svg+xml href=/webmail/favicon.svg> + <link rel=apple-touch-icon href=/webmail/favicon.svg> + <meta name=theme-color content=#3b82f6>. SVG 582 bytes; modern browser support tanpa ICO fallback.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 5. [LOW] Review and commit current changes
- Why: 7 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
