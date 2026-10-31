// ─── Header threading balasan (RFC 5322) ──────────────────────────────────────
// Dipakai server.js (/api/send) untuk memasang In-Reply-To / References agar
// balasan dari webmail ter-thread dengan benar di Outlook/Gmail penerima.
// Logika murni (tanpa fetch) agar bisa diuji Node tanpa transpile.

// Hanya token "<local@domain>" tanpa spasi/karakter kontrol di dalamnya.
const MSGID_TOKEN_RE = /^<[^<>\s\x00-\x1f\x7f]{1,200}@[^<>\s\x00-\x1f\x7f]{1,200}>$/;

/**
 * Normalisasi daftar Message-ID yang dipisah spasi. Token tidak valid dibuang
 * diam-diam (header threading opsional — bukan alasan gagal kirim), duplikat
 * dihapus, dan hanya `max` token TERAKHIR yang dipertahankan.
 */
export function sanitizeMessageIdList(value, { max = 1 } = {}) {
  if (typeof value !== 'string' || !value) return '';
  const out = [];
  for (const tok of value.trim().split(/\s+/)) {
    if (MSGID_TOKEN_RE.test(tok) && !out.includes(tok)) out.push(tok);
  }
  return out.slice(-max).join(' ');
}

/**
 * Susun field nodemailer { inReplyTo, references } dari payload /api/send.
 * References dibatasi 50 token terakhir (cukup utk thread panjang, hemat header).
 */
export function buildThreadingHeaders(payload = {}) {
  const inReplyTo = sanitizeMessageIdList(payload.inReplyTo, { max: 1 });
  let references = sanitizeMessageIdList(payload.references, { max: 50 });
  // RFC 5322 §3.6.4: References harus memuat In-Reply-To di ujung bila ada.
  if (inReplyTo && !references.split(' ').includes(inReplyTo)) {
    references = (references ? references + ' ' : '') + inReplyTo;
  }
  return {
    ...(inReplyTo ? { inReplyTo } : {}),
    ...(references ? { references } : {}),
  };
}
