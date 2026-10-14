---
status: accepted
date: 2026-08-05
---

# Explicit SOGo message rows for all mailbox folders

- **Decision:** Always send the same explicit `SOGO_MESSAGE_HEADERS` list for mailbox view/search requests; the folder remains a URL path parameter, so Inbox, Sent, Junk, Trash, and custom folders share one response contract.
- **Reason:** Some SOGo configurations returned `uids` and totals without `headers` rows when columns were omitted, leaving the UI empty while Stats still showed a nonzero count.
- **Parser contract:** Prefer named-column mapping, retain positional fallback only when no column row exists, treat missing optional columns as absent, and support array or singleton address values.
- **Coverage:** `test:message-rows` covers reordered/missing columns; `test:message-requests` covers payload builders; `test:message-api` mocks `fetchMessages`/`searchMessages` across Inbox/Sent/Junk/Trash and verifies paginated `uids` totals.
- **Delivery:** Commit `d86ed2c` was pushed and deployed. Production webmail returned HTTP 200 with CSP/nosniff/XFO/Referrer-Policy, proxy health was authenticated `200`, and 6/6 stability samples were `active/200`. The live asset is `index-CVQcTv-t.js`; browser-level account verification remains pending because Chrome is unavailable here.

