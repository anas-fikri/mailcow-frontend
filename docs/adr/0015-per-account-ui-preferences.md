---
status: accepted
date: 2026-08-04
---

# Per-account UI preferences

- **Decision:** UI preferences (theme light/dark, `themeColor`, `sortAsc`, `conversationView`) are stored per account in `localStorage` key `pcp_prefs_<email>` (via new `src/lib/userPrefs.js`, same pattern as `autoArchive`/`flagColors`). `setUser` loads the account's stored prefs on login; `clearUser` no longer resets them; every preference setter persists to the active account.
- **Why:** prefs previously lived in one global zustand key and were reset on logout/login/session-expiry, and accounts on a shared browser overwrote each other's settings.
- **Behavior notes:** a brand-new account gets an isolated default profile immediately on successful login (it never inherits the previous account's theme); returning accounts load their own profile. Preference keys normalize the email to lowercase/trimmed form. The global `pcp-auth` persist may still hold the anonymous login-screen fallback, but it is never used to initialize another account.

