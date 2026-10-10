// ─── Penyusun data Balas / Balas Semua / Teruskan (ala Outlook) ──────────────
// Logika MURNI (tanpa DOM) agar bisa diuji Node tanpa transpile JSX. Semua
// nilai header email adalah input pengirim → di-escape sebelum masuk body
// (body di-hydrate ke contentEditable via innerHTML di ComposeModal).
//
// Kontrak (dipakai MessageReader & ComposeModal):
//   buildReplyData(message, { mode, userEmail, folderId, uid, attachments, bodyHtml, headers })
//   → { composeMode, to, cc, bcc, subject, body, attachments, inReplyTo,
//       references, sourceFolder, sourceUid }

import { formatAddresses } from './format.js';
import { extractHtml, extractAttachments, isInlineBodyImage, parseRawHeaders } from './messageHtml.js';

export const REPLY_MODES = ['reply', 'replyAll', 'forward'];

/** Escape HTML minimal utk interpolasi teks header ke body HTML. */
export function escapeHtml(str) {
  return String(str ?? '').replace(/[<>&"']/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Prefix subjek yang dikenal (case-INsensitive). Dipisah per jenis supaya
// balasan atas forward tetap "Re: Fwd: …" (perilaku Outlook), bukan
// "Re: Re: …" / "Fwd: Fwd: …".
const REPLY_PREFIX_RE = /^\s*(?:re|aw|sv|antw|r|ref|res|odp|vs|bls)\s*(?:\[\d+\])?\s*:\s*/i;
const FORWARD_PREFIX_RE = /^\s*(?:fwd?|fw|tr|wg|vb|doorst|i|enc|rv)\s*(?:\[\d+\])?\s*:\s*/i;

/** Buang SEMUA prefix dari jenis `kind` yang berulang di awal subjek. */
function stripPrefix(subject, re) {
  let s = String(subject ?? '').trim();
  // Batasi iterasi — mencegah loop tak wajar pada subjek aneh.
  for (let i = 0; i < 20; i++) {
    const next = s.replace(re, '');
    if (next === s) break;
    s = next.trim();
  }
  return s;
}

/**
 * Subjek balasan/teruskan dengan prefix "Re: " / "Fwd: " tanpa duplikasi.
 * "RE: Halo" → "Re: Halo"; "Fwd: Halo" (reply) → "Re: Fwd: Halo";
 * "FW: Fwd: Halo" (forward) → "Fwd: Halo"; "" → "Re: (Tanpa Subjek)".
 */
export function buildSubject(subject, mode) {
  const isForward = mode === 'forward';
  const base = stripPrefix(subject, isForward ? FORWARD_PREFIX_RE : REPLY_PREFIX_RE);
  const core = base || '(Tanpa Subjek)';
  return `${isForward ? 'Fwd' : 'Re'}: ${core}`;
}

/**
 * Normalisasi daftar alamat SOGo (array objek {name,email}, string mentah,
 * atau null) → array {name, email} dengan email lowercase utk perbandingan.
 */
export function normalizeAddressList(arr) {
  if (!arr) return [];
  const list = Array.isArray(arr) ? arr : [arr];
  const out = [];
  for (const a of list) {
    if (!a) continue;
    if (typeof a === 'string') {
      const m = a.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
      if (m) out.push({ name: m[1].trim(), email: m[2].trim() });
      else if (a.trim()) out.push({ name: '', email: a.trim() });
      continue;
    }
    if (typeof a === 'object') {
      const email = a.email ? String(a.email).trim() : '';
      const name = a.name ? String(a.name).trim() : '';
      if (email || name) out.push({ name, email });
    }
  }
  return out;
}

/** Alamat user sendiri (string / array) → Set lowercase. */
function selfSet(userEmail) {
  const list = Array.isArray(userEmail) ? userEmail : [userEmail];
  return new Set(list.filter(Boolean).map((e) => String(e).trim().toLowerCase()));
}

/**
 * Buang alamat milik user & duplikat (case-insensitive), pertahankan urutan.
 * `seen` dibagi antara To dan Cc agar alamat yang sudah di To tidak muncul
 * lagi di Cc.
 */
function dedupeAddresses(list, selfs, seen) {
  const out = [];
  for (const a of list) {
    const key = (a.email || a.name).toLowerCase();
    if (!key || seen.has(key) || (a.email && selfs.has(a.email.toLowerCase()))) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

/** Format "Nama <email>, …" — satu jalur dengan formatAddresses (format.js). */
export function joinAddresses(list) {
  return formatAddresses(list.map((a) => ({ name: a.name, email: a.email })));
}

// ─── Tanggal ─────────────────────────────────────────────────────────────────

/**
 * Parse string tanggal SOGo /view ("Friday, September 04, 2026 14:24 WIB")
 * atau ISO/RFC → Date; null bila tidak bisa diparse. Suffix zona 3-huruf
 * non-ISO (WIB/WITA) membuat Date.parse NaN → dibuang; tanpa zona string
 * diparse sebagai waktu LOKAL (benar: SOGo sudah merender di zona user).
 */
export function parseSogoDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  let s = String(value).trim();
  const withoutTz = s.match(/^(.*?\d{1,2}:\d{2}(?::\d{2})?)\s+[A-Za-z]{2,5}$/);
  if (withoutTz) s = withoutTz[1];
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Tanggal panjang ala Outlook dalam bahasa Indonesia:
 * "Jumat, 4 September 2026 14.24" (locale id-ID). Fallback ke string asli
 * bila tidak bisa diparse.
 */
export function formatLongDateId(value) {
  const d = parseSogoDate(value);
  if (!d) return value ? String(value) : '';
  try {
    return d.toLocaleString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return String(value);
  }
}

// ─── Header kutipan ala Outlook ──────────────────────────────────────────────

/**
 * Blok header kutipan ("Dari / Dikirim / Kepada / Cc / Subjek") seperti
 * Outlook desktop. Cc hanya muncul bila ada. Semua nilai di-escape.
 */
export function buildQuoteHeader({ from, date, to, cc, subject, forward = false }) {
  const rows = [
    ['Dari', from],
    ['Dikirim', date],
    ['Kepada', to],
    ['Cc', cc],
    ['Subjek', subject],
  ].filter(([label, v]) => label !== 'Cc' ? true : !!v);
  const lines = rows.map(([label, v]) => `<b>${label}:</b> ${escapeHtml(v || '')}`).join('<br>');
  const title = forward ? '<b>---------- Pesan Diteruskan ----------</b><br>' : '';
  return `<div style="border:none;border-top:1px solid #e1e1e1;padding:6px 0 0 0;margin:12px 0 0 0;font-size:11pt;color:#444">${title}${lines}</div>`;
}

// ─── Builder utama ───────────────────────────────────────────────────────────

/** Token Message-ID valid "<id@host>" dipisah spasi → array unik (urutan dijaga). */
export function normalizeMessageIdList(value) {
  if (!value) return [];
  const raw = Array.isArray(value) ? value.join(' ') : String(value);
  const out = [];
  for (const tok of raw.trim().split(/\s+/)) {
    if (/^<[^<>\s]+@[^<>\s]+>$/.test(tok) && !out.includes(tok)) out.push(tok);
  }
  return out;
}

/** Cari Message-ID / In-Reply-To / References dari JSON /view ATAU header mentah. */
export function pickThreadingHeaders(message, headers) {
  const h = headers || {};
  const m = message || {};
  const messageId = normalizeMessageIdList(h.messageId || m.messageId || m['message-id'] || m.messageID)[0] || '';
  const inReplyTo = normalizeMessageIdList(h.inReplyTo || m.inReplyTo || m['in-reply-to'])[0] || '';
  const references = normalizeMessageIdList(h.references || m.references);
  return { messageId, inReplyTo, references };
}

/**
 * Susun data compose utk Balas / Balas Semua / Teruskan.
 *
 * @param {object} message hasil fetchMessage (JSON SOGo …/{uid}/view)
 * @param {object} opts
 * @param {'reply'|'replyAll'|'forward'} opts.mode
 * @param {string|string[]} opts.userEmail alamat user (dibuang dari To/Cc saat Balas Semua)
 * @param {string} opts.folderId  folder asal (sourceFolder)
 * @param {string|number} opts.uid  uid asal (sourceUid)
 * @param {Array<{name,type,size,data}>} [opts.attachments] lampiran yg dibawa (forward)
 * @param {string} [opts.bodyHtml] body HTML yg SUDAH disanitasi (dari reader);
 *   default extractHtml(message.parts) (mentah — pemanggil wajib sanitasi).
 * @param {object} [opts.headers] {messageId,inReplyTo,references} dari viewsource
 */
export function buildReplyData(message, opts = {}) {
  const { mode = 'reply', userEmail = '', folderId = '', uid = null, attachments, bodyHtml, headers } = opts;
  if (!REPLY_MODES.includes(mode)) throw new Error(`mode tidak dikenal: ${mode}`);
  const msg = message || {};
  const fromList = normalizeAddressList(msg.from);
  const replyToList = normalizeAddressList(msg['reply-to'] || msg.replyTo);
  const toList = normalizeAddressList(msg.to);
  const ccList = normalizeAddressList(msg.cc);
  const selfs = selfSet(userEmail);

  let to = '';
  let cc = '';
  if (mode === 'reply') {
    const primary = replyToList.length ? replyToList : fromList;
    to = joinAddresses(dedupeAddresses(primary, new Set(), new Set()));
  } else if (mode === 'replyAll') {
    const primary = replyToList.length ? replyToList : fromList;
    const seen = new Set();
    let toOut = dedupeAddresses([...primary, ...toList], selfs, seen);
    // Pesan dari diri sendiri (mis. folder Terkirim) → semua To terbuang;
    // fallback: pakai pengirim apa adanya supaya To tidak kosong.
    if (toOut.length === 0) toOut = dedupeAddresses(primary, new Set(), seen);
    const ccOut = dedupeAddresses(ccList, selfs, seen);
    to = joinAddresses(toOut);
    cc = joinAddresses(ccOut);
  }

  const subject = buildSubject(msg.subject, mode);
  const quotedBody = bodyHtml !== undefined ? bodyHtml : (extractHtml(msg.parts) || '');
  const header = buildQuoteHeader({
    from: formatAddresses(msg.from),
    date: formatLongDateId(msg.date),
    to: formatAddresses(msg.to),
    cc: formatAddresses(msg.cc),
    subject: msg.subject || '(Tanpa Subjek)',
    forward: mode === 'forward',
  });
  const body = `<br><br>${header}<blockquote style="border-left:3px solid #ccc;padding-left:12px;margin:8px 0 0 0;color:#666">${quotedBody}</blockquote>`;

  const thr = pickThreadingHeaders(msg, headers);
  // Threading RFC 5322: In-Reply-To = Message-ID asal; References = References
  // asal + Message-ID asal (forward juga membawa referensi — Outlook melakukannya).
  const inReplyTo = thr.messageId;
  const references = normalizeMessageIdList([...thr.references, thr.messageId]).join(' ');

  return {
    composeMode: mode,
    to,
    cc,
    bcc: '',
    subject,
    body,
    attachments: mode === 'forward' && Array.isArray(attachments) ? attachments : [],
    inReplyTo,
    references,
    sourceFolder: folderId,
    sourceUid: uid,
  };
}

/**
 * Versi async: ambil pesan (bila belum ada), lampiran (forward) dan header
 * mentah (bila /view tidak membawa Message-ID), lalu buildReplyData.
 * Dependensi API disuntik lewat `opts.api` agar bisa diuji tanpa jaringan;
 * default memuat ../lib/api secara dinamis (hindari siklus import).
 *
 * @param {string} token sogoToken
 * @param {string} folder
 * @param {string|number} uid
 * @param {object} opts  sama dgn buildReplyData + { message?, onProgress?(done,total), api? }
 */
export async function buildReplyDataAsync(token, folder, uid, opts = {}) {
  const api = opts.api || await import('./api.js');
  const message = opts.message || await api.fetchMessage(token, folder, uid);

  let attachments = Array.isArray(opts.attachments) ? opts.attachments : undefined;
  if (opts.mode === 'forward' && attachments === undefined) {
    const rawHtml = extractHtml(message?.parts) || '';
    const atts = extractAttachments(message?.parts).filter((a) => !isInlineBodyImage(a, rawHtml));
    attachments = [];
    let done = 0;
    for (const a of atts) {
      const data = await api.fetchAttachmentData(a.downloadURL); // throw → pemanggil tampilkan toast
      if (data) attachments.push({ name: a.name, type: a.contentType || 'application/octet-stream', size: a.size || 0, data });
      done += 1;
      opts.onProgress?.(done, atts.length);
    }
  }

  let headers = opts.headers;
  if (!headers && !pickThreadingHeaders(message).messageId && typeof api.fetchMessageHeadersRaw === 'function') {
    // Lazy: viewsource hanya saat /view tidak membawa Message-ID. Gagal →
    // kirim tanpa threading (opsional, bukan alasan gagal balas).
    headers = await api.fetchMessageHeadersRaw(token, folder, uid).catch(() => null);
  }

  return buildReplyData(message, { ...opts, folderId: opts.folderId ?? folder, uid: opts.uid ?? uid, attachments, headers });
}

export { parseRawHeaders };
