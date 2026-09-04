# Current Task

Status: COMPLETED
Task ID: 20260904-AUTO-CAPTURE-CONTACTS
Updated At: 2026-09-04T12:30:00Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Fitur: alamat external yang di-reply otomatis tersimpan di kontak. Keputusan user:
semua kirim sukses (reply/reply-all/compose), selalu aktif tanpa toggle.

## Result
- **`src/lib/contactCapture.js`** — filter murni: alamat valid (parseRecipientEntry),
  bukan self (from "Nama <self>" dikenali), bukan alamat layanan
  (no-reply/mailer-daemon/postmaster/autoreply/bounce/abuse), dedup per-kirim;
  `filterKnownContacts` buang yang sudah ada di kontak Personal/GAL.
- **`src/lib/api.js`** — chokepoint `captureExternalContacts` fire-and-forget pada
  **3 jalur sukses sendMessage** (SOGo langsung / fallback SMTP / SMTP lampiran+jadwal).
  Dedup via 1× fetchContacts (personal+GAL), simpan via createContact guid-flow.
  Kegagalan capture TIDAK PERNAH menggagalkan kirim. Test seam `_waitForContactCaptures()`.
- **Unit test** `scripts/test-contact-capture.mjs` (6 grup asersi) — suite **81/81 PASS**
  (2 test lama yang hitung-request-persis diadaptasi ke seam).
- **E2E browser** `scripts/e2e-contact-capture-browser.mjs` — UI compose ke
  `…@contoh.example` (TLD reserved) → poll kontak sampai muncul → cleanup + sweep DSN.
  **3 run PASS** di produksi (idempoten). Runner `all` = 5 test.
- **Deploy** produksi selesai & diverifikasi E2E di bundle live.
- Gotcha terdokumentasi: DSN bounce delayed dari MAILER-DAEMON; kolom uid kontak =
  `id` (bukan `c_uid` yang bisa null); puppeteer interop `pkg?.default ?? pkg`.
- Server akhir: active=0, INBOX/Junk/Sent=0.

## Follow-up
- Toggle Preferences ("Simpan otomatis alamat eksternal") bila nanti diminta user.
- Perluas filter service local-part bila ada laporan noise autocomplete.
