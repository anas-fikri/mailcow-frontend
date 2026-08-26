# Current Task — Conversation View Outlook-like + Anti-Overlap

## Status: Selesai (menunggu commit/push/deploy)

## Objektif
1. **Pastikan tidak ada item yang bertumpuk** di daftar pesan (khususnya mode conversation).
2. **Mode conversation semirip Outlook**: header grup kaya info (avatar stack, subjek tebal bila unread, peserta, waktu terbaru, count) + baris ter-expand compact dengan thread line bersih.

## Perubahan
- **Baru `src/lib/conversations.js`** (pure, testable):
  - `normalizeSubject` (strip Re:/Fwd:/AW:/… rekursif) — dipindah dari MailPage
  - `senderDisplayName` (nama dari `"Nama <email>"`)
  - `messageParticipants(msg, selfEmail)` — alamat akun sendiri dikecualikan
  - `groupConversations(messages, asc, selfEmail)` — cluster berbasis **subjek ternormalisasi + partisipan overlap** (Outlook-like): thread A↔B menyatu walau from bergantian; dua "Invoice" dari vendor berbeda tetap terpisah. Menghitung `senders`/`hasUnread`/`latest` per grup.
- **MailPage.jsx**:
  - Import `groupConversations` dari lib; helper lokal dihapus.
  - Header grup Outlook-like: avatar stack (maks 3, ring-background), subjek tebal bila ada unread + dot indikator, peserta (truncate, `+N` bila >2), waktu pesan terbaru, count badge, chevron, `aria-expanded` + `aria-label`.
  - Baris ter-expand compact: thread line `ml-4 border-l-2 border-primary/15` sebagai SATU-satunya border kiri; `renderMessageRow(msg, -1, nested=true)` **tidak memakai `border-l-4`** lagi (cegah garis ganda bertumpuk), aktif = bg highlight.
  - Pemisah antar grup via `divide-y` parent saja (border-b dihapus → tak ada garis ganda).

## Test
- **Baru `scripts/test-conversations.mjs`** (30 assertion): normalizeSubject, senderDisplayName, participants + selfEmail, thread A↔B satu grup, Invoice beda vendor dua grup, urutan grup date-desc + asc, key unik, fallback tanpa subjek.
- `test-a11y.mjs` +8 assertion statis (aria-expanded, aria-label percakapan, `leftBorderCls nested`, thread line, pakai `group.senders`/`hasUnread`/`latest`, import lib).
- **55/55 test PASS** · build OK.

## Next
- Push (via SOCKS tunnel bila gitlab unreachable) + deploy `SERVER=deploy-mail ./deploy.sh`.
- Verifikasi visual di browser: mode conversation lebar list sempit & lebar, thread dengan banyak peserta.
