// Test pratinjau dokumen Word (.docx): sanitasi DOMPurify + konversi mammoth.
// Jalankan: node scripts/test-doc-preview.mjs
// Butuh DOM (jsdom) untuk DOMPurify — instance disetup manual di sini.
import assert from 'node:assert/strict';

// ── Setup jsdom SEBELUM import docPreview (DOMPurify butuh window) ──────────
const { JSDOM } = await import('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;

const DOMPurify = (await import('dompurify')).default;
const { sanitizeDocumentHtml, convertDocxToHtml } = await import('../src/lib/docPreview.js');

let pass = 0;
const ok = (cond, msg) => { ok.count++; assert.ok(cond, msg); pass++; };
ok.count = 0;

// 1. Script/iframe/event-handler dibuang, markup sah lolos
const clean = sanitizeDocumentHtml(
  '<p onclick="steal()">hi</p><script>alert(1)</script><iframe src="//evil"></iframe>' +
  '<img src="x" onerror="p()"><a href="https://ok.example/a">l</a>',
  DOMPurify,
);
ok(!clean.includes('script') && !clean.includes('iframe') && !clean.includes('onerror') && !clean.includes('onclick'), 'script/iframe/handler dibuang');
ok(clean.includes('href="https://ok.example/a"'), 'href aman dipertahankan');

// 2. javascript: URI dibuang
ok(!sanitizeDocumentHtml('<a href="javascript:alert(1)">x</a>', DOMPurify).includes('javascript:'), 'javascript: URI dibuang');

// 3. data: non-image dibuang (defense-in-depth post-sanitize; DOMPurify
//    meng-allow semua data: pada <img> via DATA_URI_TAGS sebelum regexp custom)
ok(!sanitizeDocumentHtml('<img src="data:text/html;base64,PHNjcmlwdD4=">', DOMPurify).includes('data:text/html'), 'data:text/html dibuang');

// 4. data:image dipertahankan (mammoth embed gambar docx sbg data:image)
ok(sanitizeDocumentHtml('<img src="data:image/png;base64,iVBORw0KGgo=">', DOMPurify).includes('data:image/png'), 'data:image dipertahankan');

// 5. Markup dokumen sah lolos
ok(sanitizeDocumentHtml('<h1>J</h1><p>P <strong>t</strong></p><table><tr><td>A</td></tr></table>', DOMPurify).includes('<h1>'), 'markup sah lolos');

// 6. Konversi .docx riil (fixture minimal dibangun via JSZip bawaan mammoth)
const JSZip = (await import('jszip')).default;
const zip = new JSZip();
zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Halo docx</w:t></w:r></w:p></w:body></w:document>');
const conv = await convertDocxToHtml(await zip.generateAsync({ type: 'arraybuffer' }));
ok(conv.html.includes('Halo docx'), 'konversi docx riil menghasilkan teks');
ok(!conv.html.includes('<script'), 'hasil konversi tersanitasi');

console.log(`test-doc-preview: ${pass} assertion OK`);

// ── Kontrak render di MessageReader (regresi bug "tag tampil mentah") ────────
// HTML tersanitasi HARUS dirender sbg HTML via dangerouslySetInnerHTML — React
// meng-escape string interpolasi `{html}` → tag tampil sebagai teks mentah.
const fs = await import('node:fs');
const readerSrc = fs.readFileSync(new URL('../src/components/mailer/MessageReader.jsx', import.meta.url), 'utf8');
ok(readerSrc.includes('dangerouslySetInnerHTML={{ __html: docPreview.html }}'), 'reader: docx html dirender sbg HTML (ter-sanitasi di lib)');
ok(!readerSrc.includes('>{docPreview.html}</div>'), 'reader: docx html TIDAK dirender sbg teks interpolasi');
console.log(`test-doc-preview: total ${pass} assertion OK`);
