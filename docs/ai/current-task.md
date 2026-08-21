# Current Task

Status: COMPLETED
Task ID: 20260821-signature-legacy-placeholder
Started At: 2026-08-21T12:10:00Z
Updated At: 2026-08-21T09:48:19Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Migrasi sekali-jalan di loadSignatures: signature legacy yang kosong html diberi
placeholder agar tidak tampil aneh di daftar.

## Perubahan

1. **`src/lib/signatures.js`**:
   - `LEGACY_PLACEHOLDER = '<p>Ketik signature Anda di sini…</p>'` (export).
   - `loadSignatures`: entri legacy (field html hilang / bukan string) → diberi
     placeholder + flag `placeholder: true`, lalu DITULIS BALIK ke localStorage
     (sekali-jalan, idempotent — baca berikutnya tidak mengubah apa pun).
   - `updateSignature`: saat user menyetel `html` eksplisit, flag `placeholder`
     dihapus (bukan lagi placeholder; kembali normal utk injeksi).
2. **Konsumen injeksi skip placeholder** (agar placeholder tidak ikut terkirim):
   - `ComposeModal.jsx`: `sigHtml = (localSig?.html && !localSig?.placeholder) || prefs...`
   - (MessageReader/quick-reply sudah tidak pakai getSignatureFor di kode saat ini —
     diverifikasi: satu-satunya konsumen injeksi adalah ComposeModal.)
   - `PreferencesPage.jsx` `syncToSogo`: placeholder tidak disinkronkan ke SOGo.
3. **Tampilan daftar** (`PreferencesPage.jsx` SignatureSection): entri
   `placeholder` menampilkan badge **"Perlu diisi — klik untuk mengedit"**
   (bukan "0.0 KB — teks saja" yang menyesatkan untuk konten kosong).

## Test
- `test-signatures`: migrasi → placeholder+flag; write-back ke storage; idempotent
  (baca kedua tidak menulis ulang); updateSignature menghapus flag.
- `test-settings-signature` (end-to-end bundle): badge "Perlu diisi" tampil utk
  signature legacy + tidak ada crash.

## Validation
- 37/37 test PASS · npm run build OK

## Files Changed
- src/lib/signatures.js, src/components/mailer/ComposeModal.jsx,
  src/pages/PreferencesPage.jsx
- scripts/test-signatures.mjs, scripts/test-settings-signature.mjs
