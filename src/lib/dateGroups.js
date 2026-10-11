/**
 * Date grouping for the message list (Gmail-style headers).
 * Pure functions — no JSX/DOM, unit-testable in Node.
 *
 * SOGo date values are display-oriented and vary (RFC dates, ISO 'YYYY-MM-DD',
 * 'today'/'yesterday', epoch). We parse tolerantly and fall back to an
 * "older" bucket rather than crashing.
 */

// Batas grup (QA 2026-10-11: 02-Okt tampil di "Bulan Lalu" padahal hari ini
// 11-Okt — dulu "Bulan Lalu" = 7..29 hari ke belakang, bukan bulan kalender):
//   Hari Ini (0) · Kemarin (1) · Minggu Ini (2..6 hari — jendela nama-hari
//   SOGo) · Bulan Ini (bulan kalender yang sama, ≥7 hari) · Bulan Lalu
//   (bulan kalender sebelumnya) · Lebih Lama.
export const DATE_GROUPS = [
  { id: 'today',     label: 'Hari Ini' },
  { id: 'yesterday', label: 'Kemarin' },
  { id: 'thisWeek',  label: 'Minggu Ini' },
  { id: 'thisMonth', label: 'Bulan Ini' },
  { id: 'lastMonth', label: 'Bulan Lalu' },
  { id: 'older',     label: 'Lebih Lama' },
];

