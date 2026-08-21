# Current Task

Status: COMPLETED
Task ID: 20260821-signature-consumer-audit
Started At: 2026-08-21T13:30:00Z
Updated At: 2026-08-21T10:05:53Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Cek ulang SEMUA konsumen getSignatureFor/getSignatureById/loadSignatures untuk
memastikan flag `placeholder` (migrasi signature legacy) ditangani di mana pun
dibutuhkan.

## Hasil audit (verifikasi grep menyeluruh)

Konsumen saat ini HANYA di 2 file:
1. **src/pages/PreferencesPage.jsx** — loadSignatures (4x), getSignatureById (syncToSogo)
2. **src/components/mailer/ComposeModal.jsx** — getSignatureFor (auto-inject), loadSignatures (SignaturePicker)

Tidak ada konsumen lain (MessageReader/quick-reply sudah tidak memakai signature
— diverifikasi; import `getSignatureById` di ComposeModal adalah dead import).

## Perbaikan

1. **`ComposeModal.jsx` SignaturePicker** — filter `!s.placeholder`: entri legacy
   ber-placeholder tidak muncul di dropdown sisipkan signature (sebelumnya
   `onInsert(s.html)` akan menyisipkan teks panduan yang bisa ikut terkirim).
2. **`ComposeModal.jsx`** — hapus dead import `getSignatureById`.
3. **`test-signatures.mjs`** — tambah assertion kontrak: `getSignatureFor`
   mengembalikan entri placeholder dengan flag (konsumen WAJIB skip) + signature
   nyata tanpa flag.

## Status penanganan placeholder per titik (setelah ini)
- Auto-inject compose/reply (ComposeModal:146) — skip ✓ (sebelumnya)
- syncToSogo (PreferencesPage:329) — skip ✓ (sebelumnya)
- Daftar di Settings (PreferencesPage) — badge "Perlu diisi" ✓ (sebelumnya)
- SignaturePicker (ComposeModal:571) — skip ✓ (baru)

## Validation
- 38/38 test PASS · npm run build OK · test-settings-signature (end-to-end) PASS

## Files Changed
- src/components/mailer/ComposeModal.jsx
- scripts/test-signatures.mjs
