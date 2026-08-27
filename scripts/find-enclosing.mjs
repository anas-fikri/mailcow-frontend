#!/usr/bin/env node
/**
 * Temukan fungsi pembungkus (enclosing function) dari sebuah hook call
 * DI DALAM BUNDLE MINIFIED — via backward brace-balance scanning.
 *
 * Usage: node scripts/find-enclosing.mjs <bundle-file> <match-string>
 *
 * Contoh:
 *   node scripts/find-enclosing.mjs /tmp/served-mailpage.js 'K.useMemo(()=>E?'
 */

import fs from 'node:fs';
import { cleanJsSource } from './lib/jsscan.mjs';

const [, , bundleArg, matchStr] = process.argv;
if (!bundleArg || !matchStr) {
  console.error('Usage: node scripts/find-enclosing.mjs <bundle> <match-string>');
  process.exit(2);
}

const raw = fs.readFileSync(bundleArg, 'utf8');
// Offset harus dihitung pada RAW source (baris utk laporan),
// tapi scanning struktur dilakukan pada CLEANED source.
const src = cleanJsSource(raw);

function findOffset(s, needle) {
  const idx = s.indexOf(needle);
  return idx;
}

// Match boleh diberikan pada raw atau cleaned — coba cleaned dulu, fallback raw.
let T = src.indexOf(matchStr);
if (T === -1) {
  const tRaw = raw.indexOf(matchStr);
  if (tRaw !== -1) T = tRaw;
}
if (T === -1) {
  console.error(`Match "${matchStr}" tidak ditemukan di bundle.`);
  process.exit(2);
}

// Kolom & baris utk laporan (dihitung dari RAW)
let line = 1, col = 0;
for (let i = 0; i < Math.min(T, raw.length); i++) {
  if (raw[i] === '\n') { line++; col = 0; } else col++;
}
console.log(`Match ditemukan pada raw-line ${line}, raw-col ${col} (offset ${T})`);

const back = src.slice(0, T);

// ── Kumpulkan kandidat fungsi sebelum posisi hook ────────────────────────────
const FN_RE = /(?:function\s+([A-Za-z_$][\w$]*)\s*\()|((?:[A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>)/g;

function skipBalancedParen(str, fromIdx) {
  // fromIdx menunjuk '(' pembuka; balik index SETELAH ')' penutupnya.
  let pd = 0;
  let j = fromIdx;
  for (; j < str.length; j++) {
    if (str[j] === '(') pd++;
    else if (str[j] === ')') { pd--; if (pd === 0) return j + 1; }
  }
  return j;
}

/** Dari index kandidat, cari offset body '{' (atau -1). */
function bodyOpenIdx(candFull, candIdx) {
  if (candFull.startsWith('function')) {
    const pOpen = back.indexOf('(', candIdx);
    if (pOpen === -1) return -1;
    const after = skipBalancedParen(back, pOpen);
    let j = after;
    while (j < back.length && /\s/.test(back[j])) j++;
    return back[j] === '{' ? j : -1;
  }
  // arrow: setelah '=>', boleh ada parens pembungkus lalu '{'
  let j = candIdx + candFull.length;
  while (j < back.length) {
    const ch = back[j];
    if (/\s/.test(ch)) { j++; continue; }
    if (ch === '(') { j = skipBalancedParen(back, j); continue; }
    break;
  }
  return back[j] === '{' ? j : -1;
}

/** Hitung brace-depth dari openIdx sampai T; -1 kalau ketutup lebih dulu. */
function depthAtTarget(openIdx) {
  let depth = 0;
  let inStr = null;
  let inLineComment = false;
  let inBlockComment = false;
  for (let k = openIdx; k < T; k++) {
    const ch = back[k];
    const nx = back[k + 1];
    if (inLineComment) { if (ch === '\n') inLineComment = false; continue; }
    if (inBlockComment) { if (ch === '*' && nx === '/') { inBlockComment = false; k++; } continue; }
    if (inStr) {
      if (ch === '\\') { k++; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '/' && nx === '/') { inLineComment = true; k++; continue; }
    if (ch === '/' && nx === '*') { inBlockComment = true; k++; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { inStr = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth < 0) return -1; // fungsi sudah tertutup sebelum T
    }
  }
  return depth >= 1 ? depth : -1;
}

const cands = [];
let m;
while ((m = FN_RE.exec(back))) {
  const name = m[1] || (m[2] ? m[2].slice(0, m[2].indexOf('=')).trim() : '<anon>');
  cands.push({ name, idx: m.index, full: m[0] });
}

console.log(`${cands.length} kandidat fungsi sebelum hook.\n`);

// Cari enclosing TERLUAR yang masih terbuka di posisi target:
// iterasi dari kandidat terakhir (terdekat), catat SEMUA yang memuat,
// lalu laporkan yang paling luar di antara mereka.
let foundAny = false;
const containing = [];
for (let i = cands.length - 1; i >= 0; i--) {
  const c = cands[i];
  const openIdx = bodyOpenIdx(c.full, c.idx);
  if (openIdx === -1 || openIdx >= T) continue;
  const d = depthAtTarget(openIdx);
  if (d >= 1) {
    containing.push({ name: c.name, openIdx, depthAtHook: d });
  }
}

if (containing.length === 0) {
  console.log('❌ TIDAK ADA fungsi mencakup hook → HOOK DI MODULE LEVEL (VIOLATION!)');
  process.exit(1);
}

foundAny = true;
console.log('✅ Fungsi pembungkus (dari luar → dalam):');
for (const c of [...containing].reverse()) {
  console.log(`   - ${c.name}  (braceDepth di posisi hook: ${c.depthAtHook})`);
}

// Fungsi TERDEKAT = pembungkus langsung hook
const nearest = containing[0];
console.log(`\n👉 Nearest enclosing function: "${nearest.name}"`);

// Kelasifikasi
if (/^[A-Z]/.test(nearest.name)) {
  console.log('   ✅ Nama kapital → component. Legal (asalkan hook tak bersyarat).');
} else if (/^use[A-Z]/.test(nearest.name)) {
  console.log('   ✅ Custom hook. Legal.');
} else {
  console.log(`   ❌ "${nearest.name}" BUKAN component/custom-hook → PELANGGARAN RULES OF HOOKS!`);
  process.exit(1);
}
