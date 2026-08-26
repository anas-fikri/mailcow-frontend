/**
 * Date grouping for the message list (Gmail-style headers).
 * Pure functions — no JSX/DOM, unit-testable in Node.
 *
 * SOGo date values are display-oriented and vary (RFC dates, ISO 'YYYY-MM-DD',
 * 'today'/'yesterday', epoch). We parse tolerantly and fall back to an
 * "older" bucket rather than crashing.
 */

export const DATE_GROUPS = [
  { id: 'today',    label: 'Hari Ini',     minDays: 0 },
  { id: 'yesterday', label: 'Kemarin',     minDays: 1 },
  { id: 'thisWeek', label: 'Minggu Ini',   minDays: 2 },
  { id: 'thisMonth', label: 'Bulan Lalu',  minDays: 7 },
  { id: 'older',    label: 'Lebih Lama',   minDays: 30 },
];

const GROUP_BY_DAYS = {
  0: 'today',
  1: 'yesterday',
  2: 'thisWeek',
  3: 'thisWeek',
  4: 'thisWeek',
  5: 'thisWeek',
  6: 'thisWeek',
  7: 'thisMonth',
  8: 'thisMonth',
  9: 'thisMonth',
  10: 'thisMonth',
  11: 'thisMonth',
  12: 'thisMonth',
  13: 'thisMonth',
  14: 'thisMonth',
  15: 'thisMonth',
  16: 'thisMonth',
  17: 'thisMonth',
  18: 'thisMonth',
  19: 'thisMonth',
  20: 'thisMonth',
  21: 'thisMonth',
  22: 'thisMonth',
  23: 'thisMonth',
  24: 'thisMonth',
  25: 'thisMonth',
  26: 'thisMonth',
  27: 'thisMonth',
  28: 'thisMonth',
  29: 'thisMonth',
};

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Parse a SOGo-ish date value into a Date, or null when unparseable.
 * Literal 'today'/'yesterday' relatif terhadap `now` (default: waktu nyata)
 * sehingga perilaku deterministik dan bisa diuji.
 */
export function parseMessageDate(value, now = new Date()) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;

  // Epoch seconds (pure digits, 8–11 digits — covers 1973..2286)
  if (/^\d{8,11}$/.test(s)) {
    const d = new Date(Number(s) * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const low = s.toLowerCase();
  if (low === 'today' || low === 'hari ini') return new Date(now);
  if (low === 'yesterday' || low === 'kemarin') {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return d;
  }

  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t);
  return null;
}

/**
 * Group key untuk satu tanggal pesan.
 * @returns {{ key: string, label: string, days: number|null }} days = null
 *   when unparseable (bucket = older).
 */
export function getDateGroup(value, now = new Date()) {
  const parsed = parseMessageDate(value, now);
  if (!parsed) {
    return { key: 'older', label: 'Lebih Lama', days: null };
  }
  let diffDays = Math.round((startOfDay(now) - startOfDay(parsed)) / 86_400_000);
  if (diffDays < 0) diffDays = 0;
  const key = GROUP_BY_DAYS[diffDays] || 'older';
  const meta = DATE_GROUPS.find((g) => g.id === key);
  return { key, label: meta.label, days: diffDays };
}

/**
 * Split an already-sorted (descending) message list into contiguous date
 * groups preserving order.
 * @returns {Array<{ key, label, messages }>}
 */
export function groupMessagesByDate(messages, getDate, now = new Date()) {
  const groups = [];
  let current = null;
  for (const msg of messages) {
    const { key, label } = getDateGroup(getDate ? getDate(msg) : msg?.date, now);
    if (!current || current.key !== key) {
      current = { key, label, messages: [] };
      groups.push(current);
    }
    current.messages.push(msg);
  }
  return groups;
}

/**
 * Urutkan daftar pesan by DATE (bukan UID). SOGo uid per-folder TIDAK dijamin
 * sekuensial dengan waktu — mengurutkan by uid membuat urutan tampil bisa
 * menyimpang dari urutan tanggal (dan membalikkan urutan saat sortAsc).
 *
 * Default: date DESCENDING (terbaru dulu) — urutan yang diharapkan date-group
 * header (Hari Ini → Lebih Lama) dan conversation thread. `asc: true` hanya
 * membalik urutan GRUP, bukan urutan di dalam grup (pesan dalam satu konversi/
 * hari tetap terbaru-dulu — pola Gmail: thread terbaru di atas, balasan
 * terbaru paling atas).
 *
 * Tiebreak: uid descending (agar pesan tanpa tanggal yang valid tetap urut
 * deterministik); unparseable date dianggap paling lama (paling bawah).
 *
 * @param {Array}  messages  daftar pesan (dengan .uid dan .date)
 * @param {object} [opts]    { asc?: boolean, getDate?: (msg) => any }
 * @returns {Array} pesan tersortir (salinan baru)
 */
export function sortMessagesByDate(messages = [], opts = {}) {
  const { asc = false, getDate, now } = opts;
  const refNow = now || new Date();
  const stamped = (Array.isArray(messages) ? messages : []).map((m) => {
    const d = parseMessageDate(getDate ? getDate(m) : m?.date, refNow);
    return { m, ts: d ? d.getTime() : Number.NEGATIVE_INFINITY };
  });
  // Date DESCENDING selalu — asc hanya dipakai untuk membalik urutan GRUP di
  // pemanggil (lihat reorderDateGroups / groupMessages asc), bukan baris.
  stamped.sort((a, b) => {
    if (b.ts !== a.ts) return b.ts - a.ts;
    return (Number(b.m?.uid) || 0) - (Number(a.m?.uid) || 0);
  });
  return stamped.map((s) => s.m);
}

/**
 * Balikkan urutan grup tanggal saat mode 'terlama dulu' (asc) — header jadi
 * Lebih Lama → … → Hari Ini, sedangkan isi tiap grup tetap date-descending.
 */
export function reorderDateGroups(groups = [], asc = false) {
  if (!asc) return groups;
  return [...groups].reverse();
}
