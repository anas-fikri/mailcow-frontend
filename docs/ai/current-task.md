# Current Task

Status: COMPLETED
Task ID: 20260821-settings-crash-fix
Started At: 2026-08-21T09:00:00Z
Updated At: 2026-08-21T09:29:56Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Fix halaman /webmail/settings yang menampilkan "Terjadi Kesalahan" (ErrorBoundary root)

## Root Cause (dikonfirmasi via repro jsdom)
`PreferencesPage.jsx` SignatureSection memanggil `sig.html.length` tanpa guard.
Entri signature LEGACY di localStorage (dari versi sebelum fitur multi-signature)
bisa berbentuk `{ id, name }` tanpa field `html` → `TypeError: Cannot read
properties of undefined (reading 'length')` saat klik tab Signature →
ErrorBoundary root menampilkan "Terjadi Kesalahan" dan seluruh halaman Settings mati.

### Bukti konfirmasi
- Deployed bundle (PreferencesPage-D2kJ66t5.js) == build HEAD persis
  (setelah normalisasi nama chunk; hanya VITE_SOGO_BASE_URL berbeda karena
  deploy override `VITE_SOGO_BASE_URL=""`).
- Semua 24 chunk yang direferensikan live bundle serve HTTP 200 (bukan
  masalah chunk-load / cache).
- Repro jsdom `scripts/test-settings-signature.mjs`: seed entri signature
  legacy + klik tab Signature → reproduksi crash persis:
  `TypeError: Cannot read properties of undefined (reading 'length')`
  di `sig.html.length`, stack di PreferencesPage chunk `Array.map` → SignatureSection.

## Fix
1. **src/pages/PreferencesPage.jsx** — guard render:
   `((sig.html?.length || 0) / 1024).toFixed(1)` dan `sig.html?.includes('<img')`.
2. **src/lib/signatures.js `loadSignatures`** — normalisasi tiap entri:
   filter object + id string, coerce `name`/`html` ke string (html hilang → '').
   Melindungi SEMUA consumer (ComposeModal, MessageReader pakai `localSig?.html`
   — sudah aman; sekarang loadSignatures juga menjamin bentuk `{id,name,html}`).
3. **SectionErrorBoundary** (baru di PreferencesPage, defense-in-depth) —
   satu tab yang error tidak menjatuhkan seluruh halaman. Fallback menampilkan
   pesan GENERIK (konsisten dgn keputusan keamanan ErrorBoundary root: detail
   error tidak ditampilkan ke user, hanya console dgn prefix section).
4. **Test baru**:
   - `scripts/test-settings-signature.mjs` (jsdom + bundle produksi nyata,
     seed legacy signature + klik tab, assert tidak crash) — `test:settings-signature`
   - Unit test sanitasi legacy data di `scripts/test-signatures.mjs`
   - `jsdom@30` ditambahkan sebagai devDependency

## Validation
- 35/35 test PASS (termasuk test:settings-signature + test:signatures baru)
- npm run build OK
- Repro end-to-end: Settings render OK dgn data signature legacy (PASS)

## Files Changed
- src/pages/PreferencesPage.jsx
- src/lib/signatures.js
- scripts/test-settings-signature.mjs (baru)
- scripts/test-signatures.mjs
- package.json (+jsdom devDep, +test:settings-signature)
