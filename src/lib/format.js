export function getFormatSize(size) {
  if (!size && size !== 0) return '';
  const num = parseFloat(size);
  if (!Number.isFinite(num)) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = num;
  let unit = units[0];
  for (let i = 0; value >= 1024 && i < units.length - 1; i++) {
    value /= 1024;
    unit = units[i + 1];
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`;
}

export const formatSize = getFormatSize;

/**
 * Normalisasi daftar alamat dari SOGo.
 * Item bisa berupa objek {name, email}, string mentah ("user@domain"), atau
 * null/undefined (baris rusak). Semua bentuk harus aman: item null dilewati,
 * string dipakai apa adanya, objek dirangkai "Nama <email>".
 * Tanpa guard ini, item null → TypeError crash seluruh reader.
 */
export function formatAddresses(arr) {
  if (!arr) return '';
  if (typeof arr === 'string') return arr;
  if (!Array.isArray(arr)) return String(arr);
  return arr
    .map((a) => {
      if (!a) return '';
      if (typeof a === 'string') return a;
      if (typeof a === 'object') {
        const name = a.name ? String(a.name) : '';
        const email = a.email ? String(a.email) : '';
        return name && email ? `${name} <${email}>` : (name || email);
      }
      return String(a);
    })
    .filter(Boolean)
    .join(', ');
}

// ── Parsing alamat ala Outlook ───────────────────────────────────────────────
// SOGo kirim header mentah dengan artefak kutip ("'Eko Budi' <eko@x.com>")
// dan kadang sisa RFC2047 (=?utf-8?Q?...?=). UI Outlook menampilkan NAMA
// bersih tanpa kutip; helper di bawah murni (tanpa DOM) dan diuji di
// scripts/test-address-parse.mjs.

/** Buang kutip pembungkus (tunggal/ganda), berulang: `"'Budi'"` → `Budi`. */
function stripWrappingQuotes(name) {
  let s = String(name || '').trim();
  let prev;
  do {
    prev = s;
    const m = /^(['"])(.*)\1$/.exec(s);
    if (m) s = m[2].trim();
  } while (s !== prev && s);
  return s;
}

/** Decode satu encoded-word RFC2047 trivial (Q/B, UTF-8-ish). null bila bukan. */
function decodeRfc2047Word(word) {
  const m = /^=\?[^?]+\?([bBqQ])\?([^?]*)\?=$/.exec(String(word).trim());
  if (!m) return null;
  const [, enc, text] = m;
  try {
    if (enc.toLowerCase() === 'q') {
      // Q-encoding: "_" = spasi, "=HH" = byte hex → percent-decode sbg UTF-8.
      let pct = '';
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '_') pct += '%20';
        else if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(text.slice(i + 1, i + 3))) {
          pct += `%${text.slice(i + 1, i + 3)}`;
          i += 2;
        } else pct += encodeURIComponent(c);
      }
      return decodeURIComponent(pct);
    }
    // B-encoding: base64 → bytes → UTF-8 (Node pakai Buffer, browser atob).
    if (typeof Buffer !== 'undefined') return Buffer.from(text, 'base64').toString('utf8');
    const bin = atob(text);
    return decodeURIComponent(
      Array.from(bin).map((ch) => `%${ch.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')
    );
  } catch {
    return null; // bukan "trivial" → biarkan apa adanya
  }
}

/** Ganti semua encoded-word trivial dalam string; sisanya dibiarkan utuh. */
function decodeRfc2047(str) {
  return String(str || '').replace(/=\?[^?\s]+\?[bBqQ]\?[^?\s]*\?=/g, (w) => {
    const d = decodeRfc2047Word(w);
    return d == null ? w : d;
  });
}

/**
 * Pecah string daftar alamat pada koma/titik-koma di LUAR kutip dan `<...>` —
 * nama mengandung koma ("Pratama, Andi" <a@x.com>) tidak boleh terbelah.
 */
function splitAddressString(raw) {
  const out = [];
  let buf = '';
  let quote = null;
  let inAngle = false;
  for (const ch of String(raw)) {
    if (quote) {
      if (ch === quote) quote = null;
      buf += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; buf += ch; continue; }
    if (ch === '<') inAngle = true;
    if (ch === '>') inAngle = false;
    if ((ch === ',' || ch === ';') && !inAngle) {
      if (buf.trim()) out.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/** Satu token alamat → {name, email}; null bila kosong. */
function parseAddressToken(token) {
  const t = decodeRfc2047(String(token).trim());
  if (!t) return null;
  const angle = /^(.*?)<([^>]*)>\s*$/.exec(t);
  if (angle) {
    const email = angle[2].trim();
    const name = stripWrappingQuotes(angle[1]);
    if (!name && !email) return null;
    return { name, email };
  }
  const bare = stripWrappingQuotes(t);
  if (!bare) return null;
  if (bare.includes('@')) return { name: '', email: bare };
  return { name: bare, email: '' };
}

/**
 * Parse daftar alamat → [{name, email}]. Menerima string mentah
 * ("'A' <a@x>, b@y; \"C, D\" <c@z>"), array string, array objek {name,email}
 * (bentuk SOGo), objek tunggal, atau null. Nama selalu tanpa kutip pembungkus.
 */
export function parseAddressList(raw) {
  if (raw == null || raw === '') return [];
  if (typeof raw === 'string') {
    return splitAddressString(raw).map(parseAddressToken).filter(Boolean);
  }
  if (Array.isArray(raw)) {
    const out = [];
    for (const item of raw) out.push(...parseAddressList(item));
    return out;
  }
  if (typeof raw === 'object') {
    const email = raw.email || raw.address ? String(raw.email || raw.address).trim() : '';
    const name = stripWrappingQuotes(decodeRfc2047(raw.name ? String(raw.name) : ''));
    if (!name && !email) return [];
    return [{ name, email }];
  }
  return parseAddressList(String(raw));
}

/**
 * Ringkasan penerima ala Outlook: "Eko Budi, Rudi Hartono, Dewi Lestari +2".
 * Nama dipakai bila ada, fallback email. moreSuffix opsional utk copy
 * berbahasa ("+2 lainnya").
 */
export function formatRecipientSummary(list, { max = 3, moreSuffix = '' } = {}) {
  const names = (Array.isArray(list) ? list : [])
    .map((a) => (a && (a.name || a.email)) || '')
    .filter(Boolean);
  if (names.length === 0) return '';
  if (names.length <= max) return names.join(', ');
  return `${names.slice(0, max).join(', ')} +${names.length - max}${moreSuffix}`;
}

export function renderDate(value) {
  if (!value) return '';
  // Format detail SOGo produksi: "Friday, September 04, 2026 14:24 WIB" —
  // suffix zona 3-huruf non-ISO membuat Date.parse → NaN (V8 tak kenal WIB).
  // Buang suffix itu; tanpa zona, string diparse sebagai waktu LOKAL —
  // memang benar karena SOGo sudah merender di zona user (WIB).
  let s = String(value).trim();
  const withoutTz = s.match(/^(.*?\d{2}:\d{2})\s+[A-Za-z]{2,4}$/);
  if (withoutTz) s = withoutTz[1];
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(value);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}