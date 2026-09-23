// ─── Pratinjau paket: PowerPoint (.pptx) & arsip (.zip) ──────────────────────
// Keduanya berbasis ZIP → di-parse via JSZip (dynamic import → chunk terpisah,
// cuma ke-load saat pratinjau dibuka).
//
// KEAMANAN: hasil parse berupa TEKS polos (judul/bullet/nama entri) yang
// dirender via interpolasi React — BUKAN dangerouslySetInnerHTML — jadi tidak
// perlu sanitizer. Jangan ubah output ke HTML mentah tanpa jalur sanitasi.

import { formatFileSize } from './attachments.js';

const MAX_SLIDES = 30;
const MAX_BULLETS = 15;
const MAX_TEXT_LEN = 300;
const MAX_ZIP_ENTRIES = 500;

/** Ambil teks seluruh <a:t> dalam satu <a:p> (paragraf). */
function paraText(p) {
  const ts = p.getElementsByTagName('a:t');
  let s = '';
  for (let i = 0; i < ts.length; i++) s += ts[i].textContent || '';
  return s.trim();
}

/** Ambil teks semua paragraf <a:p> dalam satu shape <p:sp>. */
function shapeParagraphs(sp) {
  const paras = [];
  const ps = sp.getElementsByTagName('a:p');
  for (let i = 0; i < ps.length; i++) {
    const t = paraText(ps[i]);
    if (t) paras.push(t.slice(0, MAX_TEXT_LEN));
    if (paras.length >= MAX_BULLETS) break;
  }
  return paras;
}

/** Tipe placeholder shape ('title'|'ctrTitle'|'body'|'subTitle'|…), atau ''. */
function placeholderType(sp) {
  const ph = sp.getElementsByTagName('p:ph')[0];
  return ph?.getAttribute('type') || '';
}

/**
 * Parse buffer .pptx → outline slide (judul + bullet teks).
 * Hanya untuk .pptx (OOXML) — .ppt biner lama tidak didukung (tetap jalur unduh).
 * @param {ArrayBuffer} arrayBuffer isi file .pptx.
 * @returns {Promise<{slides: Array<{number:number,title:string,bullets:string[]}>, slideCount:number}>}
 */
export async function parsePptx(arrayBuffer) {
  const mod = await import('jszip');
  const JSZip = mod.default ?? mod;
  const zip = await JSZip.loadAsync(arrayBuffer);

  const slideFiles = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => (parseInt(a.match(/(\d+)/)[1], 10) - parseInt(b.match(/(\d+)/)[1], 10)))
    .slice(0, MAX_SLIDES);

  const parser = typeof DOMParser !== 'undefined' ? new DOMParser() : null;
  const slides = [];

  for (let i = 0; i < slideFiles.length; i++) {
    const xml = await zip.file(slideFiles[i]).async('string');
    let title = '';
    let bullets = [];
    if (parser) {
      const doc = parser.parseFromString(xml, 'application/xml');
      if (doc.getElementsByTagName('parsererror').length) throw new Error('Slide rusak / bukan .pptx valid.');
      const shapes = doc.getElementsByTagName('p:sp');
      for (let s = 0; s < shapes.length; s++) {
        const ph = placeholderType(shapes[s]);
        const paras = shapeParagraphs(shapes[s]);
        if (!paras.length) continue;
        if (!title && (ph === 'title' || ph === 'ctrTitle')) { title = paras[0]; continue; }
        if (ph === 'body' || ph === 'subTitle' || !ph) bullets.push(...paras);
      }
      // Slide tanpa placeholder title → pakai teks shape pertama sbg judul.
      if (!title && bullets.length) title = bullets.shift();
    }
    if (title || bullets.length) slides.push({ number: i + 1, title, bullets });
  }

  if (!slides.length) throw new Error('Tidak ada slide berisi teks yang bisa dipratinjau.');
  return { slides, slideCount: slideFiles.length };
}

/**
 * List isi arsip .zip (metadata central directory — tanpa ekstraksi).
 * @param {ArrayBuffer} arrayBuffer isi file .zip.
 * @returns {Promise<{entries: Array<{name:string,size:string|null,date:string|null,dir:boolean}>, totalCount:number, truncated:boolean}>}
 */
export async function listZip(arrayBuffer) {
  const mod = await import('jszip');
  const JSZip = mod.default ?? mod;
  const zip = await JSZip.loadAsync(arrayBuffer);

  const names = Object.keys(zip.files).sort((a, b) => {
    const da = !!zip.files[a].dir, db = !!zip.files[b].dir;
    if (da !== db) return da ? 1 : -1; // file dulu, folder belakang
    return a.localeCompare(b);
  });

  const entries = names.slice(0, MAX_ZIP_ENTRIES).map((name) => {
    const f = zip.files[name];
    const size = f._data?.uncompressedSize;
    const date = f.date instanceof Date && !Number.isNaN(f.date.getTime()) ? f.date : null;
    return {
      name,
      dir: !!f.dir,
      size: size > 0 ? formatFileSize(size) : null,
      date: date ? date.toISOString().slice(0, 10) : null,
    };
  });

  return { entries, totalCount: names.length, truncated: names.length > MAX_ZIP_ENTRIES };
}
