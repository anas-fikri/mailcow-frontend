# Current Task

**Tanggal:** 2026-08-19

## Objektif aktif
Tambah test DoS utk image proxy: simulasi upstream slow-drip dan assert hard
deadline aktif. Selesai.

## Perubahan
- **Ekstraksi `src/lib/remoteImage.js`:** pindahkan `parseImageProxyUrl`,
  `resolveSafeAddresses`, `pinLookup`, `requestImageOnce`, `fetchRemoteImage`
  dari server.js → modul testable. Timeout/maxBytes/maxRedirects/resolve kini
  injectable (default sama). Bonus bug fix: branch `remaining <= 0` di
  `requestImageOnce` dulu destroy res tapi TIDAK settle promise (hang) →
  sekarang `reject(504)`.
- **`server.js`:** import `fetchRemoteImage` dari modul; hapus import
  `dns`/`http`/`https`/`isBlockedIp` yang sudah tak dipakai.
- **`scripts/test-remote-image.mjs` + `test:remote-image`:**
  1. slow-drip (1 byte/50ms tanpa selesai) → harus 504 timeout <3s.
  2. happy path (gambar valid) → sukses (ekstraksi tidak merusak).
  3. headers lewat deadline → reject 504 (bug fix, tidak hang).
- **`deploy.sh`:** `BACKEND_LIB_FILES` += `remoteImage.js`.

## Status
- [x] Implementasi + test
- [x] 28/28 test PASS + build OK + bash -n deploy.sh
- [ ] commit + push + deploy
Status: COMPLETED
Updated At: 2026-08-19T15:21:04Z
