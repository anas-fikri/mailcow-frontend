/**
 * Conversation grouping (Outlook-like).
 * Pure functions — no JSX/DOM, unit-testable in Node.
 *
 * User-facing behavior: messages with the same normalized subject are one
 * conversation, like Outlook/Gmail. Participant-aware separation is optional
 * for callers that need strict thread isolation; the mailbox UI uses the
 * friendly subject grouping because SOGo list headers do not expose reliable
 * Message-ID/In-Reply-To metadata.
 */

import { parseMessageDate } from './dateGroups.js';

const SUBJECT_PREFIXES = [
  /^Re:\s*/i, /^Fwd:\s*/i, /^Fw:\s*/i, /^AW:\s*/i, /^WG:\s*/i, /^Antw:\s*/i,
  /^[\[]?RE[\]]?[:\-]\s*/i, /^[\[]?FWD[\]]?[:\-]\s*/i,
  /^Vs:\s*/i, /^Enc:\s*/i, /^RIF:\s*/i, /^TR:\s*/i,
];

/**
 * Subjek TAMPILAN percakapan ala Outlook: prefix Re:/Fwd:/FW: (berulang)
 * dibuang tapi kapitalisasi asli dipertahankan — beda dgn normalizeSubject
 * yang me-lowercase utk kunci grouping.
 */
export function stripSubjectPrefixes(subject) {
  if (!subject || typeof subject !== 'string') return '';
  let s = subject.trim();
  let prev;
  do {
    prev = s;
    for (const re of SUBJECT_PREFIXES) s = s.replace(re, '');
  } while (s !== prev);
  return s.trim();
}

export function normalizeSubject(subject) {
  if (!subject || typeof subject !== 'string') return '';
  let s = subject.trim();
  let prev;
  do {
    prev = s;
    for (const re of SUBJECT_PREFIXES) s = s.replace(re, '');
  } while (s !== prev);
  return s.trim().toLowerCase() || '(tanpa subjek)';
}

