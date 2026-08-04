# Goals & Sub-goals

## Goal G-001 — Secure, maintainable webmail SPA

Status: ACTIVE
Owner: dev team (anas.fikri)
Success criteria:
  - npm audit reports 0 known vulnerabilities for production dependencies.
  - No unescaped HTML from email content reaches DOM sinks (innerHTML/document.write) without DOMPurify.
  - All API endpoints require the API key and are rate-limited per real client.
  - Production webmail is served with CSP + clickjacking headers.

### Sub-goal G-001.S-001 — Security audit & remediation (2026-08-04)

- Status: COMPLETE (code), DEPLOY PENDING
- Success criteria:
  - XSS via print window and reply/forward quote eliminated (escape all header values; sanitized quote body).
  - react-router upgraded to 8.3.0 → `npm audit` 0 vulnerabilities (was 2 high, GHSA-qwww-vcr4-c8h2).
  - Rate limiting keyed by real client IP; timing-safe API key comparison.
  - CSP/nosniff/XFO/Referrer-Policy added to nginx config.
  - Committed credential file (`sogo_test.py`) removed from the tree; password rotation + history scrub flagged.
- Validation: `npm run build` ✅, `npm run test:safe-url` ✅, `node --check server.js` ✅, `bash -n deploy.sh` ✅, `git diff --check` ✅, dev smoke test (login render + route guard) ✅.
- Deploy: commit + push completed (origin/main @ b7f7fa0). Production deploy blocked by mailserver SSH connectivity; rerun `./deploy.sh` when `mailserver` (202.148.2.141:2002) is reachable and `sogo-smtp-proxy` is active on port 3005.

### Sub-goal G-001.S-002 — Documentation currency

- Status: ACTIVE
- Success criteria: docs/ai files reflect verified surfaces, decisions, and handoff after every significant task.
