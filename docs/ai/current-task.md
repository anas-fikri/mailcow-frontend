# Current Task

Status: COMPLETED
Task ID: 20260903-LOGIN-FLAG
Started At: 2026-09-03T06:30:00Z
Updated At: 2026-09-03T07:28:42Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
T-LOGIN-FLAG-2026-09-03: user mendapat "Akun diwajibkan mengganti password sebelum dapat login" padahal sebelumnya bisa login; reset password dari control-tower tidak berpengaruh.

## Goal Link
Goal ID: G-001
Sub-goal ID: G-001.S-011 (lanjutan freshness/availability mail)

## Files Involved
- src/lib/loginDiagnostics.js (pesan error login)
- scripts/test-login-diagnostics.mjs (regresi pesan)
- produksi mailcow: mailbox.attributes (force_pw_update), _sogo_static_view
- docs/ai/knowledge.md, docs/ai/handoff.md, ai-state.json

## Root Cause (chain of evidence)
1. Operasi massal 2026-08-22 14:14–14:15 UTC menyalakan `attributes.force_pw_update=1` di **79 akun** (passwd_update semua nol di 14:14–14:15).
2. Flag itu **memblokir login SOGo walau password benar** — dibuktikan mailbox kontrol diag2: flag=1+pw benar → 403; pw direset via API → **tetap 403** (reset TIDAK menghapus flag); flag di-clear → 200.
3. SOGo mailcow mengembalikan `LDAPPasswordPolicyError 65535` untuk SEMUA kegagalan auth (password salah pun sama) → pesan SPA lama "Akun diwajibkan mengganti password" menyesatkan.
4. Keluhan "control-tower tidak berpengaruh" = reset password memang tidak pernah menghapus flag ini (perilaku mailcow, bukan bug sync).

## Remediation (2026-09-03)
- 79/79 flag di-clear via API `edit/mailbox` (`force_pw_update=0`), verifikasi DB: sisa **0**. User terdampak bisa login setelah `_sogo_static_view` refresh (~5 menit).
- Commit `a6b0142`: pesan login direvisi → "password salah ATAU flag wajib ganti password" + CTA menjelaskan reset password tidak menghapus flag. 75/75 regression PASS, build PASS, deployed (semua gate hijau).

## Validation
- scripts/test-login-diagnostics.mjs + 74 lainnya: 75/75 PASS
- vite build PASS; produksi HTTP 200, /api/health 200, image-proxy 403/200
- Eksperimen kontrol diag2: flag=1 → 403; clear flag → 200 (setelah refresh static view)

## Follow-up
- Mailbox diag diag2/diagx@pcpexpress.co.id di-disable — hapus manual via dashboard (API key RO tidak bisa delete).
- 35 commit lokal ahead origin/main — push menunggu tunnel wg0.
