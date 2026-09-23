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

/** Cari konten text/html di kedalaman mana pun dari tree parts (array-aware). */
function findHtml(parts) {
  if (!parts) return null;
  if (Array.isArray(parts)) {
    for (const child of parts) {
      const found = findHtml(child);
      if (found) return found;
    }
    return null;
  }
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

/** Cari konten text/plain di kedalaman mana pun dari tree parts (array-aware). */
function findPlain(parts) {
  if (!parts) return null;
  if (Array.isArray(parts)) {
    for (const child of parts) {
      const found = findPlain(child);
      if (found) return found;
    }
    return null;
  }
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
 * - parts bisa OBJECT ({contentType, content:[...]}) ATAU ARRAY langsung
 *   (dari UIxMailPartViewer.m renderedPart / UIxMailPartMessageViewer — lihat
 *   knowledge 2026-08-19; tanpa guard ini body tidak pernah tampil).
 * - text/html DICARI di kedalaman mana pun — SOGo sering menaruh text/html
 *   di dalam multipart/alternative yang bersarang di dalam multipart/mixed,
 *   sementara text/plain ada di urutan part lebih awal; versi lama hanya cek
 *   child langsung sehingga plain bisa menang.
 * - text/plain → dibungkus div white-space:pre-wrap (jangan escape: biarkan
 *   DOMPurify yang handle — SOGo sering kirim bounce sebagai text/plain berisi
 *   tag HTML semu, dan di-hydrate ke contentEditable via innerHTML)
 */
export function extractHtml(parts) {
  // findHtml/findPlain array-aware: prioritas html di SEMUA elemen array dulu,
  // baru plain — array bisa muncul di top-level maupun bersarang.
  const html = findHtml(parts);
  if (html) return html;
  const plain = findPlain(parts);
  if (plain) return `<div style="white-space:pre-wrap">${plain}</div>`;
  return '';
}

/**
 * Kumpulkan lampiran (part non-inline dengan downloadURL) dari tree parts.
 *
 * Aturan tampil (sama dengan SOGo native Message.service.js:464):
 * part dengan shouldDisplayAttachment === 0 adalah konten yang SUDAH tampil
 * di body (gambar inline/CID — banner & footer vendor) dan TIDAK boleh
 * masuk daftar lampiran; flag undefined/1 tetap dihitung lampiran.
 *
 * opts.includeHidden: ikutkan part flag-0 (jalur DATA — restore draft &
 * export .eml butuh isi file-nya walau UI tidak menampilkannya sebagai
 * lampiran; tanpa ini gambar CID hilang saat draft dikirim/di-export).
 *
 * parts bisa OBJECT atau ARRAY langsung (lihat extractHtml).
 *
 * @returns {Array<{name:string, size:*, contentType:string, downloadURL:string}>}
 */
export function extractAttachments(parts, result = [], opts = {}) {
  if (!parts) return result;
  if (Array.isArray(parts)) {
    parts.forEach((child) => extractAttachments(child, result, opts));
    return result;
  }
  // Gambar inline (CID) sudah dirender di body via resolver cid: — jangan
  // diduplikasi di daftar Lampiran (regresi "footer email jadi lampiran").
  if (!opts.includeHidden && parts.shouldDisplayAttachment === 0) return result;
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
      // Content-ID + inline utk export .eml: part CID ikut di-export
      // (includeHidden) dan harus ditulis sbg inline dgn Content-ID di
      // multipart/related agar cid: ter-resolve di client penerima.
      contentId: parts.contentId || parts.contentID || parts.cId || '',
      inline: parts.shouldDisplayAttachment === 0,
    });
  }
  if (Array.isArray(parts.content)) {
    parts.content.forEach((child) => extractAttachments(child, result, opts));
  }
  return result;
}