/** Kunci grup untuk selisih hari kalender + tanggal terurai (murni). */
function groupKeyFor(diffDays, parsed, now) {
  if (diffDays <= 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays <= 6) return 'thisWeek';
  const monthIndex = (d) => d.getFullYear() * 12 + d.getMonth();
  const delta = monthIndex(now) - monthIndex(parsed);
  if (delta <= 0) return 'thisMonth';
  if (delta === 1) return 'lastMonth';
  return 'older';
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// ─── Format RelativeDate SOGo locale Indonesia ────────────────────────────────
// SOGo mengembalikan kolom RelativeDate sebagai STRING TAMPILAN sesuai locale
// user (bukan tanggal machine-readable). Contoh locale 'id':
//   "Hari ini 09:41" · "Kemarin 16:43" · "Kamis 12:36" (≤6 hari) · "28/08/2026"
// Parser berikut menormalkan format-format itu ke Date; tanpa ini, pesan
// terbaru punya ts = -Infinity dan TENGGELAM ke bawah daftar (sort by date),
// sementara pesan lama bertanggal absolut "dd/mm/yyyy" muncul paling atas.

const ID_MONTHS = {
  januari: 0, februari: 1, maret: 2, april: 3, mei: 4, juni: 5,
  juli: 6, agustus: 7, september: 8, oktober: 9, november: 10, desember: 11,
};

const ID_WEEKDAYS = {
  minggu: 0, senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, sabtu: 6,
  // English — SOGo default locale adalah English; user profil bisa saja English
  // meski UI SPA berbahasa Indonesia (diverifikasi: SOGoLanguage="English" di
  // sogo_user_profile). Nama penuh DAN singkatan 3-huruf didukung (SOGo
  // NSWeekDayNameArray memakai nama penuh; format lain bisa memakai singkatan).
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

function applyTime(d, hh, mm) {
  d.setHours(hh ?? 12, mm ?? 0, 0, 0);
  return d;
}

/** Hari minggu terbaru yang jatuh pada `dow` (0=Minggu) relatif `now`. */
function mostRecentWeekday(dow, now) {
  const d = startOfDay(now);
  d.setDate(d.getDate() - ((d.getDay() - dow + 7) % 7));
  return d;
}

function parseIndoRelativeDate(s, now) {
  const low = s.toLowerCase();

  // Ambil jam:mm bila ada — "09:41" atau "09.41", plus AM/PM opsional
  // (locale 12-hour; produksi memakai SOGoTimeFormat="%H:%M" 24-jam, ini
  // lapisan defensif agar "3:00 PM" tidak salah dibaca jam 03:00).
  const tm = s.match(/(?:^|\s)(\d{1,2})[.:](\d{2})(?:\s|$)/);
  let hh = tm ? Number(tm[1]) : null;
  const mm = tm ? Number(tm[2]) : null;
  const mer = s.match(/(?:^|\s)(\d{1,2})[.:](\d{2})\s*([ap])\.?m\.?(?:\s|$)/i);
  if (mer) {
    const isPM = mer[3].toLowerCase() === 'p';
    if (isPM && hh < 12) hh += 12;
    if (!isPM && hh === 12) hh = 0;
  }

  // "28/08/2026", "28/08/26", "28/08" — hari-bulan-dulu (format ID),
  // BUKAN mm/dd ala US (05/08 = 5 Agustus, bukan 8 Mei).
  const dm = s.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  // "12 Agustus" / "12 agustus 09:00" (tanpa tahun). Angka tidak boleh bagian
  // dari waktu ("08:00"/"08.00"): lookahead menolak angka yang diikuti
  // [.:]+digit — termasuk via backtracking ("0" dari "08:00" tidak boleh
  // lolos lalu menyandingkan "8" sebagai teks). Tanpa itu "Senin 08:00"
  // cocok di sini sebelum pencocokan nama-hari.
  const nm = low.match(/\b(\d{1,2})(?![.:]?\d)\s+([a-z]+)\b/);
  // Nm hanya relevan bila kata setelah angka benar-benar nama bulan —
  // "3:00 pm" (jam+meridiem) menghasilkan nm=["00","pm"] tapi bukan tanggal.
  const nmIsMonth = !!(nm && ID_MONTHS[nm[2]] !== undefined);

  // "Today 09:41" / "Yesterday 16:43" (locale English — SOGoLanguage default)
  if (/\b(hari ini|today)\b/.test(low)) {
    return applyTime(new Date(now), hh, mm ?? 0);
  }
  // "Kemarin 16:43" / "Yesterday 16:43"
  if (/\b(kemarin|yesterday)\b/.test(low)) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return applyTime(d, hh, mm ?? 0);
  }
  // Nama hari ("Kamis 12:36", "Kam, 12:36", "Thursday 08:55", "Thu 3:00 PM")
  // = dalam 6 hari terakhir. Cocokkan kata utuh agar tidak salah tangkap
  // substring (mis. "sab" di dalam kata lain).
  for (const [name, dow] of Object.entries(ID_WEEKDAYS)) {
    if (new RegExp(`\\b${name}\\b`).test(low)) {
      return applyTime(mostRecentWeekday(dow, now), hh, mm ?? 0);
    }
  }
  // WAKTU POLOS ("10:38" / "09.05") = SELALU email HARI INI.
  // SOGo 5.12 UIxMailListActions.m messageDate(): email dengan dayOfCommonEra
  // sama dengan hari ini dirender SEBAGAI JAM SAJA tanpa kata "Today" — ini
  // format paling umum di INBOX. Tanpa cabang ini email terbaru punya ts
  // -Infinity dan TENGGELAM ke bawah daftar (bug "email terbaru kok kemarin").
  // Harus SETELAH today/yesterday/nama-hari (yang bisa memuat jam). Gate-nya
  // KETAT: string harus hanya berisi waktu (+AM/PM opsional) — tanpa itu
  // tanggal absolut "2026-08-22 08:00" ikut tertelan dan salah jadi hari ini.
  if (hh !== null && !dm && !nmIsMonth && /^\s*\d{1,2}[.:]\d{2}(?:\s*[ap]\.?m\.?)?\s*$/i.test(s)) {
    return applyTime(new Date(now), hh, mm ?? 0);
  }
  // "28/08/2026", "28/08/26", "28/08" — hari-bulan-dulu (format ID),
  // BUKAN mm/dd ala US (05/08 = 5 Agustus, bukan 8 Mei).
  if (dm) {
    const day = Number(dm[1]);
    const mon = Number(dm[2]) - 1;
    if (day >= 1 && day <= 31 && mon >= 0 && mon <= 11) {
      let year;
      if (dm[3] !== undefined) {
        year = Number(dm[3]);
        if (dm[3].length === 2) year += 2000;
      } else {
        year = now.getFullYear();
      }
      const d = new Date(year, mon, day);
      if (hh !== null) applyTime(d, hh, mm);
      // RelativeDate tidak pernah masa depan — "01/01" yang dilihat di
      // Februari berarti 1 Januari tahun ini, bukan tahun depan.
      if (d.getTime() > now.getTime() + 36 * 3600_000) {
        d.setFullYear(d.getFullYear() - 1);
      }
      return d;
    }
  }
  if (nmIsMonth) {
    const day = Number(nm[1]);
    const mon = ID_MONTHS[nm[2]];
    if (day >= 1 && day <= 31) {
      const d = new Date(now.getFullYear(), mon, day);
      if (hh !== null) applyTime(d, hh, mm);
      if (d.getTime() > now.getTime() + 36 * 3600_000) {
        d.setFullYear(d.getFullYear() - 1);
      }
      return d;
    }
  }
  return null;
}

/**
 * Parse a SOGo-ish date value into a Date, or null when unparseable.
 * Literal 'today'/'yesterday' relatif terhadap `now` (default: waktu nyata)
 * sehingga perilaku deterministik dan bisa diuji. Format RelativeDate locale
 * Indonesia ("Hari ini 09:41", "Kamis 12:36", "28/08/2026") ditangani
 * parseIndoRelativeDate — lihat catatan di atas.
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

  const parsed = parseIndoRelativeDate(s, now);
  if (parsed) return parsed;

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
/**
 * Terapkan window waktu (N bulan terakhir) ke daftar pesan.
 * Pesan dengan tanggal tak terbaca dianggap DALAM window (tetap tampil).
 * Kotak Masuk membatasi tampilan ke N bulan; SEARCH menembus window ini
 * (pola Gmail — pencarian adalah jalan menemukan email lama).
 */
export function applyMessageWindow(messages, { months = 5, now = new Date() } = {}) {
  if (!Array.isArray(messages)) return [];
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months);
  return messages.filter((m) => {
    const d = parseMessageDate(m.date, now);
    return d === null || d.getTime() >= cutoff.getTime();
  });
}

export function getDateGroup(value, now = new Date()) {
  const parsed = parseMessageDate(value, now);
  if (!parsed) {
    return { key: 'older', label: 'Lebih Lama', days: null };
  }
  let diffDays = Math.round((startOfDay(now) - startOfDay(parsed)) / 86_400_000);
  if (diffDays < 0) diffDays = 0;
  const key = groupKeyFor(diffDays, parsed, now);
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
  // Tiebreak uid NUMERIK descending: localeCompare string membuat "99" >
  // "192" dan mengacaukan urutan thread dgn tanggal tak terbaca.
  stamped.sort((a, b) => {
    if (b.ts !== a.ts) return b.ts - a.ts;
    const ua = Number(a.m?.uid);
    const ub = Number(b.m?.uid);
    if (!Number.isNaN(ua) && !Number.isNaN(ub)) return ub - ua;
    return 0; // pertahankan urutan input (sort V8 stabil)
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
