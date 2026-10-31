/**
 * GUARD — public/*.html TIDAK boleh punya <script> inline.
 *
 * Latar belakang (2026-09-05): `public/help/email-settings.html` punya inline
 * <script> untuk fitur ?domain= (menyesuaikan host IMAP/SMTP per domain).
 * Produksi menerapkan CSP `script-src 'self'` di `location /webmail` DAN di
 * `location ~* \.html$` → inline script diblokir diam-diam → fitur mati tanpa
 * error (kelas "fitur mati senyap walau semua unit test hijau", sama seperti
 * imageProxy dulu). Sidebar mengandalkan ?domain= untuk host yang benar.
 *
 * Perbaikan: script diekstrak ke file eksternal (email-settings.js) — pola
 * yang sama dengan theme-init.js. Guard ini mencegah inline script masuk
 * kembali ke file HTML public.
 *
 * Jalankan: node scripts/test-public-html.mjs (bagian suite test-*.mjs)
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

const htmlFiles = [];
function addDir(dir) {
  const full = join(ROOT, dir);
  if (!existsSync(full)) return;
  for (const f of readdirSync(full, { withFileTypes: true })) {
    if (f.isDirectory()) addDir(join(dir, f.name));
    else if (/\.html$/.test(f.name)) htmlFiles.push(join(dir, f.name));
  }
}
addDir('public');

// <script> tanpa atribut src (inline body) — hanya kita yang menulisnya.
const INLINE_SCRIPT_RE = /<script(?![^>]*\bsrc=)[^>]*>/gi;

let failed = 0;
if (htmlFiles.length === 0) {
  console.error('❌ public-html guard: tidak ada file HTML di public/ — periksa driver.');
  process.exit(1);
}

for (const rel of htmlFiles) {
  const html = readFileSync(join(ROOT, rel), 'utf8');
  const m = html.match(INLINE_SCRIPT_RE);
  if (m) {
    failed = 1;
    console.error(`❌ ${rel}: ${m.length} inline <script> (diblokir CSP script-src 'self' — pindahkan ke file eksternal):`);
    for (const tag of m) console.error(`   ${tag.trim()}`);
  }
}

if (failed === 0) {
  console.log(`✅ public-html guard: ${htmlFiles.length} file HTML tanpa inline script`);
  process.exit(0);
} else {
  console.error('\nAturan: skrip di public HTML harus file eksternal same-origin (mis. <script src="x.js">).');
  process.exit(1);
}