---
status: accepted
date: 2026-08-05
---

# Fail-closed SOGo login session proof

- **Decision:** Send native form-encoded credentials first; permit one JSON retry only when SOGo explicitly rejects the representation (400/415/422 format signals). Never retry 401/403, preventing accidental repeated password attempts and lockout amplification.
- **Decision:** Treat `/SOGo/connect` success as provisional. Accept 2xx or manual same-origin 3xx candidates, then prime the authenticated HTML shell and require `/SOGo/so/<user>/Mail/0/view` to return JSON containing `mailboxes`. This endpoint is the session proof because browser JavaScript cannot inspect `Set-Cookie`.
- **Decision:** Reject login-page markers and arbitrary upstream HTML, redact response bodies, and expose only whitelisted account/policy/transport diagnostics.
- **Coverage:** `test:login-diagnostics` and `test:login-flow` cover no-retry 403, format-only fallback, redirect candidates, HTML shell acceptance, login HTML rejection, mailbox proof, and endpoint order.
- **Delivery status:** implementation/test commits `88dcd9c` and `fe9be0b` are pushed. Production delivery is not complete: `mailserver` DNS failed and all tested SSH/web ports timed out; `deploy.sh` correctly made no production changes. Historical Round 3 LIVE entries refer only to earlier commits.

