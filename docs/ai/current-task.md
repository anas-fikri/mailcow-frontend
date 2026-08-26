# Current Task

## Task: Validasi format email di ComposeModal (to/cc/bcc) sebelum kirim

**Status: SELESAI (46/46 test PASS, live)** → commit + push + deploy.

## Ringkasan
ComposeModal hanya memvalidasi "Kepada wajib diisi" — format invalid (mis.
"abc", "bad@@x.com", "<evil>@x.com") lolos sampai server (error 400 generik
setelah request dikirim). Sekarang divalidasi per-field SEBELUM kirim dengan
pesan yang menyebut field + alamat yang salah.

## Perubahan

### `src/lib/emailValidation.js` — helper baru
`firstInvalidRecipient(value)`: kembalikan entri pertama yang tidak valid
dalam daftar dipisah koma (atau null bila kosong/semua valid). Reuse
`isSafeRecipient` yang sudah ada (tahan CRLF/header injection, support
"Nama <email>"). Dipakai UI — lib tetap murni & dipakai juga server.

### `src/components/mailer/ComposeModal.jsx` — guard di handleSend
```js
const invalidField = [['Kepada', to], ['Cc', cc], ['Bcc', bcc]]
  .map(([label, value]) => ({ label, bad: firstInvalidRecipient(value) }))
  .find((f) => f.bad);
if (invalidField) {
  setError(`Alamat email tidak valid di "${label}": "${bad}". Gunakan format nama@domain.com.`);
  return;
}
```
- Urutan: Kepada → Cc → Bcc; hanya field yang terisi divalidasi
- Koma/spasi trailing ("a@b.com,") tetap diterima (filter Boolean)
- Defense-in-depth: server tetap memvalidasi ulang (validateRecipientList)

## Test
- `test:email-validation` diperluas: 10 kasus `firstInvalidRecipient` (null,
  kosong, valid, "Nama <email>", entri rusak pertama, CRLF injection, trailing
  koma) + 3 assertion statis ComposeModal (import, pesan error, validasi
  to/cc/bcc).
- **46/46 test PASS** · `npm run build` OK

Status: COMPLETED
Updated At: 2026-08-26T01:39:42Z
