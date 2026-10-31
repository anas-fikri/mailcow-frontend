// ─── Pratinjau dokumen Word (.docx) ──────────────────────────────────────────
// Konversi .docx → HTML via mammoth (dynamic import di dalam fungsi → chunk
// terpisah, cuma ke-load saat pratinjau dibuka), lalu sanitasi ketat via
// DOMPurify sebelum hasilnya dirender dengan dangerouslySetInnerHTML di modal
// pratinjau. HTML dokumen adalah konten dari file eksternal → WAJIB di-whitelist.

import DOMPurify from 'dompurify';

/** Whitelist tag/attr untuk HTML hasil konversi dokumen (murni markup konten). */
export const DOC_PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'hr', 'span', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'small', 'mark',
    'ol', 'ul', 'li',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
    'a', 'img', 'blockquote', 'pre', 'code',
  ],
  ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'start', 'dir', 'class'],
  ALLOW_DATA_ATTR: false,
  // URI: https/ftp/mailto + relatif, PLUS data:image/* saja (mammoth embed
  // gambar docx sbg data:image;base64). data:text/html & kawan-kawan dibuang
  // — DOMPurify default mengizinkan data: pada <img> via DATA_URI_TAGS.
  ALLOWED_URI_REGEXP: /^(?:(?:https?|ftp):|mailto:|data:image\/[a-z0-9+.\-]+;|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
};

/**
 * Sanitasi HTML hasil konversi dokumen sebelum render.
 * @param {string} html   HTML dari mammoth (atau sumber lain).
 * @param {object} [purify] injeksi instance DOMPurify utk test (default global).
 *   Di Node tanpa DOM, DOMPurify.isSupported = false → passthrough (pola sama
 *   dengan guard di api.js); test memakai instance berbasis jsdom.
 */
export function sanitizeDocumentHtml(html, purify = DOMPurify) {
  let out = purify?.isSupported ? purify.sanitize(html, DOC_PURIFY_CONFIG) : html;
  // Defense-in-depth: DOMPurify meng-allow SEMUA data: URI pada <img>
  // (DATA_URI_TAGS dicek sebelum ALLOWED_URI_REGEXP, dianggap aman karena img
  // tidak mengeksekusi HTML). Kebijakan kita lebih ketat: hanya data:image/*.
  // Berjalan setelah sanitize → HTML sudah terserialisasi (attr selalu
  // double-quoted), replace string-level aman & presisi.
  return out.replace(/\s+src="data:(?!image\/)[^"]*"/gi, '');
}

/**
 * Konversi buffer .docx → HTML tersanitasi.
 * Hanya untuk .docx (Office Open XML) — .doc biner lama tidak didukung mammoth
 * (caller harus rutekan .doc ke unduh/tab baru, bukan pratinjau).
 * @param {ArrayBuffer} arrayBuffer isi file .docx.
 * @returns {Promise<{html: string, messages: Array}>} html tersanitasi + catatan konversi mammoth.
 */
export async function convertDocxToHtml(arrayBuffer) {
  const mod = await import('mammoth');
  const mammoth = mod.default ?? mod;
  // Build Node mammoth hanya menerima `buffer`; build browser menerima
  // `arrayBuffer`. Browser gak punya global Buffer → path dipilih otomatis.
  const input = typeof Buffer !== 'undefined'
    ? { buffer: Buffer.from(arrayBuffer) }
    : { arrayBuffer };
  const result = await mammoth.convertToHtml(input);
  return {
    html: sanitizeDocumentHtml(String(result?.value || '')),
    messages: Array.isArray(result?.messages) ? result.messages : [],
  };
}
