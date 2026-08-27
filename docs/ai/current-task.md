# Current Task: Fix React #310 duplicate-React-runtime

## Status: ✅ DEPLOYED (commit a0d8a50)

## ROOT CAUSE (final, terbukti via sourcemap + repro test)
zustand@4 → use-sync-external-store/shim/with-selector.js (CJS) melakukan
require('react') yang di pipeline rolldown-vite menghasilkan MODULE INSTANCE
REACT KEDUA: seluruh react/cjs/react.production.js ter-bundle ke chunk api.
Komponen dirender dengan copy-A; store hooks lewat copy-B → dispatcher
mismatch → "Minified React error #310 — Rendered fewer hooks than expected"
saat membuka /webmail/mail.

## FIX
1. vite.config: plugin `useSesShimPlugin` (resolveId) — semua specifier
   use-sync-external-store* → src/lib/useSyncExternalStoreShim.js
   (ESM, memakai React instance utama aplikasi).
2. Shim export bentuk sesuai upstream: NAMED fn + DEFAULT OBJECT
   (zustand/esm/index.mjs melakukan destructuring dari default import).

## GATING BARU
- scripts/test-single-react.mjs: assert tepat SATU runtime React di dist
  (signature 'useState=function' ≤ 2 kemunculan total). Regression-proof.
- Repro test test-settings-signature kini PASS ('oe is not a function' hilang).
- scripts/tools/find-hook-violations.mjs + scripts/lib/jsscan.mjs:
  scanner statis Rules-of-Hooks (diagnostik manual, bukan gating — masih
  memiliki blindspot regex-literal; dokumentasi di file).

## VALIDASI
- 61/61 test PASS (0 fail)
- Served bundle live: react runtime tunggal (api x1, index x0)
- SW v5 aktif → cache lama terhapus otomatis di browser user
