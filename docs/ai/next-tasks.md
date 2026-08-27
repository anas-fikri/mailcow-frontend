# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-27T02:48:30Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Nginx: expires -1 menghasilkan Cache-Control: no-cache + header Expires terpisah — bila blok lokasi JUGAA punya add_header Cache-Control sendiri, hasilnya DUA header Cache-Control dgn nilai berbeda (no-cache + no-store) yg membingungkan parser header. Utk SPA no-store cukup satu add_header Cache-Control; jangan kombinasikan dgn expires -1. Validasi: curl -sI index.html 
- Why:  grep -c cache-control harus 1.|Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 4 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
