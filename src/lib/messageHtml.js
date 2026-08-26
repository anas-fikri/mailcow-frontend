// ─── Deteksi HTML di dalam pesan text/plain ──────────────────────────────────
// Logika murni (tanpa DOM) agar bisa diuji oleh Node tanpa transpile JSX.

// Pola tag HTML umum — dipakai utk mendeteksi pesan text/plain yang berisi
// markup (mis. bounce mail "Mail delivery failed" dari SOGo): tampilkan
// sebagai HTML yang di-sanitize, bukan sumber mentah yang di-escape.
export const HTML_IN_PLAIN_RE = /<(?:div|p|br|table|tr|td|th|ul|ol|li|h[1-6]|a|span|font|b|strong|i|em|u|center|img|blockquote|pre|code|html|body|head|title)[\s>]/i;

/**
 * Periksa apakah konten text/plain berisi markup HTML yang perlu dirender
 * sebagai HTML (bukan di-escape). Heuristik tag spesifik mencegah salah-render
 * teks biasa yang hanya memakai `<`/`>` (kode, perbandingan, a < b).
 */
export function looksLikeHtmlInPlainText(content) {
  if (!content) return false;
  return HTML_IN_PLAIN_RE.test(content);
}

/** Cari konten text/html di kedalaman mana pun dari tree parts. */
function findHtml(parts) {
  if (!parts) return null;
  const ct = parts.contentType || '';
  if (ct === 'text/html' && parts.content) return parts.content;
  if (Array.isArray(parts.content)) {
    for (const child of parts.content) {
      const found = findHtml(child);
      if (found) return found;
    }
  }
  return null;
}

/** Cari konten text/plain di kedalaman mana pun dari tree parts. */
function findPlain(parts) {
  if (!parts) return null;
  const ct = parts.contentType || '';
  if (ct === 'text/plain' && parts.content) return parts.content;
  if (Array.isArray(parts.content)) {
    for (const child of parts.content) {
      const found = findPlain(child);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Ambil konten HTML dari struktur MIME parts SOGo (view).
 * - text/html DIKEDALKAN di kedalaman mana pun — SOGo sering menaruh
 *   text/html di dalam multipart/alternative yang bersarang di dalam
 *   multipart/mixed, sementara text/plain ada di urutan part lebih awal;
 *   versi lama hanya cek child langsung sehingga plain bisa menang.
 * - text/plain → dibungkus div white-space:pre-wrap (jangan escape: biarkan
 *   DOMPurify yang handle — SOGo sering kirim bounce sebagai text/plain berisi
 *   tag HTML semu, dan di-hydrate ke contentEditable via innerHTML)
 */
export function extractHtml(parts) {
  const html = findHtml(parts);
  if (html) return html;
  const plain = findPlain(parts);
  if (plain) return `<div style="white-space:pre-wrap">${plain}</div>`;
  return '';
}

/**
 * Kumpulkan lampiran (part non-inline dengan downloadURL) dari tree parts.
 * @returns {Array<{name:string, size:*, contentType:string, downloadURL:string}>}
 */
export function extractAttachments(parts, result = []) {
  if (!parts) return result;
  const ct = parts.contentType || '';
  const isInline = ct === 'text/html' || ct === 'text/plain';
  if ((parts.downloadURL || parts.viewURL) && !isInline) {
    result.push({
      name: parts.filename || parts.name || 'attachment',
      size: parts.size || 0,
      contentType: ct,
      downloadURL: parts.downloadURL || parts.viewURL,
      // viewURL utk preview lightbox (SOGo viewPart) — preview aman di iframe/img.
      viewURL: parts.viewURL || parts.downloadURL,
    });
  }
  if (Array.isArray(parts.content)) {
    parts.content.forEach((child) => extractAttachments(child, result));
  }
  return result;
}
