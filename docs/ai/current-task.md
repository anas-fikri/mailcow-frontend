# Current Task

## Status: SELESAI ✅

**Ai-loop rotasi kontak (GAL/personal) — 2 bug diperbaiki**

### Bug 1 — Field kontak SOGo bisa berupa object → crash halaman kontak
`fetchContacts` melempar `c.c_cn`/`c_mail`/`emails` mentah ke React + filter
search (`.toLowerCase()`). Beberapa versi SOGo mengembalikan field tsb sebagai
object → TypeError di filter pencarian ATAU "Objects are not valid as a React
child" saat render (satu kelas bug dgn subject/date di messageRows yang sudah
diatasi sebelumnya).
**Fix:** `parseContactRow` murni di `contactUtils.js` — semua field dinormalisasi
string (`str()`), `emails` array-of-string/array-of-object ditangani, baris rusak
→ null. Dipakai `fetchContacts`.

### Bug 2 — Double-submit create kontak
`AddContactModal` tidak punya guard re-entry (disabled={isLoading} hanya efektif
setelah re-render) → Enter auto-repeat/klik ganda = kontak duplikat.
**Fix:** `savingRef` di ContactsPage — `if (savingRef.current) return` +
reset via `onSettled` mutation (pola sama dgn EventModal/ComposeModal).

### Validasi
- test-contact-signature-edge +13 (parseContactRow: object→string, emails
  array-of-object, baris rusak, guard double-submit) → 34 assertions
- **54/54 PASS** · build OK · deploy live terverifikasi hash
Status: COMPLETED
Updated At: 2026-08-26T08:27:10Z
