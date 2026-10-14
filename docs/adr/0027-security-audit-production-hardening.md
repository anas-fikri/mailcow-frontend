---
status: accepted
date: 2026-08-06
---

# Security Audit: Production Hardening

- **Decision (ErrorBoundary):** Hide `error.message` and `componentStack` behind `import.meta.env.DEV` guard.
- **Reason:** Error details in production UI leak internal module paths and stack traces to any user who triggers a render error.
- **Decision (api.js logging):** Wrap all `[DEBUG]` and `[Login]` console.log/warn calls with `debugLog()`/`debugWarn()` — no-op in production.
- **Reason:** 15+ debug statements exposed request status, folder state, and vacation preferences in the browser console.
- **Decision (deploy.sh):** Replace URL-embedded GitLab token with `git -c credential.helper` using `$GIT_TOKEN` env var.
- **Reason:** Token in URL appears in `ps aux` process listing on macOS and Linux.
