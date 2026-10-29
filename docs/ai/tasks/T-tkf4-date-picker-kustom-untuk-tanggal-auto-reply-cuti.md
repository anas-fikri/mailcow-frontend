---
id: T-tkf4
title: Date picker kustom untuk tanggal Auto-Reply Cuti
status: in_progress
profile: standard
profile_pinned: true
created: "2026-10-29T04:28:48Z"
updated: "2026-10-29T04:28:48Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-fix-dup-rules
base: 35397f785ce74a3f31464a3c54a41314646dbf1d
---

## Objective
Ganti input type=date native di form Auto-Reply Cuti dengan date picker kustom (popover kalender Indonesia, pilih rentang mulai-selesai, keyboard accessible, mode gelap/terang, mobile friendly).

## Acceptance criteria
- [ ] Given form Auto-Reply Cuti, when user klik field tanggal, then muncul kalender popover berbahasa Indonesia untuk memilih rentang mulai-selesai
- [ ] Given tanggal dipilih via picker, when disimpan, then nilai tersimpan sama seperti sebelumnya (format YYYY-MM-DD → epoch lokal) dan validasi tetap jalan
- [ ] Given keyboard saja, when navigasi picker, then tanggal bisa dipilih dengan panah/Enter dan Esc menutup

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
