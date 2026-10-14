---
status: accepted
date: 2026-08-04
---

# Production deploy of hardening + runtime bug fixes

- **Decision:** Deployed the accumulated hardening/fix batch to production (origin/main @ `e9ecad5`). Steps taken: activated `sogo-smtp-proxy` (was inactive since 2026-07-27), corrected its `.env` `PORT=3004 → 3005` (3004 is Control Tower MCP — violates the guardrail and caused the service to crash-loop on EADDRINUSE), updated the host `server.js` (backup kept), ran `./deploy.sh` (preflight → build → rsync → nginx config with CSP headers → reload → verify 200).
- **deploy.sh bug:** `get_production_api_key` had unescaped quotes in an inline ssh string — awk always failed at build time (masked previously because preflight failed first). Fixed with the heredoc pattern used by `preflight_sogo_proxy`.
- **Deploy mechanics note (superseded 2026-08-19):** `deploy.sh` deploys `dist/` + nginx config only; the host `server.js` is updated manually via scp (keep backup `server.js.bak-YYYYMMDD`). Kini `deploy_backend()` men-sync `server.js` + `src/lib` otomatis — lihat entry 2026-08-19 di atas.

