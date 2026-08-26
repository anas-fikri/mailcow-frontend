/**
 * Validasi event kalender — fungsi murni agar bisa diuji tanpa DOM/SOGo.
 *
 * Dipakai EventModal sebelum mengirim payload ke SOGo:
 *  - end-before-start → tolak dengan pesan jelas (SOGo menerima payload tsb
 *    dan membuat event durasi negatif / error 500 — tidak ada guard lain).
 *  - repeat interval/count negatif atau 0 → clamp ke 1 (SOGo menolak pola
 *    invalid; UI input min=1 bisa dilewati dengan mengetik manual).
 */

/** Parse "YYYY-MM-DD" + "HH:mm" jadi Date; isAllDay memakai jam tepi hari. */
function toDateTime(dateStr, timeStr, isAllDay, edge) {
  const base = new Date(`${dateStr}T${timeStr || '00:00'}`);
  if (Number.isNaN(base.getTime())) return null;
  if (!isAllDay) return base;
  const d = new Date(base);
  if (edge === 'end') d.setHours(23, 59, 59, 999);
  else d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Validasi rentang waktu event.
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validateEventTimes({ startDate, startTime, endDate, endTime, isAllDay }) {
  const start = toDateTime(startDate, startTime, isAllDay, 'start');
  const end = toDateTime(endDate, endTime, isAllDay, 'end');
  if (!start || !end) {
    return { ok: false, message: 'Tanggal/jam event tidak valid.' };
  }
  if (end.getTime() < start.getTime()) {
    return { ok: false, message: 'Waktu selesai harus setelah waktu mulai.' };
  }
  return { ok: true };
}

/** Clamp interval/count repeat ke minimal 1 (tolak 0/negatif/non-angka). */
export function normalizeRepeatCount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}
