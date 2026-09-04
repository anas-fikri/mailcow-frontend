# Current Task

Status: COMPLETED
Task ID: 20260904-GOLDEN-CALENDAR-CONTACTS
Updated At: 2026-09-04T08:20:00Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Extend golden-sample capture + regression tests to Calendar & Contacts parsers.

## Result
- Capture respons produksi ASLI (diag2): eventsblocks (3 occurrence recurring),
  event detail (/view), contacts view (60 baris: 59 GAL + 1 personal).
  Resep permanen: `scripts/capture-calendar-contacts-golden.sh`.
- **BUG KRITIS #1 — createContact data loss diam-diam (FIXED, LIVE)**:
  `POST .../Contacts/personal/_new_/saveAsContact` → 200 `{"id":"_new_"}` tapi
  kartu TIDAK PERNAH tersimpan (4 round E2E + dump tabel fisik sebagai bukti;
  tersisa phantom draft `_new_` dengan email kadang kosong). Flow UI SOGo asli
  (Card.service.js $save): GET newguid → POST {pid}/{guid}/saveAsContact dengan
  emails/phones ARRAY [{type,value}]. Fix di api.js mengikuti flow itu; E2E
  produksi pasca-fix: kontak tersimpan & terlihat di view (✅), cleanup 204.
- **BUG #2 — parseCalendarEvents c_partmails (FIXED)**: produksi kirim ARRAY
  ["tim@…"], parser lama String(array) → gabung tanpa spasi. Kini array join
  (', ') + kompat string newline.
- Temuan dokumentasi (bukan bug): saveAsContact mengabaikan field `c_o`
  (org via array `orgs` di UI asli; form create SPA tidak punya org).
- Detail tanggal event "2026-09-05T10:00+07:00" (ISO tanpa detik) ter-parse
  valid — tidak perlu fix.
- Test baru `scripts/test-calendar-contacts-golden.mjs` (40+ assertion);
  test-a11y.mjs kontrak createContact direvisi (larang URL literal _new_);
  suite penuh **80/80 PASS**. Deployed & verified live (build-version
  1788509587987, api-BKPZd7ja.js berisi flow baru).

## Follow-up
- Golden-sample telah mencakup Mail + Calendar + Contacts. Halaman Stats/Rules
  memakai data localStorage (bukan respons SOGo) — tidak butuh fixture produksi.
- Kalau perlu audit edit/update kontak (saveAsContact pada kartu eksisting),
  resep capture yang sama bisa dipakai.
