# Current Task

## Task: Edge case — duplikat kontak (GAL vs personal) & konflik sync signature multi-perangkat

**Status: SELESAI (49/49 test PASS, live)** → commit + push + deploy.

## Ringkasan
Audit dua area edge case. 3 temuan diperbaiki:
1. Highlight seleksi kontak match semua baris uid kosong (GAL/rusak)
2. Tambah kontak dengan email duplikat di personal → dibuat diam-diam
3. Sync signature ke SOGo one-way: perangkat lain tidak pernah menarik
   signature yang disync perangkat A (compose tetap pakai versi lama)

## Temuan & Perbaikan

### Fix 1 — Kontak: highlight seleksi uid kosong
`selected?.uid === contact.uid` → entri GAL tanpa uid (`uid=''`) membuat SEMUA
baris kosong-uid ikut ter-highlight `bg-muted`.
**Fix:** `isSelectedRow = !!selected && (contact.uid ? contact.uid === selected.uid : contact === selected)` — baris ber-uid dibandingkan via uid; baris kosong-uid via identitas objek.

### Fix 2 — Kontak: duplikat personal diblokir, GAL diizinkan
Menambah kontak dengan email yang sudah ada → duplikat diam-diam.
**Fix:** helper `findDuplicateKind(contacts, email)` di `src/lib/contactUtils.js`:
- duplikat di kontak **personal** → diblokir dengan pesan "Kontak dengan email
  ini sudah ada di kontak pribadi."
- duplikat di **GAL** → diizinkan (GAL direktori read-only; menambah salinan
  personal dari kolega adalah perilaku normal)
- prioritas: personal > gal; case-insensitive

### Fix 3 — Signature: reconcile multi-device (pull-back dari SOGo)
`SOGoMailSignature` adalah sumber BERSAMA (syncToSogo menulisnya), tapi hanya
di-push — perangkat lain tidak pernah menarik → compose tetap pakai signature
lokal yang usang; fallback SOGo hanya dipakai saat daftar lokal KOSONG.
**Fix:** `shouldImportSogoSignature(list, sogoHtml)` di signatures.js
(idempotent: impor HANYA bila html yang sama belum ada di daftar — trim
normalized) + efek migrasi di PreferencesPage: saat SOGo punya signature yang
belum ada di lokal → tarik sebagai entri baru "Signature SOGo". Tidak
menimpa editan lokal, tidak menumpuk (dedup by html).

## Diverifikasi aman
- Kontak GAL tetap tidak bisa dihapus (guard `!contact.isGAL && contact.uid`)
- Delete kontak personal by uid; `pathSegment(cardId)` anti-traversal
- SyncToSogo tetap skip placeholder + menulis SOGoMailSignatureEnabled

## Test
- **Baru `test:contact-signature-edge`** (18 assertions): findDuplicateKind
  (gal/personal/kosong/null/prioritas), shouldImportSogoSignature
  (idempotent/empty/baru), 6 assertion statis (PreferencesPage import +
  entri 'Signature SOGo' + migrasi pertama; ContactsPage findDuplicateKind +
  pesan blokir + highlight aman).
- **49/49 test PASS** · `npm run build` OK

Status: COMPLETED
Updated At: 2026-08-26T01:57:43Z
