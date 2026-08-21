# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-21T10:24:14Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Sanitasi kirim email: sendMessage() di api.js kini selalu DOMPurify.sanitize(body, PURIFY_CONFIG) utk isHTML sebelum dikirim (SMTP langsung, payload SOGo /send, fallback SMTP 501) — defense-in-depth di atas sanitasi ComposeModal.handleSend; guard DOMPurify.isSupported utk lingkungan tanpa DOM; test jsdom test-send-sanitize memverifikasi script/onerror/javascript:/data: href hilang + rel=noopener dipaksa + plain text tidak diubah. 40/40 test PASS.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 7 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
