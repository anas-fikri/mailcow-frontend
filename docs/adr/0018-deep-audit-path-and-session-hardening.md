---
status: accepted
date: 2026-08-04
---

# Deep audit path and session hardening

- **Decision:** Validate every dynamic SOGo URL segment through `src/lib/pathSegment.js`; permit `%2F` only for folder IDs required by nested mailboxes, reject all other percent escapes and traversal delimiters. This prevents a downstream URL decoder/proxy from turning encoded input into path traversal.
- **Decision:** Treat 401/403 as session-expiry signals consistently across read and mutation APIs. Only non-auth failures may return safe empty fallbacks for optional counts/lists.
- **Decision:** Keep `/api/health` metadata-minimal, rate-limit SMTP revocation, and return generic SMTP transport errors to clients while retaining server-side diagnostics.
- **Coverage:** Add `npm run test:path-segment`; the test is force-added because the legacy `test-*` ignore rule otherwise excludes it.
- **Delivery:** Commit `6cf66dd` and docs commit `dae9855` are on `origin/main`. After the default alias failed DNS, deployment used the verified SSH route `202.148.2.139:22` through a temporary wrapper. The remote unit was backed up, stale `PORT=3003` was corrected to `3005`, and `./deploy.sh` completed successfully. Post-deploy service, health, webmail, and security headers were verified LIVE; unrelated port-3003 `zeroclaw` was left untouched.

