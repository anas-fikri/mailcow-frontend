# Current Task

**Tanggal:** 2026-08-19

## Objektif aktif
Audit + hardening `ComposeModal`/`HtmlEditor` untuk paste-based XSS dan
tabnabbing pada link keluar. Selesai, divalidasi.

## Temuan & perbaikan
- **Paste-XSS (`data:` href):** `PURIFY_CONFIG.ALLOWED_URI_REGEXP` mengizinkan
  `data:` (diperlukan utk `<img src>` base64 di composer), tapi DOMPurify tidak
  membedakan per-atribut — jadi `<a href="data:text/html,...">` dari paste
  **lolos** sanitasi. → Hook `hardenAnchorNode` menghapus `data:` href pada `<a>`.
- **Tabnabbing:** email/paste bisa berisi `<a target="_blank">` tanpa `rel`;
  hook memaksa `rel="noopener noreferrer"` (defense-in-depth; browser modern
  sudah default noopener).

## Implementasi
- `src/lib/pasteUtils.js`: `hardenAnchorNode(node)` (pure) +
  `registerPurifyHardening(d)` + auto-register `afterSanitizeAttributes` saat
  modul dimuat (browser). Hook berlaku utk render email (MessageReader) DAN editor.
- `scripts/test-purify-hardening.mjs` + `test:purify-hardening` (27 test total).
- `deploy.sh`: `BACKEND_LIB_FILES` += `smtpCookie.js` (ikut commit ini, sisa task sebelumnya).

## Status
- [x] Implementasi + test
- [x] 27/27 test PASS + build OK
- [ ] deploy + commit/push
Status: COMPLETED
Updated At: 2026-08-19T15:15:17Z
