# Current Task — Audit RulesPage: interaksi auto-archive vs snooze vs filter kategori

## Status
Selesai ✅ — 4 temuan diperbaiki, 55/55 test PASS, live di produksi, ter-push.

## Temuan & Perbaikan
1. **Klaim multi-tab pakai sessionStorage (SALAH — per-tab)** → klaim tab A tak terlihat tab B → double-move tetap terjadi. Test lama hanya simulasi satu storage bersama (lolos walau perilaku asli salah). Fix: localStorage (shared) + ownership per-instance + release hanya klaim sendiri + storage listener di MailPage (re-run engine saat klaim berubah di tab lain) + test dua-instance (cache-buster import).
2. **handleRunNow (RulesPage) memindahkan pesan yang di-snooze** → tidak konsisten dengan engine otomatis + entri snooze yatim. Fix: exclude snoozed (loadSnoozes folderINBOX) + klaim multi-tab + release own + invalidate query messages.
3. **Category tab counts termasuk pesan di-snooze** → "Promosi 5" tapi daftar 3. Fix: categorySource = messages minus snoozed.
4. **Pesan di-snooze di-arsip ulang saat bangun** → user tak pernah sempat melihat (beda Gmail: filter tidak dijalankan ulang saat wake). Fix: pesan di-snooze ditandai processed saat di-exclude.

## Next
- Verifikasi browser: dua tab akun sama (double-move), snooze → wake (pesan tetap di Inbox), run-manual tidak menyentuh pesan di-snooze, count kategori tanpa pesan tersembunyi.
- Lanjut rotasi ai-loop berikutnya dari next-tasks.md.
Status: COMPLETED
Updated At: 2026-08-26T13:44:54Z
