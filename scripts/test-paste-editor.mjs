import assert from 'node:assert/strict';
import fs from 'node:fs';

// ── Regresi 2026-08-27 (audit ComposeModal rich-text): ──────────────────────
// 1. Plain mode: teks polos user yang mengandung '<' (mis. "a < b", kode)
//    TIDAK boleh di-strip tiap re-render (sebelumnya regex strip-tag di value
//    textarea memakan '<' → user tidak bisa mengetik karakter tsb).
// 2. Paste fallback Clipboard API: e.preventDefault() harus SYNCHRON sebelum
//    await — kalau ditunda, browser sudah paste teks default → gambar ganda.

const compose = fs.readFileSync('src/components/mailer/ComposeModal.jsx', 'utf8');
const paste = fs.readFileSync('src/lib/pasteUtils.js', 'utf8');

let passCount = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passCount++; };

// ── Fix 1: PlainBodyTextarea — jangan strip teks polos user ─────────────────
ok(compose.includes('function PlainBodyTextarea'), 'PlainBodyTextarea harus ada');
ok(compose.includes('const HTML_TAG_RE = /<[a-z][^>]*>/i;'), 'deteksi HTML tag harus ada (regex tag lengkap)');
ok(compose.includes("const display = HTML_TAG_RE.test(String(body || '')) ? htmlToPlainText(body) : body;"),
  'display harus pakai deteksi tag: HTML → strip, teks polos → apa adanya');
ok(compose.includes("value={display}"), 'textarea plain harus pakai display (bukan body.replace langsung)');
// Regresi kunci: teks "a < b" (tanpa tag lengkap) tidak boleh diubah.
ok(!compose.includes("value={body.replace(/<[^>]*>?/gm, '')}"),
  'regex strip-tag di value textarea HARUS dihapus (memakan < milik user)');

// ── Fix 2: paste fallback — preventDefault sinkron sebelum await ────────────
ok(paste.includes("const hasFileType = Array.from(dt.types || []).some("),
  'fallback clipboard harus cek dt.types utk indikasi file/gambar');
ok(paste.includes("if (!hasFileType) return null;"),
  'clipboard teks biasa → biarkan browser paste default (tanpa preventDefault)');
// Urutan: preventDefault HARUS sebelum await tryReadClipboardImages.
const beforeAwait = paste.indexOf('e.preventDefault();\n  setIsPasting?.(true);\n  const clipboardImages = await tryReadClipboardImages();');
ok(beforeAwait > -1, 'preventDefault harus SYNCHRON sebelum await tryReadClipboardImages');
ok(!paste.includes('const clipboardImages = await tryReadClipboardImages();\n  if (clipboardImages.length > 0) {\n    e.preventDefault();'),
  'TIDAK boleh ada preventDefault setelah await (regresi race paste ganda)');

console.log(`test-paste-editor: ${passCount} assertion PASS`);
