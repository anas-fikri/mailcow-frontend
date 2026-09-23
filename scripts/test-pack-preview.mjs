// Test pratinjau paket: PowerPoint (.pptx) outline & arsip (.zip) listing.
// Jalankan: node scripts/test-pack-preview.mjs
// Fixture dibangun via JSZip (dep produksi) — bukan file biner di repo.
import assert from 'node:assert/strict';

// DOMParser dibutuhkan parser XML pptx — sediakan dari jsdom (di browser native).
const { JSDOM } = await import('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;

const JSZip = (await import('jszip')).default;
const { parsePptx, listZip } = await import('../src/lib/packPreview.js');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('FAIL:', msg); } };

const P_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';

function slideXml(title, bullets) {
  const shapes = [];
  shapes.push(`<p:sp><p:nvSpPr><p:ph type="title"/></p:nvSpPr><p:txBody><a:p><a:r><a:t>${title}</a:t></a:r></a:p></p:txBody></p:sp>`);
  const bp = bullets.map((b) => `<a:p><a:r><a:t>${b}</a:t></a:r></a:p>`).join('');
  shapes.push(`<p:sp><p:nvSpPr><p:ph type="body"/></p:nvSpPr><p:txBody>${bp}</p:txBody></p:sp>`);
  return `<?xml version="1.0"?><p:sld xmlns:p="${P_NS}" xmlns:a="${A_NS}"><p:cSld><p:spTree>${shapes.join('')}</p:spTree></p:cSld></p:sld>`;
}

async function makePptx(slideDefs) {
  const zip = new JSZip();
  for (let i = 0; i < slideDefs.length; i++) {
    zip.file(`ppt/slides/slide${i + 1}.xml`, slideXml(slideDefs[i].title, slideDefs[i].bullets));
  }
  return zip.generateAsync({ type: 'arraybuffer' });
}

// ── PPTX: outline slide ──────────────────────────────────────────────────────
{
  const buf = await makePptx([
    { title: 'Laporan Bulanan', bullets: ['Penjualan naik 12%', 'Target tercapai'] },
    { title: 'Rencana Depan', bullets: ['Ekspansi cabang'] },
  ]);
  const { slides, slideCount } = await parsePptx(buf);
  ok(slideCount === 2, 'pptx: jumlah slide terdeteksi');
  ok(slides.length === 2, 'pptx: outline 2 slide');
  ok(slides[0].title === 'Laporan Bulanan', 'pptx: judul slide 1 dari placeholder title');
  ok(slides[0].bullets.length === 2 && slides[0].bullets[0] === 'Penjualan naik 12%', 'pptx: bullet body terekstrak');
  ok(slides[1].number === 2, 'pptx: nomor slide urut');
}

// Slide tanpa judul → teks shape pertama jadi judul
{
  const buf = await makePptx([{ title: '', bullets: ['Poin pertama', 'Poin kedua'] }]);
  const { slides } = await parsePptx(buf);
  ok(slides[0].title === 'Poin pertama' && slides[0].bullets.length === 1, 'pptx: slide tanpa title placeholder pakai teks pertama sbg judul');
}

// File bukan pptx (zip kosong) → error jelas, bukan crash
{
  const zip = new JSZip();
  const buf = await zip.generateAsync({ type: 'arraybuffer' });
  await assert.rejects(() => parsePptx(buf), /slide/i, 'pptx: file bukan pptx → error jelas');
}

// ── ZIP: listing entri ───────────────────────────────────────────────────────
{
  const zip = new JSZip();
  zip.file('docs/laporan.txt', 'isi laporan');
  zip.file('data.csv', 'a,b,c');
  zip.folder('empty-dir');
  const buf = await zip.generateAsync({ type: 'arraybuffer' });
  const { entries, totalCount, truncated } = await listZip(buf);
  ok(totalCount === 4, 'zip: total entri benar (folder docs/ + empty-dir/ tetap entri)');
  ok(truncated === false, 'zip: tidak truncated');
  const names = entries.map((e) => e.name);
  ok(names.includes('data.csv') && names.includes('docs/laporan.txt'), 'zip: nama entri terbaca');
  const csv = entries.find((e) => e.name === 'data.csv');
  ok(csv.size === '5 B', `zip: ukuran terformat (dapat: ${csv.size})`);
  ok(typeof csv.dir === 'boolean' && csv.dir === false, 'zip: flag dir benar utk file');
}

// Truncation 500 entri
{
  const zip = new JSZip();
  for (let i = 0; i < 520; i++) zip.file(`f${i}.txt`, 'x');
  const { entries, totalCount, truncated } = await listZip(await zip.generateAsync({ type: 'arraybuffer' }));
  ok(truncated === true && entries.length === 500 && totalCount === 520, 'zip: truncation di 500 entri');
}

// Bukan zip → error jelas
{
  await assert.rejects(() => listZip(Buffer.from('bukan zip')), /zip|corrupt|encrypted|File/i, 'zip: file bukan zip → error jelas');
}

console.log(`test-pack-preview: ${pass} assertion OK, ${fail} failed`);
process.exit(fail ? 1 : 0);
