# Current Task — Audit ContactsPage: kontrak SOGo create/delete kontak

## Status
Selesai ✅ — create kontak diperbaiki ke kontrak SOGo yang benar (`POST .../_new_/saveAsContact` + `c_component: 'vcard'`), delete kontak beralih ke `GET {pid}/{uid}/delete` (kontrak UI SOGo live). 55/55 test PASS, build OK, live di produksi, ter-push.

## Temuan (diverifikasi dari source SOGo 5.12.10 + UI SOGo live produksi)
1. **createContact memakai endpoint salah** — `POST .../Contacts/personal/new`; server `lookupName` di SOGoContactGCSFolder hanya membuat objek baru bila URL berakhiran `AsContact`/`AsList` → 404. Kontrak UI SOGo live: `POST .../Contacts/personal/_new_/saveAsContact` + body JSON berisi `c_component: 'vcard'`.
2. **deleteContact memakai POST** — UI SOGo live memakai `Resource.remove` → `GET {pid}/{uid}/delete`. POST → `POSTAction` WebDAV-only → 500.

## Perbaikan
- `createContact`: URL → `_new_/saveAsContact`, body → `{ c_component: 'vcard', ...contactData }`.
- `deleteContact`: method POST → GET.

## Next
- Verifikasi browser: buat kontak baru (cek 201 + muncul di daftar), hapus kontak (cek hilang dari daftar).
- GAL tab: pertimbangkan dukungan fetch GAL (kontrak berbeda — `/GAL` sumber) bila dibutuhkan.
Status: COMPLETED
Updated At: 2026-08-26T16:45:00Z
