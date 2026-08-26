# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-26T02:50:50Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Round performance & mobile: (1) getFlagColor hot path — getStore baca+parse localStorage utk tiap baris × per-render → cache in-memory per email + invalidate-on-write + __resetFlagColorCache utk test; (2) swipe mobile membuka pesan — onSwipe callback di SwipeableRow sebelum aksi, MailPage suppressClick utk menelan synthetic click (pola long-press). Pelajaran: hot path render bebas baca storage sinkron; gesture yang memicu aksi harus tekan synthetic click. 51/51 test PASS, deploy live hash terverifikasi.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 4 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
