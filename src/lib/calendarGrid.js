// ─── Kalender: grid bulan, logika rentang, format Indonesia ───────────────────
// Logika murni (tanpa React) untuk DateRangePicker — bisa diuji Node.
// Semua tanggal berupa string 'YYYY-MM-DD' waktu LOKAL. Jangan pakai
// toISOString() (UTC) — di WIB tanggal bisa mundur sehari.

const pad = (n) => String(n).padStart(2, '0');

export const WEEKDAYS_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
export const WEEKDAYS_LONG = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
export const MONTHS_LONG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
/** Header kolom — minggu dimulai Senin. */
export const WEEK_HEADER = [1, 2, 3, 4, 5, 6, 0].map((d) => ({ short: WEEKDAYS_SHORT[d], long: WEEKDAYS_LONG[d] }));

/** 'YYYY-MM-DD' → Date lokal tengah malam, atau null bila tak valid. */
export function parseYmd(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!m) return null;
  const y = Number(m[1]); const mo = Number(m[2]) - 1; const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null; // mis. 2026-02-30
  return dt;
}

/** Date → 'YYYY-MM-DD' lokal. */
export function toYmd(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const todayYmd = (now = new Date()) => toYmd(now);
export const isValidYmd = (v) => parseYmd(v) !== null;

export function addDays(ymd, n) {
  const d = parseYmd(ymd);
  if (!d) return '';
  return toYmd(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

/** Geser bulan; tanggal di-clamp ke akhir bulan (31 Jan + 1 bln → 28/29 Feb). */
export function addMonths(ymd, n) {
  const d = parseYmd(ymd);
  if (!d) return '';
  const first = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return toYmd(new Date(first.getFullYear(), first.getMonth(), Math.min(d.getDate(), last)));
}

/** 0 = Senin … 6 = Minggu. */
const mondayIndex = (date) => (date.getDay() + 6) % 7;

export function weekStart(ymd) {
  const d = parseYmd(ymd);
  return d ? addDays(ymd, -mondayIndex(d)) : '';
}

export function weekEnd(ymd) {
  const d = parseYmd(ymd);
  return d ? addDays(ymd, 6 - mondayIndex(d)) : '';
}

export function daysInMonth(year, month0) {
  return new Date(year, month0 + 1, 0).getDate();
}

/**
 * Matriks bulan: selalu 6 minggu × 7 hari (tinggi popover stabil), Senin dulu.
 * Tiap sel: { ymd, day, inMonth }.
 */
export function monthMatrix(year, month0) {
  const first = new Date(year, month0, 1);
  const startYmd = addDays(toYmd(first), -mondayIndex(first));
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const row = [];
    for (let i = 0; i < 7; i++) {
      const ymd = addDays(startYmd, w * 7 + i);
      const d = parseYmd(ymd);
      row.push({ ymd, day: d.getDate(), inMonth: d.getMonth() === month0 && d.getFullYear() === year });
    }
    weeks.push(row);
  }
  return weeks;
}

/** { year, month0 } dari 'YYYY-MM-DD' (fallback: hari ini). */
export function monthOf(ymd, now = new Date()) {
  const d = parseYmd(ymd) || now;
  return { year: d.getFullYear(), month0: d.getMonth() };
}

export const formatMonthTitle = (year, month0) => `${MONTHS_LONG[month0]} ${year}`;

/** "Sen, 3 Nov 2026" */
export function formatShort(ymd) {
  const d = parseYmd(ymd);
  return d ? `${WEEKDAYS_SHORT[d.getDay()]}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}` : '';
}

/** "3 Nov 2026" */
export function formatDayMonth(ymd) {
  const d = parseYmd(ymd);
  return d ? `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}` : '';
}

/** "Senin, 3 November 2026" — untuk aria-label sel hari. */
export function formatLong(ymd) {
  const d = parseYmd(ymd);
  return d ? `${WEEKDAYS_LONG[d.getDay()]}, ${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}` : '';
}

/** Jumlah hari inklusif (3–7 Nov = 5). 0 bila tak lengkap. */
export function rangeLength(start, end) {
  const s = parseYmd(start); const e = parseYmd(end);
  if (!s || !e) return 0;
  // Math.round: aman terhadap pergeseran DST (bukan isu di WIB, tapi tetap benar).
  return Math.round((e - s) / 86400000) + 1;
}

/** Teks tombol pemicu. */
export function formatRangeLabel(start, end, mode = 'range') {
  const s = isValidYmd(start) ? start : '';
  const e = isValidYmd(end) ? end : '';
  if (mode === 'single') return s ? formatShort(s) : 'Pilih tanggal';
  if (s && e) return s === e ? formatShort(s) : `${formatShort(s)} – ${formatShort(e)}`;
  if (s) return `Mulai ${formatDayMonth(s)} · tanpa tanggal selesai`;
  if (e) return `Sampai ${formatDayMonth(e)}`;
  return 'Pilih tanggal mulai';
}

/**
 * Klik pada sebuah tanggal → rentang baru.
 * - single: { start: picked, end: '' }
 * - range: belum ada mulai / rentang sudah lengkap → mulai baru;
 *   mulai sudah ada tanpa selesai → jadi selesai (ditukar bila lebih awal);
 *   klik tanggal yang sama = rentang satu hari.
 * `complete` = true bila rentang kini lengkap (popover boleh ditutup).
 */
export function selectDate({ start = '', end = '' } = {}, picked, mode = 'range') {
  if (!isValidYmd(picked)) return { start, end, complete: false };
  if (mode === 'single') return { start: picked, end: '', complete: true };
  const s = isValidYmd(start) ? start : '';
  const e = isValidYmd(end) ? end : '';
  if (!s) {
    // Data lama: hanya tanggal selesai → klik pertama mengisi mulai.
    if (e && picked <= e) return { start: picked, end: e, complete: true };
    return { start: picked, end: '', complete: false };
  }
  if (e) return { start: picked, end: '', complete: false };
  return picked < s
    ? { start: picked, end: s, complete: true }
    : { start: s, end: picked, complete: true };
}

/**
 * Rentang yang disorot. Saat mulai sudah dipilih dan selesai belum,
 * `hover` (mouse / fokus keyboard) dipakai sebagai pratinjau ujung lainnya.
 */
export function highlightRange(start, end, hover) {
  const s = isValidYmd(start) ? start : '';
  const e = isValidYmd(end) ? end : '';
  if (s && e) return { from: s, to: e, preview: false };
  if (s && isValidYmd(hover) && hover !== s) {
    return hover < s ? { from: hover, to: s, preview: true } : { from: s, to: hover, preview: true };
  }
  if (s) return { from: s, to: s, preview: false };
  return null;
}

/** Status visual satu sel. */
export function dayState(ymd, { start = '', end = '', hover = '', today = '', min = '' } = {}) {
  const r = highlightRange(start, end, hover);
  const isStart = !!r && ymd === r.from;
  const isEnd = !!r && ymd === r.to;
  return {
    isStart,
    isEnd,
    isSelected: ymd === start || ymd === end,
    inRange: !!r && ymd > r.from && ymd < r.to,
    isEndpoint: isStart || isEnd,
    preview: !!r && r.preview,
    isToday: ymd === today,
    isMuted: !!min && ymd < min,
  };
}

/** Navigasi keyboard di grid → tanggal fokus berikutnya (null = bukan tombol navigasi). */
export function moveFocus(ymd, key, { shiftKey = false } = {}) {
  switch (key) {
    case 'ArrowLeft': return addDays(ymd, -1);
    case 'ArrowRight': return addDays(ymd, 1);
    case 'ArrowUp': return addDays(ymd, -7);
    case 'ArrowDown': return addDays(ymd, 7);
    case 'PageUp': return addMonths(ymd, shiftKey ? -12 : -1);
    case 'PageDown': return addMonths(ymd, shiftKey ? 12 : 1);
    case 'Home': return weekStart(ymd);
    case 'End': return weekEnd(ymd);
    default: return null;
  }
}

/** Pintasan cepat. `end: undefined` = pertahankan selesai saat ini. */
export function quickRanges(today, { start = '' } = {}) {
  return [
    { id: 'today', label: 'Hari ini', start: today, end: today },
    { id: 'tomorrow', label: 'Besok', start: addDays(today, 1), end: addDays(today, 1) },
    { id: 'this-week', label: 'Minggu ini', start: today, end: weekEnd(today) },
    { id: 'plus-week', label: '+1 minggu', start: today, end: addDays(today, 6) },
    { id: 'clear-end', label: 'Kosongkan selesai', start, end: '' },
  ];
}
