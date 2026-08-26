/**
 * Builder data event hasil drag & drop di kalender (CalendarPage).
 * Dipisah dari komponen agar logika murni dan bisa diuji: drag harus
 * mempertahankan attendees, pola repeat, dan classification — regresi
 * sebelumnya menghapus ketiganya diam-diam (attendees='', repeat hilang).
 *
 * Tanggal memakai komponen LOKAL (bukan toISOString/UTC) — drag ke slot
 * dini hari (mis. 02:00 WIB) tidak boleh mendarat di hari sebelumnya.
 */
import { toLocalDateStr } from './dateFormat.js';

/**
 * Bangun payload update utk event yang dipindah (drag) ke tanggal/jam baru.
 * @param {object} ev   event asli (dari eventsblocks): {title, start, end, location, description, isAllDay, attendees, repeat, classification, ...}
 * @param {Date}   targetDate tanggal target (jam sudah di-set bila dari hour cell)
 * @param {number|null} hour jam target (null utk drop di sel bulan → default 09:00)
 */
export function buildDroppedEventData(ev, targetDate, hour = null) {
  if (!ev || !targetDate) return null;
  const d = new Date(targetDate);
  if (Number.isNaN(d.getTime())) return null;

  if (hour !== null) d.setHours(hour, 0, 0, 0);
  else d.setHours(9, 0, 0, 0);

  const oldStart = Number(ev.start) || 0;
  const oldEnd = Number(ev.end) || oldStart + 3600;
  const duration = oldEnd - oldStart;

  const newStart = Math.floor(d.getTime() / 1000);
  const newEnd = newStart + (duration > 0 ? duration : 3600);

  const newStartDate = new Date(newStart * 1000);
  const newEndDate = new Date(newEnd * 1000);

  return {
    title: ev.title || '',
    startDate: toLocalDateStr(newStartDate),
    startTime: newStartDate.toTimeString().slice(0, 5),
    endDate: toLocalDateStr(newEndDate),
    endTime: newEndDate.toTimeString().slice(0, 5),
    location: ev.location || '',
    description: ev.description || '',
    isAllDay: ev.isAllDay || false,
    // Pertahankan peserta + pola pengulangan — sebelumnya di-reset ke '' /
    // hilang diam-diam saat drag, menghapus attendee dan recurrence.
    attendees: ev.attendees || '',
    repeat: ev.repeat || null,
    classification: ev.classification,
    // Safety net recurrence (dipakai handleUpdateEvent): kalau event berulang
    // tapi repeat tidak tersedia di payload, CalendarPage me-resolve pola asli
    // via /view sebelum save — SOGo menimpa recurrence saat save tanpa repeat.
    isRecurring: ev.isRecurring || false,
    repeatTouched: false,
  };
}
