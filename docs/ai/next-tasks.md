# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-26T01:39:42Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Validasi recipient compose: ComposeModal hanya guard to wajib, format invalid lolos sampai server (400 generik). Fix: firstInvalidRecipient(value) di src/lib/emailValidation.js — entri pertama tidak valid dlm daftar dipisah koma (null bila valid), reuse isSafeRecipient (anti CRLF/header injection, support 'Nama <email>'); guard handleSend validasi Kepada/Cc/Bcc berurutan dgn pesan 'Alamat email tidak valid di "<field>": "<addr>". Gunakan format nama@domain.com.'; koma/spasi trailing diterima (filter Boolean); server tetap validasi ulang (validateRecipientList) — defense-in-depth dua lapis.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 7 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
