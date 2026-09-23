/**
 * emlUtils — Parse & build pesan .eml (RFC 5322 + MIME dasar).
 *
 * Dua fungsi utama:
 * - parseEmlContent(text): ubah konten file .eml menjadi field compose
 *   (to/cc/subject/body). Dipakai saat user men-drag .eml ke ComposeModal.
 * - buildEml({...}): rekonstruksi .eml dari data pesan yang sudah dimuat
 *   webmail (header + body + lampiran base64) — dipakai tombol "Unduh .eml"
 *   di MessageReader. Tidak byte-exact dengan sumber, tapi valid & bisa dibuka
 *   Outlook/Thunderbird/Gmail.
 *
 * Murni (tanpa DOM/fetch) agar mudah diuji.
 */

// ─── Parse .eml ───────────────────────────────────────────────────────────────

function decodeMimeWord(str) {
  if (!str) return '';
  // =?charset?B?base64?= / =?charset?Q?encoded?=
  return String(str)
    .replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_m, _charset, enc, body) => {
      try {
        if (enc.toLowerCase() === 'b') {
          return decodeURIComponent(escape(atob(body.replace(/\s+/g, ''))));
        }
        // Q-encoding: _ → spasi, =XX → byte
        return decodeURIComponent(
          body
            .replace(/_/g, ' ')
            .replace(/=([0-9A-Fa-f]{2})/g, (_x, h) => `%${h}`)
        );
      } catch {
        return '';
      }
    })
    .trim();
}

function decodeHeaderValue(value) {
  if (!value) return '';
  const cleaned = String(value).replace(/\r?\n\s+/g, ' ').trim();
  return decodeMimeWord(cleaned).trim();
}

function extractAddresses(value) {
  const decoded = decodeHeaderValue(value);
  if (!decoded) return '';
  // "Name" <a@b>, c@d → ambil alamat, gabung dengan koma
  const matches = decoded.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g);
  return matches ? [...new Set(matches)].join(', ') : '';
}

/**
 * Parse konten .eml menjadi field compose.
 * Mendukung multipart/alternative + multipart/mixed (satu level, recursive
 * sederhana). Prioritas body: text/html (dipakai editor rich), fallback
 * text/plain.
 *
 * @param {string} text konten mentah file .eml
 * @returns {{ to, cc, bcc, subject, body, isHTML }}
 */
export function parseEmlContent(text) {
  const result = { to: '', cc: '', bcc: '', subject: '', body: '', isHTML: false };
  // Normalisasi CRLF → LF agar pemisahan header/body dan boundary konsisten.
  const source = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Pisahkan header & body pada baris kosong pertama
  const sepIdx = source.indexOf('\n\n');
  const headerBlock = (sepIdx >= 0 ? source.slice(0, sepIdx) : source);
  const bodyPart = sepIdx >= 0 ? source.slice(sepIdx + 2) : '';

  const headers = {};
  for (const line of headerBlock.split('\n')) {
    const m = line.match(/^([A-Za-z0-9-]+):\s?(.*)$/);
    if (m) headers[m[1].toLowerCase()] = (headers[m[1].toLowerCase()] || '') + (headers[m[1].toLowerCase()] ? ' ' : '') + m[2];
  }

  result.to = extractAddresses(headers.to);
  result.cc = extractAddresses(headers.cc);
  result.bcc = extractAddresses(headers.bcc);
  result.subject = decodeHeaderValue(headers.subject);

  const contentType = headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary\s*=\s*"?([^";]+)"?/i);
  const isMultipart = /multipart\//i.test(contentType);

  // Helper rekursif: kumpulkan bagian text/plain & text/html (decode base64/quoted-printable)
  let plain = '';
  let html = '';
  const collectParts = (data) => {
    const b = boundaryMatch ? boundaryMatch[1] : null;
    if (b && isMultipart) {
      const parts = data.split(`--${b}`).filter((p) => !/^\s*--\s*$/.test(p));
      for (const part of parts) {
        if (/^\s*--\s*$/.test(part) || part.startsWith('--')) continue; // penutup boundary
        const innerSep = part.indexOf('\n\n');
        if (innerSep < 0) continue;
        const innerHeaders = part.slice(0, innerSep).replace(/\r/g, '');
        const innerBody = part.slice(innerSep + 2).replace(/\r/g, '');
        const ct = (innerHeaders.match(/^content-type:\s*(.+)$/im) || [])[1] || '';
        const encoding = ((innerHeaders.match(/^content-transfer-encoding:\s*(.+)$/im) || [])[1] || '7bit').trim().toLowerCase();
        if (/multipart\//i.test(ct)) {
          // sub-multipart: parse boundary-nya sendiri
          const subB = ct.match(/boundary\s*=\s*"?([^";]+)"?/i);
          if (subB) {
            const subParts = innerBody.split(`--${subB}`).filter((p) => !/^\s*--\s*$/.test(p));
            for (const sp of subParts) {
              if (sp.trim().startsWith('--') && !sp.includes('\n\n')) continue;
              const spSep = sp.indexOf('\n\n');
              if (spSep < 0) continue;
              const spHeaders = sp.slice(0, spSep);
              const spBody = sp.slice(spSep + 2);
              const spCt = (spHeaders.match(/^content-type:\s*(.+)$/im) || [])[1] || '';
              const spEnc = ((spHeaders.match(/^content-transfer-encoding:\s*(.+)$/im) || [])[1] || '7bit').trim().toLowerCase();
              const decoded = decodeBody(spBody, spEnc);
              if (/^text\/plain/i.test(spCt)) plain = plain || decoded;
              if (/^text\/html/i.test(spCt)) html = html || decoded;
            }
          }
          continue;
        }
        const decoded = decodeBody(innerBody, encoding);
        if (/^text\/plain/i.test(ct)) plain = plain || decoded;
        if (/^text\/html/i.test(ct)) html = html || decoded;
      }
      return;
    }
    // Non-multipart: seluruh body adalah isi pesan
    const enc = ((headerBlock.match(/^content-transfer-encoding:\s*(.+)$/im) || [])[1] || '7bit').trim().toLowerCase();
    const decoded = decodeBody(data, enc);
    if (/text\/html/i.test(contentType)) html = decoded;
    else plain = decoded;
  };
  collectParts(bodyPart);

  if (html) {
    result.body = html;
    result.isHTML = true;
  } else {
    result.body = plain.replace(/\n{3,}/g, '\n\n');
    result.isHTML = false;
  }
  return result;
}

