// Regresi keamanan: split kutipan TIDAK boleh menghidupkan kembali markup
// yang inert di dalam atribut (temuan security review 2026-10-11).
//
// Mekanisme bug: splitQuotedHtml memotong string HTML tersanitasi pada marker
// kutipan; marker bisa berada DI DALAM nilai atribut (title/alt). Potongan
// yang terpotong di tengah atribut, saat di-parse ulang oleh
// dangerouslySetInnerHTML, mengubah teks inert menjadi elemen hidup
// (mis. <img onerror=...>). Mitigasi: MessageReader WAJIB mensanitasi ulang
// kedua potongan sebelum render.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import { splitQuotedHtml } from '../src/lib/quoteCollapse.js';

const { window } = new JSDOM('<!doctype html><body></body>');
const DOMPurify = createDOMPurify(window);

// Payload PoC: marker kutipan + <img onerror> tertanam di DALAM atribut title.
const malicious = '<p>halo</p><div title="x>b -----Original Message----- '
  + '<img src=x onerror=alert(1)> sisa">lihat</div>'
  + '<blockquote>konten kutipan lama yang cukup panjang untuk dianggap quote</blockquote>';

// 1) Sanitasi awal (jalur prepareHtmlContent) — payload tetap inert di atribut.
const sanitized = DOMPurify.sanitize(malicious);
assert.ok(!countLiveOnerror(sanitized), 'pasca-sanitasi awal: tidak ada onerror hidup');

// 2) Split string: potongan BISA memuat onerror yang akan hidup saat re-parse.
const q = splitQuotedHtml(sanitized);
const resurrected = countLiveOnerror(q.main) + countLiveOnerror(q.quote);
// (Tidak di-assert 0 — justru inilah hazard yang didokumentasikan.)

// 3) Mitigasi: sanitasi ULANG kedua potongan → tidak boleh ada handler hidup.
for (const part of [q.main, q.quote]) {
  const safe = DOMPurify.sanitize(part);
  assert.equal(countLiveOnerror(safe), 0, 'pasca re-sanitasi: potongan harus bebas handler');
}
console.log(`hazard terdokumentasi: ${resurrected} elemen hidup dari split mentah; re-sanitasi menetralkan semuanya`);

// 4) Kontrak sumber: MessageReader MEMANG mensanitasi ulang kedua potongan.
const reader = readFileSync(new URL('../src/components/mailer/MessageReader.jsx', import.meta.url), 'utf8');
assert.ok(/main:\s*DOMPurify\.sanitize\(q\.main,\s*EMAIL_PURIFY_CONFIG\)/.test(reader),
  'MessageReader harus mensanitasi ulang quoted.main');
assert.ok(/quote:\s*DOMPurify\.sanitize\(q\.quote,\s*EMAIL_PURIFY_CONFIG\)/.test(reader),
  'MessageReader harus mensanitasi ulang quoted.quote');
assert.ok(!/dangerouslySetInnerHTML=\{\{\s*__html:\s*splitQuotedHtml/.test(reader),
  'hasil splitQuotedHtml tidak boleh langsung ke dangerouslySetInnerHTML');

/** Hitung elemen dengan handler onerror HIDUP setelah string di-parse sbg HTML. */
function countLiveOnerror(html) {
  const doc = new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
  return doc.querySelectorAll('[onerror]').length;
}

console.log('quote-split security: all assertions passed');
