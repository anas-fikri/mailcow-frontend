/**
 * Conversation grouping (Outlook-like).
 * Pure functions — no JSX/DOM, unit-testable in Node.
 *
 * Grouping rule (mirrors Outlook):
 *  - Normalize subject: strip Re:/Fwd:/AW:/WG:… prefixes (recursively) so
 *    "Re: Laporan" and "Laporan" belong to the same conversation.
 *  - Cluster by normalized subject AND overlapping participants (from/to
 *    addresses): two unrelated threads that happen to share a subject
 *    ("Invoice" from different senders) stay separate; a real A↔B thread
 *    (participants overlap) merges even though the from address alternates.
 */

const SUBJECT_PREFIXES = [
  /^Re:\s*/i, /^Fwd:\s*/i, /^Fw:\s*/i, /^AW:\s*/i, /^WG:\s*/i, /^Antw:\s*/i,
  /^[\[]?RE[\]]?[:\-]\s*/i, /^[\[]?FWD[\]]?[:\-]\s*/i,
  /^Vs:\s*/i, /^Enc:\s*/i, /^RIF:\s*/i, /^TR:\s*/i,
];

/** Strip reply/forward prefixes recursively. */
export function normalizeSubject(subject) {
  if (!subject || typeof subject !== 'string') return '';
  let s = subject.trim();
  let prev;
  do {
    prev = s;
    for (const re of SUBJECT_PREFIXES) {
      s = s.replace(re, '');
    }
  } while (s !== prev);
  return s.trim().toLowerCase() || '(tanpa subjek)';
}

/** Nama tampilan dari string "Nama <email>" (fallback ke string mentah). */
export function senderDisplayName(fromValue, fallback = 'Unknown Sender') {
  const str = String(fromValue || '');
  const name = str.split('<')[0].trim();
  return name || str || fallback;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Kumpulan alamat email dari satu field alamat (from/to, string atau array). */
function addressesIn(value) {
  const out = new Set();
  const items = Array.isArray(value) ? value : (value == null ? [] : [value]);
  for (const item of items) {
    if (typeof item === 'string') {
      for (const m of String(item).match(EMAIL_RE) || []) out.add(m.toLowerCase());
    } else if (item && typeof item === 'object') {
      const email = item.email || item.address;
      if (email) out.add(String(email).toLowerCase());
    }
  }
  return out;
}

/** Partisipan sebuah pesan: gabungan alamat from + to. */
export function messageParticipants(msg, selfEmail = '') {
  const out = new Set();
  addressesIn(msg.from).forEach((e) => out.add(e));
  addressesIn(msg.to).forEach((e) => out.add(e));
  // Alamat akun sendiri tidak boleh dijadikan titik temu — tanpa ini, dua
  // thread berbeda dengan subjek sama (mis. "Invoice" dari dua vendor) akan
  // menyatu karena sama-sama menyertakan alamat penerima (user) yang sama.
  if (selfEmail) {
    const self = String(selfEmail).trim().toLowerCase();
    out.delete(self);
  }
  return out;
}

/**
 * Kelompokkan pesan menjadi percakapan (Outlook-like).
 *
 * @param {Array} messages pesan (sorted date-desc by caller)
 * @param {boolean} asc  true = urutkan grup 'terlama dulu' (grup dibalik);
 *                       isi tiap grup tetap terbaru-dulu (pola Gmail/Outlook)
 * @param {string} selfEmail alamat akun sendiri (dikecualikan dari peserta)
 * @param {Object} [opts]
 * @param {'from'|'to'} [opts.labelField='from'] field utk nama tampilan di
 *                       header avatar stack. Folder Terkirim/Draf memakai 'to'
 *                       (penerima), folder lain 'from' (pengirim) — konsisten
 *                       dgn label baris renderMessageRow.
 * @returns {Array<{key, subject, messages, senders, hasUnread, latest}>}
 */
export function groupConversations(messages = [], asc = false, selfEmail = '', opts = {}) {
  const { labelField = 'from' } = opts;
  const groups = [];

  for (const msg of messages) {
    const norm = normalizeSubject(msg.subject);
    const participants = messageParticipants(msg, selfEmail);

    // Cari grup yang cocok: subjek sama DAN partisipan tumpang-tindih.
    // Bila salah satu set partisipan kosong (alamat tak terparse), fallback
    // ke pencocokan subjek saja supaya thread yang minim data tak terpecah.
    let target = null;
    for (const g of groups) {
      if (g.norm !== norm) continue;
      const overlap =
        g.participants.size === 0 ||
        participants.size === 0 ||
        [...participants].some((p) => g.participants.has(p));
      if (overlap) {
        target = g;
        break;
      }
    }

    if (!target) {
      target = {
        norm,
        key: `${norm}::${String(msg.uid ?? msg.date ?? Math.random()).replace(/\W+/g, '')}`,
        subject: String(msg.subject || '') || '(Tanpa Subjek)',
        messages: [],
        participants: new Set(),
      };
      groups.push(target);
    }
    target.messages.push(msg);
    participants.forEach((p) => target.participants.add(p));
  }

  // Metadata per grup — dipakai header Outlook-like tanpa hitung ulang di JSX.
  // labelField 'to' utk folder Terkirim/Draf (penerima), 'from' utk lainnya.
  for (const g of groups) {
    g.senders = [...new Set(g.messages.map((m) => senderDisplayName(m[labelField])))];
    g.hasUnread = g.messages.some((m) => !m.isRead);
    // Pesan masuk date-desc (caller menyortir) → messages[0] = terbaru.
    g.latest = g.messages[0] || null;
  }

  // Urutkan grup by tanggal pesan TERBARU di dalamnya (date-descending).
  const ts = (m) => {
    const d = m && m.date ? new Date(String(m.date).replace(/ /g, 'T')) : null;
    return d && !Number.isNaN(d.getTime()) ? d.getTime() : 0;
  };
  const latestTs = (g) => g.messages.reduce((max, m) => Math.max(max, ts(m)), 0);
  groups.sort((a, b) => {
    const d = latestTs(b) - latestTs(a);
    return d !== 0 ? d : String(a.key).localeCompare(String(b.key));
  });
  if (asc) groups.reverse();
  return groups;
}
