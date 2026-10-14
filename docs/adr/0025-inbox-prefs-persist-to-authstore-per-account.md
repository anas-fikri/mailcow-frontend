---
status: accepted
date: 2026-08-05
---

# Inbox Prefs: Persist to authStore (per-account)

- **Decision:** `sortAsc` and `conversationView` moved from local `useState` to `authStore` with `persistPrefs()` → per-account localStorage (`pcp-prefs-<email>`).
- **Reason:** Preferences survive logout/login and are scoped per email account.

