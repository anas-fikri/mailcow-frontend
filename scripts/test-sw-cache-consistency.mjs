#!/usr/bin/env node
/**
 * Test gating konsistensi service-worker untuk mencegah React #310 campuran-chunk.
 *
 * Sejarah: stale-while-revalidate pada SW bisa menyajikan CHUNK CAMPURAN
 * antar-build (mis. index-OLD + api-NEW) dalam satu halaman → dua salinan
 * runtime React → dispatcher mismatch → "Minified React error #310".
 *
 * Kontrak:
 *   1. sw.js harus NETWORK-FIRST untuk SEMUA asset ber-hash (bukan
 *      stale-while-revalidate). Kunci: fetch() dipanggil dulu di event 'fetch'
 *      untuk setiap GET same-origin dalam scope.
 *   2. konstanta CACHE_NAME harus memakai vN (BUKAN tanpa versi tetap).
 *   3. registrasi di main.jsx harus memakai ?v= yang SAMA dengan nomor versi
 *      cache (agar browser mengambil SW baru dan membersihkan cache lama).
 */

import fs from 'node:fs';
import path from 'node:path';

const sw = fs.readFileSync(path.resolve('public/sw.js'), 'utf8');
const main = fs.readFileSync(path.resolve('src/main.jsx'), 'utf8');

let ok = true;

// 1. SW network-first
// Struktur minimal: di dalam event 'fetch', respondWith(fetch(request)…) langsung
const fetchFirst = /respondWith\(\s*(?:networkFirst\(request\)|fetch\(request\))/.test(sw);
const noCachedFirst = /caches\.match\(request\)\.then\(\(cached\).*return cached \|\| network/.test(sw);
const hasResponseFallback = /return new Response\(/.test(sw);
const avoidsNavigationFallback = /request\.mode !== 'navigate'/.test(sw);

if (!fetchFirst) {
  console.error('✗ sw.js harus network-first: respondWith(fetch(request)…) di jalur utama.');
  ok = false;
} else {
  console.log('✓ sw.js network-first utk asset (fetch(request) dulu)');
}

if (noCachedFirst) {
  console.error('✗ Terdeteksi pola stale-while-revalidate (cached-first) — campuran chunk!');
  ok = false;
}
if (!hasResponseFallback) {
  console.error('✗ Jalur offline harus selalu mengembalikan new Response().');
  ok = false;
} else {
  console.log('✓ Jalur offline selalu menghasilkan Response valid');
}
if (!avoidsNavigationFallback) {
  console.error('✗ Navigasi tidak boleh fallback ke HTML cache lama (risiko mixed build).');
  ok = false;
} else {
  console.log('✓ Navigasi tidak memakai HTML cache lama saat offline');
}

// 2. CACHE_NAME versi vN
const verMatch = sw.match(/CACHE_NAME\s*=\s*'pcp-webmail-v(\d+)'/);
if (!verMatch) {
  console.error('✗ CACHE_NAME harus berpola pcp-webmail-vN.');
  ok = false;
} else {
  const ver = verMatch[1];
  console.log(`✓ CACHE_NAME versi ${ver}`);
  // 3. main.jsx pakai ?v= yang sama
  if (!new RegExp(`sw\\.js\\?v=${ver}`).test(main)) {
    console.error(`✗ main.jsx harus register('/webmail/sw.js?v=${ver}') —— versi cache dan bump SW tidak sinkron.`);
    ok = false;
  } else {
    console.log(`✓ main.jsx register sw.js?v=${ver} sinkron dgn CACHE_NAME`);
  }
}

process.exit(ok ? 0 : 1);