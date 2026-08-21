# Current Task

Status: COMPLETED
Task ID: 20260821-error-boundary-debug-button
Started At: 2026-08-21T11:30:00Z
Updated At: 2026-08-21T09:43:41Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Tambah tombol debug di ErrorBoundary root agar pemilik akun bisa melihat detail
error tanpa buka devtools.

## Perubahan

1. **`src/components/ErrorBoundary.jsx`** (root):
   - State baru `showDetails` (default false) — detail tetap tersembunyi
     (keputusan keamanan dipertahankan: bukan auto-tampil).
   - Tombol toggle `Lihat Detail Error` / `Sembunyikan Detail` (ikon Eye/EyeOff).
   - Saat terbuka: pesan error, stack, dan componentStack dalam `<pre>`
     scrollable (max-h) + label "informasi hanya untuk debugging".
   - `componentDidUpdate` mereset `showDetails` saat error BARU tertangkap
     (detail error lama tidak ikut tampil).
2. **`src/pages/PreferencesPage.jsx`** `SectionErrorBoundary` (konsistensi):
   - Tombol `Lihat Detail` / `Sembunyikan Detail` + `<pre>` pesan error.
3. **Test baru `scripts/test-error-boundary-debug.mjs`**:
   - Bundle ErrorBoundary.jsx + harness dengan esbuild (jsx automatic, bundle
     penuh) → jalankan di jsdom → assert: fallback tampil, detail tersembunyi
     secara default, klik → detail tampil, klik lagi → tersembunyi.
   - esbuild ditambahkan sebagai devDependency.

## Validation
- 37/37 test PASS (baru test:error-boundary-debug) · npm run build OK

## Files Changed
- src/components/ErrorBoundary.jsx
- src/pages/PreferencesPage.jsx
- scripts/test-error-boundary-debug.mjs (baru)
- package.json (+test:error-boundary-debug, +esbuild devDep)
