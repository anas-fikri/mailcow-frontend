## 2026-09-02 — Mail auto-refresh fix (T-MAIL-REFRESH-2026-09-02)

- Root cause "webmail tidak menampilkan email terbaru": query `messages` tidak punya refetch otomatis (badge unseen saja yang poll 60s; `refetchOnWindowFocus: false` global di App.jsx). Email baru hanya muncul setelah ganti folder / pull-to-refresh.
- Fix di src/pages/MailPage.jsx: (1) `refetchOnWindowFocus: true` khusus query messages; (2) invalidate `['messages', token, 'folderINBOX']` (refetchType 'active') saat unseenCount naik antar poll; (3) extraMessages hasil infinite-scroll kini divalidasi terhadap `uids` fresh dari SOGo saat refetch — mencegah list loncat balik ke 50 email pertama; search aktif tidak diganggu.
- Validation: 74/74 regression scripts PASS, vite build PASS.
- Delivery: commit 3062618 di-deploy ke produksi via SERVER=deploy-mail ./deploy.sh (tanpa push); smoke test webmail 200, /api/health 200, image-proxy SSRF 403 OK. GitLab push ditunda sampai tunnel wg0 hidup (29 commit lokal menunggu, termasuk fix ini).

## 2026-08-28 — Delivery R3

- Scope: ai-toolkit documentation reconciliation and delivery metadata; no speculative application changes.
- Updated current task risk/validation plan and corrected the accessibility regression assertion to match the current conversation import and overflow-safe toolbar contract.
- Validation: full script suite rerun after the assertion correction, Vite build PASS, npm production audit PASS, backend/deploy syntax PASS, and diff check PASS.
- Delivery: commit/push/deploy status is recorded after the commands complete; no secrets are included.

## 2026-08-28T10:34:48Z
- Status: COMPLETED
- Objective: T-DELIVERY-2026-08-28-R3: update ai-toolkit documentation, commit, push, deploy
- Summary: Delivery R3: ai-toolkit documentation reconciled, commit 612d63a created, production deploy and smoke checks passed; git push remains unconfirmed because remote timed out.
- Branch: main
- Changed Files:
- No local changes detected

## 2026-09-02T14:37:06Z
- Status: COMPLETED
- Objective: T-MAIL-REFRESH-2026-09-02: webmail selalu menampilkan email terbaru (auto-refresh list)
- Summary: Webmail auto-refresh: query messages kini refetchOnWindowFocus + invalidated saat unseenCount naik (poll 60s); extraMessages lazy-load divalidasi terhadap uids fresh SOGo agar list tidak loncat. 74/74 regression PASS, build PASS. Push tertahan: tunnel wg0 ke GitLab down.
- Branch: main
- Changed Files:
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M docs/ai/knowledge.md
-  M src/pages/MailPage.jsx