export function senderDisplayName(fromValue, fallback = 'Unknown Sender') {
  const str = String(fromValue || '');
  let name = str.split('<')[0].trim();
  // Artefak kutip dari header mentah ("'Eko Budi' <eko@x>") — Outlook
  // menampilkan nama TANPA kutip pembungkus (tunggal/ganda, berulang).
  let prev;
  do {
    prev = name;
    const m = /^(['"])(.*)\1$/.exec(name);
    if (m) name = m[2].trim();
  } while (name !== prev && name);
  return name || str || fallback;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

function addressesIn(value) {
  const out = new Set();
  const items = Array.isArray(value) ? value : (value == null ? [] : [value]);
  for (const item of items) {
    if (typeof item === 'string') {
      for (const m of item.match(EMAIL_RE) || []) out.add(m.toLowerCase());
    } else if (item && typeof item === 'object') {
      const email = item.email || item.address;
      if (email) out.add(String(email).toLowerCase());
    }
  }
  return out;
}

export function messageParticipants(msg, selfEmail = '') {
  const out = new Set();
  addressesIn(msg.from).forEach((e) => out.add(e));
  addressesIn(msg.to).forEach((e) => out.add(e));
  if (selfEmail) out.delete(String(selfEmail).trim().toLowerCase());
  return out;
}

/**
 * @param {Array} messages messages already sorted by the caller
 * @param {boolean} asc reverse conversation order
 * @param {string} selfEmail account address
 * @param {Object} opts
 * @param {'from'|'to'} opts.labelField display field for participants
 * @param {boolean} opts.strictParticipants opt into participant-aware split
 */
export function groupConversations(messages = [], asc = false, selfEmail = '', opts = {}) {
  const { labelField = 'from', strictParticipants = false } = opts;
  const groups = [];

  for (const msg of Array.isArray(messages) ? messages : []) {
    const norm = normalizeSubject(msg.subject);
    const participants = messageParticipants(msg, selfEmail);
    let target = groups.find((g) => {
      if (g.norm !== norm) return false;
      if (!strictParticipants) return true;
      return g.participants.size === 0 || participants.size === 0 ||
        [...participants].some((p) => g.participants.has(p));
    });

    if (!target) {
      target = {
        norm,
        key: `${norm}::${String(msg.uid ?? msg.date ?? groups.length).replace(/\W+/g, '')}`,
        subject: String(msg.subject || '') || '(Tanpa Subjek)',
        // Header thread menampilkan subjek TANPA prefix Re:/Fwd: (Outlook) —
        // subjek lengkap tetap di `subject` utk title/aria-label.
        displaySubject: stripSubjectPrefixes(String(msg.subject || '')) || '(Tanpa Subjek)',
        messages: [],
        participants: new Set(),
      };
      groups.push(target);
    }
    target.messages.push(msg);
    participants.forEach((p) => target.participants.add(p));
  }

  for (const g of groups) finalizeGroup(g, labelField);
  sortGroups(groups, asc);
  return groups;
}

// Pakai parser SOGo terpusat (parseMessageDate) — bukan `new Date(string)`.
// RelativeDate SOGo ("10:38" = hari ini, "Thursday 08:55" nama-hari locale)
// TIDAK bisa di-parse new Date() → ts=0 → preview thread memilih pesan LAMA
// sebagai "terbaru" (persis keluarga bug sort by date di dateGroups.js).
function ts(m) {
  const d = m && m.date ? parseMessageDate(m.date) : null;
  return d ? d.getTime() : 0;
}

function sortGroups(groups, asc) {
  groups.sort((a, b) => {
    const delta = ts(b.latest) - ts(a.latest);
    return delta || String(a.key).localeCompare(String(b.key));
  });
  if (asc) groups.reverse();
}

/**
 * Hitung ulang urutan anggota + agregat satu thread (dipakai groupConversations
 * dan mergeSentIntoGroups). Salinan Terkirim (`isSentCopy`) TIDAK pernah
 * dihitung sebagai belum dibaca — badge/titik unread murni milik folder aktif.
 */
function finalizeGroup(g, labelField = 'from', selfLabel = 'Anda') {
  // SOGo batch/header order is not guaranteed; normalize each thread before
  // selecting its preview so a newly received message is always latest.
  g.messages.sort((a, b) => ts(b) - ts(a) || String(b.uid ?? '').localeCompare(String(a.uid ?? '')));
  g.senders = [...new Set(g.messages.map((m) => (m && m.isSentCopy ? selfLabel : senderDisplayName(m[labelField]))))];
  const own = g.messages.filter((m) => m && !m.isSentCopy);
  g.hasUnread = own.some((m) => !m.isRead);
  g.latest = g.messages[0] || null;
  // Agregat flag & belum-dibaca per thread (header conversation):
  // unreadCount = berapa pesan belum dibaca (dot biru hanya sinyal ada/tidak);
  // hasFlagged/flaggedCount = pesan yang ditandai bintang, color header
  // diambil dari pesan TERBARU yang ditandai (di MailPage via getFlagColor).
  g.unreadCount = own.reduce((n, m) => n + (!m.isRead ? 1 : 0), 0);
  g.hasFlagged = g.messages.some((m) => m && m.isFlagged);
  g.flaggedCount = g.messages.reduce((n, m) => n + (m && m.isFlagged ? 1 : 0), 0);
  // Agregat lampiran per thread: saat collapsed hanya pesan terbaru yang
  // dirender, jadi lampiran di pesan lama tidak terlihat. Chip paperclip di
  // header pakai field ini (pola Gmail/Outlook: paperclip di baris thread).
  g.hasAttachment = g.messages.some((m) => m && m.hasAtt);
  g.attachmentCount = g.messages.reduce((n, m) => n + (m && m.hasAtt ? 1 : 0), 0);
  g.sentCount = g.messages.length - own.length;
  return g;
}

const messageIdOf = (m) => {
  const v = m && (m.messageId || m['message-id'] || m.messageID);
  return typeof v === 'string' && v.trim() ? v.trim().toLowerCase() : '';
};

/**
 * Outlook "Tampilkan pesan dari folder lain": sisipkan salinan folder Terkirim
 * ke thread yang SUDAH ADA (dibangun dari pesan folder aktif).
 *
 * Aturan:
 * - Pesan terkirim hanya bergabung bila subjek ternormalisasinya cocok dengan
 *   grup yang ada — TIDAK pernah membuat thread baru yang isinya hanya email
 *   terkirim (Kotak Masuk tidak boleh berubah jadi daftar Terkirim).
 * - Subjek kosong ("(tanpa subjek)") tidak pernah digabung (bukan sinyal thread).
 * - Dedupe: Message-ID bila tersedia (mis. Anda CC diri sendiri → salinan ada
 *   di Kotak Masuk), jika tidak folderId+uid.
 * - Salinan ditandai `isSentCopy: true`, tidak memengaruhi hasUnread/unreadCount;
 *   jumlah pesan & `sentCount` ikut naik; peserta mendapat "Anda" sekali.
 * - `latest` = pesan terbaru KESELURUHAN (termasuk balasan Anda) — sama
 *   seperti Outlook; urutan grup ikut aktivitas terakhir thread.
 * Grup yang tidak berubah dikembalikan apa adanya (identitas objek tetap);
 * input tidak dimutasi.
 *
 * @param {Array} groups hasil groupConversations
 * @param {Array} sentMessages header folder Terkirim
 * @param {Object} opts { asc, labelField, selfLabel, folderId }
 */
export function mergeSentIntoGroups(groups = [], sentMessages = [], opts = {}) {
  const { asc = false, labelField = 'from', selfLabel = 'Anda', folderId = 'folderSent' } = opts;
  if (!Array.isArray(groups) || groups.length === 0) return Array.isArray(groups) ? groups : [];
  const sent = Array.isArray(sentMessages) ? sentMessages : [];
  if (sent.length === 0) return groups;

  const byNorm = new Map();
  for (const g of groups) if (!byNorm.has(g.norm)) byNorm.set(g.norm, g);

  const seen = new Set();
  for (const g of groups) {
    for (const m of g.messages) {
      const id = messageIdOf(m);
      if (id) seen.add(`mid:${id}`);
      seen.add(`uid:${m.folderId || ''}:${m.uid}`);
    }
  }

  const additions = new Map(); // group -> sent copies
  for (const raw of sent) {
    if (!raw || raw.uid == null) continue;
    const norm = normalizeSubject(raw.subject);
    if (!norm || norm === '(tanpa subjek)') continue;
    const target = byNorm.get(norm);
    if (!target) continue;
    const copy = { ...raw, folderId: raw.folderId || folderId, isSentCopy: true, isRead: true };
    const id = messageIdOf(copy);
    const uidKey = `uid:${copy.folderId}:${copy.uid}`;
    if ((id && seen.has(`mid:${id}`)) || seen.has(uidKey)) continue;
    if (id) seen.add(`mid:${id}`);
    seen.add(uidKey);
    if (!additions.has(target)) additions.set(target, []);
    additions.get(target).push(copy);
  }
  if (additions.size === 0) return groups;

  const out = groups.map((g) => {
    const extra = additions.get(g);
    if (!extra) return g;
    return finalizeGroup({
      ...g,
      participants: new Set(g.participants || []),
      messages: [...g.messages, ...extra],
    }, labelField, selfLabel);
  });
  sortGroups(out, asc);
  return out;
}
