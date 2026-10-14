---
status: accepted
date: 2026-08-05
---

# Migration Portal Auth: bcryptjs against Mailcow admin table

- **Decision:** Replaced Mailcow API + MySQL fallback auth in migration portal with bcryptjs-based password verification against the `admin` table.
- **Reason:** The previous approach had two failure modes: (1) Mailcow API `/api/v1/get/status/containers` rejects Basic Auth — requires X-API-Key; (2) MySQL fallback had SQL quoting bugs and `$` sign escaping issues. bcryptjs provides a direct, reliable, and consistent comparison with zero network dependency.
- **Guardrail:** Queries `admin` WHERE `superadmin=1 AND active=1 LIMIT 1`. Passwords stored as `{BLF-CRYPT}$2y$...` are parsed and verified via `bcrypt.compareSync()`.

