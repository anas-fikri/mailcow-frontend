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
  const name = str.split('<')[0].trim();
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
        messages: [],
        participants: new Set(),
      };
      groups.push(target);
    }
    target.messages.push(msg);
    participants.forEach((p) => target.participants.add(p));
  }

  const ts = (m) => {
    // Pakai parser SOGo terpusat (parseMessageDate) — bukan `new Date(string)`.
    // RelativeDate SOGo ("10:38" = hari ini, "Thursday 08:55" nama-hari locale)
    // TIDAK bisa di-parse new Date() → ts=0 → preview thread memilih pesan LAMA
    // sebagai "terbaru" (persis keluarga bug sort by date di dateGroups.js).
    const d = m && m.date ? parseMessageDate(m.date) : null;
    return d ? d.getTime() : 0;
  };
  for (const g of groups) {
    // SOGo batch/header order is not guaranteed; normalize each thread before
    // selecting its preview so a newly received message is always latest.
    g.messages.sort((a, b) => ts(b) - ts(a) || String(b.uid ?? '').localeCompare(String(a.uid ?? '')));
    g.senders = [...new Set(g.messages.map((m) => senderDisplayName(m[labelField])))];
    g.hasUnread = g.messages.some((m) => !m.isRead);
    g.latest = g.messages[0] || null;
    // Agregat lampiran per thread: saat collapsed hanya pesan terbaru yang
    // dirender, jadi lampiran di pesan lama tidak terlihat. Chip paperclip di
    // header pakai field ini (pola Gmail/Outlook: paperclip di baris thread).
    g.hasAttachment = g.messages.some((m) => m && m.hasAtt);
    g.attachmentCount = g.messages.reduce((n, m) => n + (m && m.hasAtt ? 1 : 0), 0);
  }

  groups.sort((a, b) => {
    const delta = ts(b.latest) - ts(a.latest);
    return delta || String(a.key).localeCompare(String(b.key));
  });
  if (asc) groups.reverse();
  return groups;
}
