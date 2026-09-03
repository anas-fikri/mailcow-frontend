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

## 2026-09-03T14:53:58Z — Audit fitur Calendar + E2E produksi: 2 bug fix
- Status: COMPLETED & DEPLOYED
- Scope: analisa fitur-per-fitur CalendarPage (3 view, navigasi, CRUD, recurrence scope single/all, drag&drop, prefs first-day, crossTab) + audit keamanan + E2E via replika request SPA di produksi (diag2).
- BUG 1 (kritis): eventsblocks SOGo 5.12 kirim baris di `events` bukan `blocks` → kalender SELALU kosong. Fix parser terima keduanya (6c8f731).
- BUG 2: recid sudah berprefix `occurence…` → prefix ganda → edit/hapus SATU occurrence selalu 404. Fix occurrenceSegment idempotent + parser pertahankan string.
- E2E lain PASS: create/edit/view/delete event, delete satu occurrence (204), delete seri, IDOR GUID acak 404, negative end<start diterima server (validasi UI wajib).
- Keamanan: render aman (React, tanpa innerHTML), auth cookie httpOnly + XSRF, tidak ada cross-user leak. 76/76 regression PASS, deploy hijau, chunk terverifikasi.

## 2026-09-03T14:10:00Z — Backlog drafts crossTab + audit path lengkap
- Status: COMPLETED & DEPLOYED
- Audit semua endpoint ber-parameter folder di api.js: hanya moveMessages yang kirim destination di body (sudah di-fix c320f20); createFolder/deleteFolder/view/headers/batchDelete/junk/compose aman (URL /Mail/0/{folderId}).
- Backlog #2 selesai: saveDraft/deleteDraft kini men-bump versi crossTab 'mail' (commit 6ca0b6c) — folder Drafts ikut sync antar tab; bump hanya setelah sukses. test-mail-crosstab diperluas (drafts bump + gagal tidak bump). 76/76 regression PASS, build PASS, deploy hijau, served chunk terverifikasi (n.ok&&bump).
- next-tasks.md diregenerasi (backlog draft done; push 42 commits menunggu wg0 stabil).

## 2026-09-03T13:40:00Z — Verifikasi replay alur aturan + audit path + status push
- Status: COMPLETED (push masih tertunda)
- Audit path SOGo: hanya moveMessages yang memakai destination-di-body — createFolder/deleteFolder/view/headers/batchDelete/junk aman (semua lewat URL /Mail/0/{folderId}, segmen akun sudah benar).
- Replay alur aturan end-to-end via diag2: seed 2 pesan → createFolder (204) → moveMessages 2 uid ke /0/folderINBOX/folderMvTest (200) → doveadm konfirmasi fisik: pesan pindah ke INBOX/MvTest, uid lain tetap di INBOX. Cleanup selesai (folder dihapus, diag2 di-disable).
- Push GitLab: wg0 flapping — fetch sempat sukses, lalu peer dead (ping 100% loss, TCP443 timeout), push timeout di 135s. Local main AHEAD 40 commit. Push ulang saat tunnel kantor stabil.

## 2026-09-03T13:17:54Z — Fix 500 "Cannot copy messages to other account" pada semua move
- Status: COMPLETED & DEPLOYED
- Objective: user dapat 500 saat run aturan (RulesPage) — "Cannot copy messages to other account"
- Akar masalah: moveMessages SPA mengirim destination `folder` = /{email}/folderX; SOGo membandingkan segmen pertama dengan nameInContainer akun sumber ("0") → dianggap cross-account → 500. Semua jalur move terdampak (rules engine, run manual, drag&drop, archive, quick move, move-to-trash via moveMessages).
- Fix: toSogoAbsPath kembali "' + '/' + '0/'" + cssId (src/lib/api.js) + test scripts/test-move-path.mjs; bukti live di server: format email → 500 persis, format 0 → 200 + pesan pindah folder.
- Validasi: 76/76 regression PASS, build PASS, commit c320f20, deploy hijau, served chunk terverifikasi memuat "return`/0/`+t.split".
- Catatan: diag2 dipakai untuk eksperimen (password doveadm-hash, login 200) lalu di-disable kembali; folder MvTest dihapus.
- Changed Files: src/lib/api.js, scripts/test-move-path.mjs, docs/ai/*
