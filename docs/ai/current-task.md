# Current Task — Ai-loop: render email (tracking-pixel proxy) + header percakapan Terkirim/Draf

## Status: Selesai (menunggu commit/push/deploy)

## Temuan & Perbaikan

### 1. (KRITIS) `proxyExternalImages` tidak pernah dipanggil — tracking pixel bocor
- `src/lib/imageProxy.js` punya `proxyExternalImages` lengkap (img/srcset/picture/CSS url) + test, tapi **tidak di-wire di mana pun** → gambar eksternal di body email dimuat browser langsung dari domain pengirim → **IP user bocor** + read-receipt.
- **Fix (MessageReader):** `renderHtml = rawHtml ? proxyExternalImages(cleanHtml) : cleanHtml` dipakai di `dangerouslySetInnerHTML` body + jendela print. Quote balasan/forward TETAP memakai `cleanHtml` (URL asli — konten dikirim sebagai email harus valid utk penerima; sesuai catatan desain di imageProxy.js).

### 2. Header percakapan salah di folder Terkirim/Draf
- `group.senders` selalu ambil `m.from` → di Terkirim/Draf header menampilkan alamat akun sendiri, padahal baris menampilkan penerima (`m.to`).
- **Fix:** `groupConversations(..., { labelField })` — MailPage meneruskan `isSentOrDraft ? 'to' : 'from'`; `isSentOrDraft` dinaikkan ke atas (dipakai 2 tempat).

### 3. Audit lain (aman)
- `resolveCidImages` regex global + `.test()` lalu `.replace()` — aman (`replace` reset lastIndex).
- PDF lightbox iframe — SOGo kirim `X-Frame-Options: SAMEORIGIN` → iframe di origin sama aman.

## Test
- `test-conversations` +2 (labelField to/from) → 32 assertion
- `test-a11y` +6 (import proxy, renderHtml, body pakai renderHtml, print pakai renderHtml, quote pakai cleanHtml, labelField) → **107 assertions**
- **55/55 PASS** · build OK

## Next
- Commit + push (tunnel SOCKS5) + deploy.
