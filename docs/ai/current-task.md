# Current Task — Ai-loop: ComposeModal/send flow audit

## Status: Selesai (menunggu commit/push/deploy)

## Temuan & Perbaikan

### Bug 1 (race) — Autosave in-flight saat TUTUP edit-draft → draft copy yatim
- `handleClose` hanya membersihkan copy autosave yang SUDAH ada (`draftUidRef.current`) saat ditutup. Tapi saveDraft yang masih berjalan (in-flight) selesai SETELAH tutup → membuat draft copy BARU di folder Draf yang tak pernah dihapus → duplikat menumpuk.
- **Fix:** guard `closedRef` (pola sama dgn `sentRef`). `handleClose` set `closedRef=true`; `runAutosave` setelah save cek `closedRef.current && editingDraftUidRef.current` → hapus uid hasil save + copy lama. Compose baru TETAP dipertahankan draftnya (fitur lanjutkan dari Draf). Reset `closedRef=false` saat modal dibuka.

### Bug 2 — Reply/forward memakai signature mode 'new' (bukan 'reply')
- `handleReply`/`handleForward` di MessageReader tidak mengirim `composeMode: 'reply'` → ComposeModal menetapkan `composeMode='new'` → `getSignatureFor(email, 'new')` → balasan salah memakai signature pesan baru.
- **Fix:** kedua handler kirim `composeMode: 'reply'` di payload onReply.

### Audit lain (aman)
- Attachment: validasi jumlah (10) + ukuran (4MB) sebelum FileReader, base64 tanpa prefix, restore draft via downloadURL + Promise.allSettled.
- Send: validasi recipient per-field dgn pesan jelas, sanitize body (chokepoint ganda: ComposeModal + sendMessage), hapus draft asli+autosave pasca-kirim, 401 → logout paksa.
- RichEditor: input/paste/tab selalu DOMPurify.sanitize; drop gambar→inline, file lain→lampiran.
- Modal tanpa backdrop-close = sengaja (cegah kehilangan data).

## Test
- `test-draft-compose` +8 (closedRef guard 5 + composeMode reply 3) → **44 assertions**
- **55/55 PASS** · build OK

## Next
- Commit + push (tunnel) + deploy.
Status: COMPLETED
Updated At: 2026-08-26T10:04:26Z
