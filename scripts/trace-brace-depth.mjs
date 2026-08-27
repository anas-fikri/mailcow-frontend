#!/usr/bin/env node
/**
 * Depth-scan per-baris untuk satu file sumber.
 *
 * Lacak braceDepth BERSIH (via cleanJsSource) pada akhir tiap baris, mulai
 * dari baris deklarasi fungsi. Depth harus >= 1 selama masih di dalam fungsi;
 * jika menyentuh 0 sebelum akhir file → struktur rusak / kurung tak seimbang.
 *
 * Usage: node scripts/trace-brace-depth.mjs <file> [startLine]
 */

import fs from 'node:fs';
import { cleanJsSource } from './lib/jsscan.mjs';

const [, , fileArg, startArg] = process.argv;
if (!fileArg) {
  console.error('Usage: node scripts/trace-brace-depth.mjs <file> [startLine]');
  process.exit(2);
}

const raw = fs.readFileSync(fileArg, 'utf8');
const cleaned = cleanJsSource(raw);

const start = startArg ? parseInt(startArg, 10) : 1;

let depth = 0;
let line = 1;
let started = false;

const out = [];
const zeroLines = [];

for (let i = 0; i < cleaned.length; i++) {
  const ch = cleaned[i];

  if (ch === '\n') {
    // Akhir baris `line` → catat depth bila sudah masuk region mulai
    if (!started && line >= start) started = true;
    if (started) {
      const preview = (raw.split('\n')[line - 1] || '').trim().slice(0, 55).padEnd(55);
      const mark = depth === 0 ? ' ⟵⚠️ DEPTH=0' : '';
      out.push(`${String(line).padStart(5)}  ${String(depth).padStart(3)}  ${preview}${mark}`);
      if (depth === 0) zeroLines.push(line);
    }
    line++;
    continue;
  }

  if (!started) continue; // abaikan sebelum baris mulai

  if (ch === '{') depth++;
  else if (ch === '}') {
    depth--;
    if (depth < 0) {
      console.log(`❌ Depth NEGATIF (-1) tercapai pada baris ${line} — struktur rusak di sini!`);
      const prev5 = out.slice(-6);
      for (const l of prev5) console.log(l);
      process.exit(1);
    }
  }
}

// Cetak ringkas: hanya baris dengan depth 0, plus tiap-10-baris ringkas
console.log(`# ${fileArg} — depth trace mulai raw-line ${start}`);
console.log('# hanya baris berkejadian penting ditampilkan penuh\n');

const interesting = out.filter((_, idx) => {
  return true; // tampilkan semua dulu; filter nanti via grep
});

for (const l of interesting) console.log(l);

if (zeroLines.length > 0) {
  console.log(`\n⚠️  ${zeroLines.length} baris dengan DEPTH=0 (pertama: line ${zeroLines[0]}):`);
  console.log('   ' + zeroLines.join(', '));
} else {
  console.log('\n✅ Tidak ada baris dengan depth=0 — struktur balanced.');
}
