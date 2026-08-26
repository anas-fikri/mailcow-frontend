# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-26T03:04:32Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Pola cache in-memory per-email untuk storage yang dibaca di hot path (getFlagColor → getRules/getRuleSummary): cache miss = ≤2 baca localStorage (fallback v2+v1), hit = 0. Invalidate di SEMUA jalur tulis modul (audit via grep localStorage.setItem/removeItem; executeRules bump runCount lewat updateRule ikut invalidate). Trap test: storage.setItem/clear() mentah tidak invalidate cache → wajib __reset*Cache. ReadStorage 1 call = 1-2 getItem, assertion read-count pertama harus toleran.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 4 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
