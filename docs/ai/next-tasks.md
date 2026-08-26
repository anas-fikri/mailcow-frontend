# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-26T01:49:00Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Security refresh: (1) rate-limit /api/send harus per-AKUN bukan per-IP — kantor/NAT berbagi 1 IP publik, key IP = 10 kirim/mnt tersedot semua user (429 palsu). Pola: middleware resolveSmtpSession (isi req.smtpSession tanpa 401) sebelum rateLimit, keyFn (req)=>req.smtpSession?.user
- Why: |clientIp(req); handler reuse req.smtpSession; JANGAN hapus log '[smtp-session] 401 send' (monitor-smtp.sh grep '401 send'). (2) Query pencarian ke SOGo wajib di-cap (MAX_SEARCH_QUERY_LENGTH=500 di buildMessageSearchBody + maxLength input) — body /view tanpa batas = DoS ringan ke SOGo. Pola tetap kuat: clientIp hanya percaya X-Real-IP dari trusted proxy; pathSegment anti-traversal (hanya %2F utk folder); attachment filename anti-path/CRLF; toSafeUrl allowlist; /api/preferences bind session.user (403 mismatch); API key timing-safe; cookie httpOnly SameSite=Strict.|Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 9 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
