# Current Task

## Task: ai-loop rotasi search flow (window 5 bulan, rules, snooze, kategori)

**Status: SELESAI — 4 bug interaksi search diperbaiki, 53/53 test PASS, live build terverifikasi.**

## Konteks
Rotasi ai-loop fokus **search flow** — interaksi pencarian server-side dengan
window Kotak Masuk, auto-archive rules, snooze, dan filter kategori.

## Bug & Fix (semua di src/pages/MailPage.jsx + helper baru)

### Bug 1 — Search di INBOX tetap terbatas 5 bulan
`messagesInWindow` menerapkan potongan MESSAGE_WINDOW_MONTHS saat
`selectedFolder === 'folderINBOX'` TANPA mengecualikan mode search. Padahal UI
menjanjikan "Email lebih lama bisa dicari" — tapi hasil pencarian di INBOX
ikut dipotong 5 bulan → email lama TETAP tak bisa ditemukan.
**Fix:** `if (searchQuery || selectedFolder !== 'folderINBOX') return messages;`
+ helper murni `applyMessageWindow(messages, {months, now})` di dateGroups.js
(pola lib testable — unparseable dianggap dalam window).

### Bug 2 — Auto-archive rules dieksekusi saat mode search
Effect `executeRules` berjalan saat `messages` berubah — termasuk hasil
pencarian. User yang sedang mencari tiba-tiba pesannya DIPINDAHKAN rule
otomatis (pesan hilang dari hasil cari).
**Fix:** `if (searchQuery) return;` di awal effect + `searchQuery` masuk deps.

### Bug 3 — Pesan di-snooze tidak bisa ditemukan lewat search
`displayMessages` menyaring `snoozedUids` selalu. Pesan di-snooze tersembunyi
dari daftar biasa DAN dari hasil pencarian → tak bisa ditemukan sampai waktu
wake (jalan buntu).
**Fix:** `if (!searchQuery && snoozedUids.has(...)) return false;` — search =
intent eksplisit menemukan pesan (pola Gmail: pesan snooze muncul di hasil
pencarian).

### Bug 4 — Filter kategori tersembunyi tapi tetap aktif saat search
Tab kategori disembunyikan saat search (`{!searchQuery && <CategoryTabs/>}`)
tapi `categoryFilter` tidak di-reset → hasil pencarian disaring kategori secara
tak terlihat tanpa cara membersihkannya.
**Fix:** `setCategoryFilter(null)` di `handleSearchSubmit` + `searchBySender`.

## Test
- `test-date-groups` +7 assertion `applyMessageWindow` (dalam/luar/unparseable,
  months=0, null/[] aman)
- **Baru `test:search-flow`** — 9 assertion statis (skip window, helper dipakai,
  rules skip saat search, deps, snooze bypass, reset kategori di 2 jalur)
- **53/53 PASS** (52 + search-flow) · build OK

Status: COMPLETED
Updated At: 2026-08-26T03:26:21Z
