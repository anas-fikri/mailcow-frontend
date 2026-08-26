# Current Task

## Task: Restorasi lampiran saat edit draft (download dari SOGo → compose)

**Status: SELESAI — lampiran draft direstorasi ke editor, 52/52 test PASS, live build terverifikasi.**

## Konteks
Round sebelumnya mencatat keterbatasan: `saveDraft` SOGo hanya menyimpan teks —
draft yang dibuka utk diedit kehilangan lampirannya. Task ini menghilangkan
keterbatasan itu: lampiran yang ada di draft (part dengan downloadURL di /view)
diunduh dan di-restore ke list lampiran compose sehingga ikut terkirim.

## Perubahan
1. **`src/lib/messageHtml.js`** — `extractAttachments(parts)` dipindah dari
   MessageReader (dedup, sama pola extractHtml): kumpulkan part non-inline yang
   punya downloadURL, termasuk yang bersarang.
2. **`src/lib/api.js`** — `fetchAttachmentData(downloadURL)`: unduh part SOGo
   (downloadURL sudah memuat token sesi) → base64 tanpa prefix. Chunked
   fromCharCode (32 KB) biar aman utk file besar; `sogoHeaders()` utk XSRF.
3. **`src/pages/MailPage.jsx`** — `openDraftForEdit`: setelah fetch detail,
   `Promise.allSettled` unduh semua lampiran paralel (gagal satu → lewati,
   jangan blokir buka draft) → `initialData.attachments`.
4. **`src/components/mailer/ComposeModal.jsx`** — seed `attachments` dari
   `initialData.attachments` saat reset (dengan id baru dari attachIdRef).
   Restorasi TIDAK memicu autosave (userEditedRef tetap false).

## Alur setelah fix
Buka draft → isi + lampiran direstorasi → user lanjutkan/edit → autosave
menyimpan teks (keterbatasan SOGo tetap: lampiran hanya di memori sesi) →
kirim: `sendMessage` membawa lampiran (base64) via SMTP proxy / api/send →
draft asli + autosave dihapus. Lampiran yang gagal diunduh dilewati dengan
warning console, tidak menggagalkan pembukaan draft.

## Test
- `test-message-html` +8 assertion `extractAttachments` (nested, inline di-skip,
  tanpa downloadURL, null)
- `test-draft-api` +9 assertion `fetchAttachmentData` (base64 benar, prefix
  SOGO_BASE, URL absolut, credentials include, kosong → null, 404 → throw)
- `test-draft-compose` +8 assertion statis (restore flow, allSettled, seed
  attachments, dedup extractAttachments)
- **52/52 PASS** · build OK

Status: COMPLETED
Updated At: 2026-08-26T03:55:00Z
