# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-20T11:12:57Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] ai-close + commit + push + deploy
- Why: Explicit next step recorded on active task.
- Source: current-task.md

## 2. [HIGH] Resolve risk: Kontrak `repeat.days` harus array `[{day:'MO'}]` (iCalByDayMask byDayMaskWithDaysAndOccurrences)
- Why: Risk was recorded but not marked resolved.
- Source: current-task.md

## 3. [HIGH] Run or verify validation: 20/20 test PASS · npm run build ✅
- Why: Current task contains validation work that still needs explicit confirmation.
- Source: current-task.md

## 4. [MEDIUM] Follow up on discovered knowledge: SOGo recurrence: repeat.days adalah array [{day:'MO'}...] (2-huruf BYDAY MO..SU), dikonsumsi iCalByDayMask byDayMaskWithDaysAndOccurrences:o di iCalRepeatableEntityObject+SOGo.m setAttributes:. 'hari kerja saja' = weekly + days [MO..FR]. EventModal kini punya day-picker mingguan; dayCodeFromDate parse YYYY-MM-DD manual agar tak meleset di timezone belakang UTC.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 5. [LOW] Review and commit current changes
- Why: 7 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
