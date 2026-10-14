---
status: accepted
date: 2026-08-05
---

# Exact Nginx routing for webmail authentication

- **Decision:** Use exact-match Nginx locations for webmail `/api/health`, `/api/auth/smtp`, `/api/preferences`, and `/api/send`; do not use one broad regex that can overlap with Control Tower's `/api` regex routes.
- **Reason:** Nginx's overlapping regex configuration sent public webmail API requests to the wrong backend. The SOGo proxy on 3005 correctly requires the API key, but public behavior previously matched the Control Tower route (health open and SMTP unauthorized), causing login to fail during SMTP session registration.
- **Guardrail:** Port 3003/zeroclaw remains unrelated and untouched. The route regression test asserts each exact location's proxy target in both source config and deploy template.
- **Delivery:** `e1fb7a6` deployed; valid-key public health/SMTP dummy probes return 200, missing/bad-key probes return 403.

