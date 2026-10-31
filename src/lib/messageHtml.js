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
 * Parse blok header RFC 5322 dari sumber mentah pesan (…/{uid}/viewsource).
 * Hanya blok header (sampai baris kosong pertama) yang dibaca; baris lanjutan
 * (folded, diawali spasi/tab) digabung ke header sebelumnya. JSON /view SOGo
 * TIDAK membawa Message-ID/In-Reply-To/References (lihat fixture
 * mail-golden-detail.json) → ini satu-satunya sumber utk threading balasan.
 *
 * @param {string} rawSource teks mentah (header saja atau seluruh pesan)
 * @returns {{ raw:string, list:Array<{name:string,value:string}>, messageId:string, inReplyTo:string, references:string, get(name:string):string }}
 */
export function parseRawHeaders(rawSource) {
  const text = String(rawSource ?? '').replace(/\r\n?/g, '\n');
  const endIdx = text.search(/\n\n/);
  const block = (endIdx >= 0 ? text.slice(0, endIdx) : text).trim();
  const list = [];
  for (const line of block.split('\n')) {
    if (/^[ \t]/.test(line) && list.length) {
      list[list.length - 1].value += ' ' + line.trim();
      continue;
    }
    const m = line.match(/^([!-9;-~]+):\s*(.*)$/);
    if (m) list.push({ name: m[1], value: m[2].trim() });
  }
  // Nilai yang seluruhnya di baris lanjutan ("Message-ID:\n <id>") punya
  // spasi depan sisa penggabungan — rapikan.
  for (const h of list) h.value = h.value.trim();
  const get = (name) => {
    const n = String(name).toLowerCase();
    const hit = list.find((h) => h.name.toLowerCase() === n);
    return hit ? hit.value : '';
  };
  return {
    raw: block,
    list,
    messageId: get('message-id'),
    inReplyTo: get('in-reply-to'),
    references: get('references'),
    get,
  };
}

/**
 * Fallback metadata lampiran utk bug serializer JSON SOGo 5.12.9: part
 * non-text/image (xlsx, pdf, dll) TIDAK mendapat viewURL/downloadURL/size
 * ("found no viewer" → metadata kosong), padahal SOGo meng-embed card Angular
 * (md-card) di field `content` berisi URL asAttachment + ukuran file.
 * Diagnosa round-53 repo mailcow-dashboard (2026-09-23); jalur download via
 * URL asAttachment terbukti berfungsi normal.
 *
 * @returns {{downloadURL:string, size:*}|null}
 */
export function parseAttachmentCard(content) {
  if (typeof content !== 'string') return null;
  const url = content.match(/href="([^"]*\/asAttachment\/([^"]*))"/);
  if (!url) return null;
  const size = content.match(/sg-attachment-size[^>]*>\s*([\d.,]+\s*[KMG]?i?B)\s*</);
  return {
    // Unescape HTML entities (&amp;) dan relatifkan URL absolut agar konsisten
    // dgn format downloadURL part biasa (path tanpa origin; fetchAttachmentData
    // yang menambahkan SOGO_BASE).
    downloadURL: url[1].replace(/&amp;/g, '&').replace(/^https?:\/\/[^/]+/, ''),
    filename: url[2].replace(/&amp;/g, '&'),
    size: size ? size[1] : 0,
  };
}

/**
 * Deteksi gambar BODY email yang salah masuk daftar lampiran.
 *
 * Latar (keluhan user round-53): gambar footer/banner/tanda-tangan yang
 * dirender di body tetap muncul sbg "Lampiran". Penyebab: SOGo menandai
 * gambar tsb `shouldDisplayAttachment=1` (padahal src-nya di-rewrite ke URL
 * part di body), jadi filter flag-0 saja tidak cukup. Juga menangkap bentuk
 * klasik CID (`cid:image001.jpg@uuid`) kalau body masih memuat token mentah.
 *
 * Aturan: image/* yang nama file-nya (utuh, incl. bentuk URL-encoded)
 * ter-refer di body HTML = bagian body → BUKAN lampiran. Match filename
 * UTUH (bukan stem) supaya teks email yang kebetulan menyebut kata sama
 * tidak ikut menyembunyikan lampiran asli.
 *
 * @param {{name?:string, filename?:string, contentType?:string, inline?:boolean}} att
 * @param {string} bodyHtml - HTML body (hasil extractHtml)
 * @returns {boolean} true = gambar inline body, jangan tampilkan sbg lampiran
 */
export function isInlineBodyImage(att, bodyHtml) {
  if (!att) return false;
  if (att.inline === true) return true; // sudah ditandai inline (flag 0)
  if (!bodyHtml) return false;
  if (!String(att.contentType || '').startsWith('image/')) return false;
  const name = att.name || att.filename || '';
  if (!name) return false;
  let decoded = name;
  try { decoded = decodeURIComponent(name); } catch { /* nama non-URL — pakai apa adanya */ }
  const lower = bodyHtml.toLowerCase();
  const candidates = [name, decoded, encodeURIComponent(decoded)];
  return candidates.some((c) => c && lower.includes(String(c).toLowerCase()));
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
  let downloadURL = parts.downloadURL || parts.viewURL || '';
  let size = parts.size || 0;
  let shouldDisplay = parts.shouldDisplayAttachment;
  // Fallback: part lampiran tanpa metadata (bug serializer JSON SOGo utk
  // tipe non-text/image) — ekstrak URL & size dari card yang di-embed di
  // content. Tanpa ini attachment xlsx/pdf hilang dari daftar Lampiran.
  if (!downloadURL && !isInline) {
    const card = parseAttachmentCard(parts.content);
    if (card) {
      downloadURL = card.downloadURL;
      size = size || card.size;
      if (shouldDisplay === undefined) shouldDisplay = 1;
    }
  }
  if (downloadURL && !isInline) {
    result.push({
      name: parts.filename || parts.name || 'attachment',
      size,
      contentType: ct,
      downloadURL,
      // viewURL utk preview lightbox (SOGo viewPart) — preview aman di iframe/img.
      viewURL: parts.viewURL || downloadURL,
      // Content-ID + inline utk export .eml: part CID ikut di-export
      // (includeHidden) dan harus ditulis sbg inline dgn Content-ID di
      // multipart/related agar cid: ter-resolve di client penerima.
      contentId: parts.contentId || parts.contentID || parts.cId || '',
      inline: shouldDisplay === 0,
    });
  }
  if (Array.isArray(parts.content)) {
    parts.content.forEach((child) => extractAttachments(child, result, opts));
  }
  return result;
}
