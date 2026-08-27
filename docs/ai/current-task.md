# Current Task

## 2026-08-27 — Conversation view: email tunggal = baris biasa (bukan thread palsu)

**Status:** implementasi selesai, 56/56 test PASS, build OK — commit/push/deploy menyusul.

**Masalah:** di mode conversation, SETIAP pesan dikelompokkan jadi grup — termasuk
email tunggal. Akibatnya 1 email tampil dengan header percakapan ala Outlook
(avatar stack, badge count "1", chevron, subjek tebal) → terlihat seperti thread
padahal bukan. Pola Gmail/Outlook: hanya thread sungguhan (>=2 pesan) yang diberi
penanda percakapan.

**Fix (MailPage render):** grup dengan `messages.length === 1` dirender via
`renderMessageRow(msg, -1, false)` (baris biasa, border-l-4 normal); hanya grup
>=2 pesan yang mendapat header percakapan + thread line. Logika grouping di
`src/lib/conversations.js` TIDAK berubah (pure lib tetap).

**Test:** test-a11y +2 → 169 assertions · 56/56 PASS · build OK.
Status: COMPLETED
Updated At: 2026-08-27T01:16:42Z
