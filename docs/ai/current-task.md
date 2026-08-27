# Current Task

## 2026-08-27 — Bug hunt round: fix toast leak + eml filename/encoding + login diagnostics

### Bugs ditemukan & diperbaiki:

1. **Toast countdown interval memory leak** (ComposeModal `showSendToast`)
   - Interval `setInterval` tidak pernah di-cleanup saat toast di-dismiss via tombol X atau auto-remove.
   - Fix: tambah `hasToast(id)` di toast store; interval cek `hasToast` sebelum update → clear interval jika toast sudah hilang.

2. **buildEml: filename dengan `"` memecah Content-Disposition header** (emlUtils.js)
   - `filename="file"name.txt"` → malformed header → email client gagal parse lampiran.
   - Fix: `escapeFilename()` escape `"` dan `\` sebelum disisipkan ke header.

3. **buildEml: unused variable `fnRaw`** (emlUtils.js) — dihapus.

### Login diagnostics (tahap sebelumnya):
- Deteksi `LDAPPasswordPolicyError` field langsung dari response data (bukan hanya `message`).
- Tombol "Hubungi administrator" + hint di LoginPage.

### Status: 59/59 PASS, build OK, deploy live.
