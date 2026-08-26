# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-26T01:07:44Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Audit aksesibilitas webmail: token kontras light muted-foreground 45% (4.64:1 on muted), destructive light 0 72% 46% (5.61) / dark 0 84% 58% (5.04); amber-900 session badge; star amber-600 light + amber-400 dark (3.15/13.07); spam orange-600 light (3.58); SwipeableRow butuh dark:bg-red-700 krn destructive dark 58% lightness memberi white-fg cuma 3.79:1. Touch target 44px via min-w-11/min-h-11 di toolbar/bulk/reader/sidebar. Aria: semua icon-only button butuh aria-label; toggle pakai aria-pressed; filter/move pakai aria-expanded; sender baris pesan <span onClick> → <button type=button> agar keyboard-accessible. focus-visible global outline hsl(var(--ring)) di index.css. Known limits: --border light 1.23:1 (3:1 butuh border ~75% lightness, perubahan visual besar), FLAG_COLORS yellow-500/green-500 <3:1 di light (perlu varian 600/700). Test a11y = 63 assertions (18 kontras matematis + 45 static).
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 11 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
