# Current Task

## Status: SELESAI ✅

**Ai-loop rotasi MessageReader — fitur hilang diam-diam di-restore**

### BUG BESAR — commit `6c1485f` (fix nginx) menimpa MessageReader.jsx (1014→534 baris)
Commit yang seharusnya hanya menyentuh nginx secara tidak sengaja menimpa
MessageReader dengan versi LAMA → 5 fitur hilang diam-diam di produksi:
1. **Lightbox preview gambar/PDF** (klik lampiran → full-screen, Unduh/Tab baru/Esc)
2. **Tambah ke kontak** (1-klik dari pesan → form terisi pengirim/penerima)
3. **Lapor Spam** (markMessagesAsJunk native — set flag + pindah Junk; versi
   rusak hanya move manual tanpa flag)
4. **Unduh Semua lampiran** (blob + progress, total ukuran)
5. **viewURL** di extractAttachments (URL preview terpisah)

### Fix
- `extractAttachments` (messageHtml.js): `viewURL` dipertahankan + fallback
- MessageReader: import ulang (markMessagesAsJunk, createContact, getFileKind,
  totalAttachmentSize, UserPlus/Eye/ExternalLink/X), state lightbox/contact/
  downloadingAll, `spamMutation`, `handleDownloadAll`, `openPreview`,
  `handleSaveContact`, toolbar UserPlus, lightbox + contact modal overlay,
  Esc tutup lightbox dulu baru reader (lightbox masuk dep array handler)

### Validasi
- test-message-html +4 (viewURL, part viewURL-saja)
- test-a11y +8 (regresi fitur reader — 88 assertions)
- test-state-combination diperbarui (dep array + lightbox)
- **55/55 PASS** · build OK · deploy live terverifikasi hash
Status: COMPLETED
Updated At: 2026-08-26T09:09:50Z
