#!/usr/bin/env node
import fs from 'node:fs';

const src = fs.readFileSync('src/App.jsx', 'utf8');
let ok = true;
for (const [label, pattern] of [
  ['reload key', /CHUNK_RELOAD_KEY/],
  ['reload window', /CHUNK_RELOAD_WINDOW_MS\s*=\s*30_000/],
  ['timestamp flag', /sessionStorage\.setItem\(CHUNK_RELOAD_KEY, String\(Date\.now\(\)\)\)/],
  ['expiry comparison', /Date\.now\(\) - last > CHUNK_RELOAD_WINDOW_MS/],
  ['reload action', /window\.location\.reload\(\)/],
]) {
  if (!pattern.test(src)) {
    console.error(`✗ Missing chunk recovery contract: ${label}`);
    ok = false;
  }
}
if (ok) console.log('✓ Lazy chunk recovery is retryable with a 30s loop guard');
process.exit(ok ? 0 : 1);