function decodeBody(raw, encoding) {
  const text = String(raw || '').replace(/\r/g, '');
  if (encoding === 'base64') {
    try {
      const clean = text.replace(/\s+/g, '');
      if (!clean) return '';
      // atob gagal untuk non-ASCII UTF-8 → gunakan TextDecoder
      const bin = atob(clean);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder('utf-8').decode(bytes);
    } catch { return ''; }
  }
  if (encoding === 'quoted-printable') {
    try {
      return decodeURIComponent(
        text
          .replace(/=\r?\n/g, '')
          .replace(/=([0-9A-Fa-f]{2})/g, (_m, h) => `%${h}`)
          .replace(/\+/g, '%2B')
      );
    } catch { return text; }
  }
  return text;
}

// Konversi HTML → teks polos sederhana (untuk bagian text/plain .eml).
// Bukan pengganti extractHtml — hanya cukup untuk body export .eml.
export function htmlToText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote|pre)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─── Build .eml (export) ──────────────────────────────────────────────────────

function sanitizeHeaderValue(value) {
  // Buang CR/LF agar tidak bisa header injection saat rekonstruksi
  return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

// Escape karakter khusus di filename untuk header Content-Disposition.
// RFC 6266: filename="..." — quotes & backslash perlu di-escape.
function escapeFilename(fn) {
  return String(fn || 'attachment').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function wrapBody(body, isHTML) {
  const content = String(body || '');
  if (!isHTML) {
    return {
      ct: 'text/plain; charset=UTF-8',
      enc: 'quoted-printable',
      data: encodeQP(content),
    };
  }
  return {
    ct: 'text/html; charset=UTF-8',
    enc: 'quoted-printable',
    data: encodeQP(content),
  };
}

function encodeQP(text) {
  // Encode non-ASCII & control chars ke =XX (RFC 2045 §6.7).
  // Soft line break (76-char) TIDAK wajib untuk body email — skip untuk
  // mencegah bug splitting sequence =XX. Email client toleransi tanpa wrap.
  return String(text).replace(/[^\x20-\x7E]/g, (c) =>
    `=${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`
  );
}

/**
 * Rekonstruksi .eml dari field pesan. Lampiran (base64) dijadikan bagian
 * multipart/mixed; body dibungkus multipart/alternative (text + html bila
 * keduanya ada).
 *
 * @param {object} opts { from, to, cc, bcc, subject, date, textBody, htmlBody, attachments: [{filename, contentType, data(base64), contentId?, inline?}] }
 * @returns {string} konten .eml
 */
export function buildEml(opts = {}) {
  const {
    from = '', to = '', cc = '', bcc = '', subject = '',
    date = new Date().toUTCString(), textBody = '', htmlBody = '', attachments = [],
  } = opts;

  const header = [
    `From: ${sanitizeHeaderValue(from)}`,
    `To: ${sanitizeHeaderValue(to)}`,
    ...(cc ? [`Cc: ${sanitizeHeaderValue(cc)}`] : []),
    ...(bcc ? [`Bcc: ${sanitizeHeaderValue(bcc)}`] : []),
    `Subject: ${sanitizeHeaderValue(subject)}`,
    `Date: ${sanitizeHeaderValue(date)}`,
    'MIME-Version: 1.0',
  ];

  const boundary = `----=_pcp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

  const bodyPart = (wrapped, b) =>
    `--${b}\r\nContent-Type: ${wrapped.ct}\r\nContent-Transfer-Encoding: ${wrapped.enc}\r\n\r\n${wrapped.data}\r\n`;
  const textWrapped = wrapBody(textBody, false);
  const htmlWrapped = htmlBody ? wrapBody(htmlBody, true) : null;

  const attachPart = (a, disposition, b) => {
    const fn = escapeFilename(sanitizeHeaderValue(a.filename || 'attachment'));
    const ct = sanitizeHeaderValue(a.contentType || 'application/octet-stream');
    // Content-ID dipertahankan agar <img src="cid:..."> di body HTML tetap
    // ter-resolve di client penerima (Outlook/Thunderbird menuntut header ini).
    const cid = a.contentId ? `Content-ID: <${String(a.contentId).replace(/^<|>$/g, '')}>\r\n` : '';
    return `--${b}\r\nContent-Type: ${ct}; name="${fn}"\r\n${cid}Content-Disposition: ${disposition}; filename="${fn}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${String(a.data).replace(/(.{76})/g, '$1\r\n')}\r\n`;
  };

  // Inline images (dgn Content-ID) WAJIB satu multipart/related bersama
  // htmlBody — kalau flat di multipart/mixed, cid: tidak ter-resolve di
  // client ketat (bug tertangkap E2E live 2026-09-23: PNG footer ter-export
  // tanpa Content-ID → gambar footer hilang di Outlook/Thunderbird).
  const atts = (Array.isArray(attachments) ? attachments : []).filter((a) => a && a.data);
  const inlineAtts = atts.filter((a) => a.contentId);
  const regularAtts = atts.filter((a) => !a.contentId);
  const useRelated = htmlWrapped && inlineAtts.length > 0;

  const bodyBlock = [
    'Content-Type: multipart/mixed; boundary="' + boundary + '"',
    bodyPart(textWrapped, boundary),
    ...(useRelated
      ? [
          `--${boundary}\r\nContent-Type: multipart/related; boundary="${boundary}_rel"\r\n\r\n` +
          bodyPart(htmlWrapped, `${boundary}_rel`) +
          inlineAtts.map((a) => attachPart(a, 'inline', `${boundary}_rel`)).join('') +
          `--${boundary}_rel--\r\n`,
        ]
      : htmlWrapped
        ? [bodyPart(htmlWrapped, boundary)]
        : []),
    ...regularAtts.map((a) => attachPart(a, 'attachment', boundary)),
    `--${boundary}--`,
  ].join('\r\n');

  return header.join('\r\n') + '\r\n\r\n' + bodyBlock;
}

/**
 * Cari token cid: di htmlBody yang cocok dgn filename lampiran. Dipakai export
 * .eml untuk menandai part inline — SOGo /view TIDAK mengekspos Content-ID
 * (fixture golden), satu-satunya petunjuk adalah referensi cid: di body.
 * Matching by stem tanpa ekstensi/@uuid, case-insensitive: 'footer.png' ↔
 * 'footer@uuid' ↔ 'Footer'.
 * @returns {string|null} token cid (tanpa prefix cid:) atau null
 */
export function findCidForFilename(htmlBody, filename) {
  if (!htmlBody || !filename) return null;
  const tokens = [...String(htmlBody).matchAll(/cid:([^"'>\s)]+)/gi)].map((m) => m[1]);
  if (tokens.length === 0) return null;
  const stem = (s) => String(s).toLowerCase().split('@')[0].replace(/\.[^.]*$/i, '').trim();
  const f = stem(filename);
  return tokens.find((t) => {
    const ts = stem(t);
    return ts && f && (ts === f || ts.includes(f) || f.includes(ts));
  }) || null;
}
