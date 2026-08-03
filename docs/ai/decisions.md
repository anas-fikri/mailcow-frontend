# Decision Log

## 2026-08-01T07:08:00Z Initial AI Protocol Setup
Status: Accepted
Context: Standardized AI-readable project context was initialized.
Decision: Store shared project context under `docs/ai/` and automation config under `.ai-toolkit/project.env`.
Consequences: Any AI tool can resume work by reading repository-local context first.


## 2026-08-03 — Isolate SOGo SMTP Proxy from Control Tower

- **Decision:** Use host port `3005` for `sogo-smtp-proxy`; reserve `3003` for Control Tower API and `3004` for Control Tower MCP.
- **Reason:** Production Nginx had been routing SOGo `/api/*` to Control Tower MCP on `3004`, while the SOGo service was inactive.
- **Guardrail:** `deploy.sh` performs an authenticated `/api/health` preflight on the dedicated port before build, commit, push, or rsync.
- **Credential handling:** The browser build receives `VITE_API_KEY` from the deployment environment; when absent locally, `deploy.sh` reads `API_KEY` from the remote SOGo service `.env` only during the build and never writes it to Git.
- **Operational constraint:** This task does not install, restart, or modify production services.
