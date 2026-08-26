# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-26T14:18:10Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Drag scope occurrence kalender: drag SATU kejadian event berulang kini memindahkan hanya kejadian itu (exception RECURRENCE-ID via segmen occurence{ts}), bukan seluruh seri — konsisten dengan fitur edit/hapus occurrence. Implementasi: handleDragStart menyimpan { ev, series: !!e.shiftKey } (semua view meneruskan native event drag), handleDrop mengirim payload editScope 'single' + occurrenceId + repeat null + repeatTouched false saat occurrence && !series; Shift+drag mempertahankan jalur lama (pindah seri, repeat master di-resolve via /view). Pelajaran: konsistensi scope (edit/hapus/drag) pada recurring event penting — semua gesture harus default scope single utk occurrence, dengan jalur eksplisit (Shift) utk seluruh seri. 149 a11y assertions, 55/55 PASS.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 4 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
