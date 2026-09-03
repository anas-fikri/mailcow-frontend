## 2026-09-03 — Fix tanggal SOGo Indonesia: email terbaru tenggelam di bawah daftar

- Root cause "email terbaru kok 28 Agustus": sortMessagesByDate (f152e84, deploy 28 Agu) mengurutkan by parsed date, tapi RelativeDate SOGo locale Indonesia ("Hari ini 09:41", "Kamis 12:36", "28/08/2026") tak terbaca Date.parse → ts=-Infinity → pesan ≤1 minggu tenggelam; "dd/mm/yyyy" lama salah-parse month-first dan mengapung di atas. Deploy & koneksi terverifikasi baik — ini bug parsing murni.
- Fix: parseIndoRelativeDate di src/lib/dateGroups.js + tiebreak uid numerik; 16 assertion baru di scripts/test-date-groups.mjs; 75/75 regression PASS, build PASS.
- Delivery: commit 116ccb9 di-deploy ke produksi (SERVER=deploy-mail ./deploy.sh, 2026-09-03); chunk tersaji produksi terverifikasi memuat parser baru. Push GitLab tetap menunggu tunnel wg0.

## 2026-09-02 — Cross-tab sync domain 'mail'

- Scope: multi-tab webmail — mutasi mailbox di tab A (delete/move/flag/read/junk/folder/kirim) kini memicu invalidate + refetch di tab B. Bump versi dipasang di layer api.js (bumpMailVersion setelah mutasi sukses); MailPage memasang watchDomainVersion('mail') → invalidate messages/unseen/folders.
- Validation: scripts/test-mail-crosstab.mjs baru (bump/scope/watcher/fail-no-bump), 75/75 regression PASS, vite build PASS.
- Delivery: commit 4a1e606 di-deploy ke produksi via SERVER=deploy-mail ./deploy.sh (2026-09-02): webmail HTTP 200, /api/health 200 end-to-end, image-proxy SSRF 403 OK, backend unchanged (skip restart). Push GitLab tetap ditunda sampai tunnel wg0 hidup (31 commit lokal menunggu).

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

## 2026-09-03T07:28:42Z — Login blocked: force_pw_update mass-flag (investigasi + remediasi)
- Status: COMPLETED
- Objective: user mendapat 'Akun diwajibkan mengganti password' walau sudah reset password dari control-tower
- Akar masalah: operasi massal 22 Aug 14:14-14:15 UTC menyalakan attributes.force_pw_update=1 di 79 akun; flag memblokir login SOGo walau password benar; reset password via API TIDAK menghapus flag (terbukti eksperimen mailbox kontrol diag2: flag=1+pw benar → 403; pw diganti API → tetap 403; flag di-clear → 200). SOGo juga memakai error yang sama untuk password salah → pesan SPA lama menyesatkan.
- Remediasi: (1) 79/79 flag di-clear via API edit/mailbox, sisa 0 — user terdampak bisa login lagi setelah refresh _sogo_static_view (~5 menit). (2) Commit a6b0142: pesan login 'password salah ATAU flag wajib ganti password' + CTA edukatif; 75/75 regression PASS; deployed via SERVER=deploy-mail ./deploy.sh (semua gate hijau).
- Catatan operasional: mailbox diag2/diagx@pcpexpress.co.id di-disable (API key RO tidak bisa delete — perlu dihapus manual via dashboard bila mau bersih). 35 commit lokal ahead origin/main menunggu tunnel wg0.
- Changed Files: src/lib/loginDiagnostics.js, scripts/test-login-diagnostics.mjs, docs/ai/*, ai-state.json
