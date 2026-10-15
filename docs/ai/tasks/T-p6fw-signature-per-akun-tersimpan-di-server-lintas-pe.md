---
id: T-p6fw
title: Signature per akun tersimpan di server (lintas perangkat)
status: in_progress
profile: standard
profile_pinned: true
created: "2026-10-15T09:17:09Z"
updated: "2026-10-15T09:17:09Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-fix-dup-rules
base: 38deeae3b1ec1ed344eebf3115f9ebe7e14e0346
---

## Objective
Pindahkan multi-signature (daftar + default email baru/balasan) dari localStorage ke preferensi akun SOGo (c_defaults) agar sama di semua perangkat/browser; migrasi otomatis signature lokal lama; SOGoMailSignature tetap disinkronkan utk kompatibilitas.

## Acceptance criteria
- [ ] Given signature dibuat di satu perangkat, when login di perangkat/browser lain, then daftar signature & default-nya sama
- [ ] Given signature lama di localStorage, when pertama kali login setelah update, then dimigrasi ke server tanpa duplikat & tanpa kehilangan
- [ ] Given menyimpan signature, when disimpan, then preferensi lain (Vacation/Forward/Aturan) utuh

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
