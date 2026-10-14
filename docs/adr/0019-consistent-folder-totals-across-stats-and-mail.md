---
status: accepted
date: 2026-08-04
---

# Consistent folder totals across Stats and Mail

- **Decision:** Treat SOGo folder metadata (`uids` when present, then explicit total fields) as the source of truth for folder counts. Keep MailPage's 250-row response cap for performance, but expose the full folder total separately.
- **Reason:** Stats previously counted the loaded message rows while Inbox/Sent displayed a capped list, causing mismatched numbers for folders larger than one page.
- **Coverage:** `npm run test:message-totals` verifies paginated UID metadata and safe null/fallback behavior.
- **Delivery:** Commit `9fa267f` was deployed and verified LIVE. Stats and MailPage share the authoritative folder total; production service health, webmail HTTP 200, live asset, and security headers passed.- **Reliability:** Because an external SIGTERM stopped `sogo-smtp-proxy` while `Restart=on-failure` treated it as a successful termination, the remote unit was backed up and changed narrowly to `Restart=always`. Six consecutive 5-second health samples remained `active/200`; port 3003/zeroclaw was not touched.

