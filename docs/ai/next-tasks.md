# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-09-07T01:18:52Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: uteke setup on this host: prebuilt tarball lacks libonnxruntime.so — copy onnxruntime-linux-x64-1.24.4/lib/libonnxruntime.so* next to the binary in ~/.local/bin or embedding fails with ORT_LIB_PATH error; default recall strategy 'fusion' scores single-memory namespaces below the 0.30 default min_score → set min_score = 0.05 in ~/.codecora/uteke/uteke.toml or recall returns 'No matching results' despite a healthy index; embedding model (~188MB) downloads on first remember; ai-toolkit namespace comes from UTEKE_NAMESPACE in project.env (= sogo-frontend)
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 4 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"

## 3. [MEDIUM] Tambahkan informasi quick chat dashboard sebagai card di webmail (pending dependency)
- Why: Permintaan user (2026-09-07): informasi dari quick chat dashboard akan ditampilkan dalam bentuk card di webmail. **Blocked** sampai modifikasi quick chat dashboard selesai.
- Source: user request
