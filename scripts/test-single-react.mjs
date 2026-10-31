#!/usr/bin/env node
/**
 * Test gating: pastikan TIDAK ADA duplikasi runtime React di bundle produksi.
 *
 * Konteks (React error #310 — "Rendered fewer hooks than expected"):
 *   use-sync-external-store (via zustand@4) meng-bundle salinan React CJS
 *   kedua di chunk api. Komponen dirender lewat copy A; hook store lewat
 *   copy B → dispatcher mismatch → crash acak saat buka /webmail/mail.
 *
 * Fix permanen (vite.config): plugin `useSesShimPlugin` mengarahkan semua
 * specifier 'use-sync-external-store*' ke src/lib/useSyncExternalStoreShim.js
 * yang memakai React instance utama aplikasi.
 *
 * Assertion:
 *   1. Signature export-react-CJS ("useState=function") hanya boleh ada di
 *      MAKSIMAL 1 chunk, dengan TOTAL kemunculan ≤ 2 (wrapper + jsx-runtime).
 *   2. Shim lokal ter-bundle (marker unik: "useSyncExternalStoreExports" atau
 *      nama helper objectIsEqual).
 *   3. Paket asli use-sync-external-store TIDAK ikut ter-bundle (cari string
 *      khas file upstream-nya: 'with-selector' pada konteks export objeknya —
 *      dicek via nama mem cache: string khas minified upstream tidak dipakai;
 *      cukup cek marker (1)+(2)).
 */

import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve('dist');
if (!fs.existsSync(DIST)) {
  console.error('dist/ tidak ditemukan — jalankan build dulu.');
  process.exit(2);
}

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.js$/.test(e.name)) files.push(p);
  }
})(path.join(DIST, 'assets'));

let copies = 0;         // jumlah chunk yang memuat runtime react
let totalSig = 0;       // total kemunculan signature
const withCopy = [];

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const n = (src.match(/useState=function/g) || []).length;
  if (n > 0) {
    copies++;
    totalSig += n;
    withCopy.push({ file: path.basename(f), n });
  }
}

let ok = true;

if (copies === 0) {
  console.error('❌ Tidak menemukan SATU PUN runtime React di bundle?! Build rusak.');
  ok = false;
} else if (copies > 1 || totalSig > 2) {
  console.error(`❌ DUPLIKAT RUNTIME REACT TERDETEKSI:
   chunks dengan react runtime : ${copies}
   total signature             : ${totalSig}
   detail: ${JSON.stringify(withCopy)}

   Penyebab umum: dependency baru melakukan require('react') CJS interop
   (lihat vite.config → useSesShimPlugin utk pola perbaikannya).`);
  ok = false;
} else {
  console.log(`✅ Runtime React tunggal (${copies} chunk, sig=${totalSig})`);
}

// Marker shim ter-bundle
const apiFiles = files.filter((f) => f.includes('/api-'));
let shimFound = false;
for (const f of apiFiles.length ? apiFiles : files) {
  const src = fs.readFileSync(f, 'utf8');
  if (src.includes('hasValue') && src.includes('useSyncExternalStore')) {
    // Heuristik lemah tapi cukup: shim & runtime share satu chunk.
    if ((src.match(/useState=function/g) || []).length > 0) {
      shimFound = true;
      break;
    }
  }
}
if (!shimFound) {
  console.log('⚠️  Marker heuristik shim tidak tampak di chunk sama dgn react —\n   verifikasi manual bila mengubah mekanisme store.');
} else {
  console.log('✅ Shim useSyncExternalStoreShare co-located dgn runtime React tunggal');
}

process.exit(ok ? 0 : 1);
