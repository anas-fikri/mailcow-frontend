/**
 * Parser murni respons SOGo `Calendar/eventsblocks` → daftar event.
 *
 * Dipisah dari api.js agar bisa diuji tanpa fetch. Termasuk:
 *  - Dedup baris DUPLIKAT (id + start + calendar sama) — SOGo meng-expand
 *    recurring menjadi satu baris PER OCCURRENCE (start berbeda), dan itu
 *    WAJIB dipertahankan; hanya baris yang benar-benar kembar yang dibuang
 *    agar event yang sama tidak dirender dua kali di grid.
 *  - Guard baris rusak (blocks bukan array, baris bukan array) — tanpa ini
 *    satu baris korup bisa merusak seluruh kalender.
 */

/** Parse satu respons eventsblocks → daftar event (tanpa fetch). */
export function parseCalendarEvents(raw) {
  const events = [];
  const seen = new Set();

  for (const cal of (Array.isArray(raw) ? raw : [])) {
    const fields = Array.isArray(cal?.eventsFields) ? cal.eventsFields : [];
    const blocks = Array.isArray(cal?.blocks) ? cal.blocks : [];
    for (const block of blocks) {
      // Guard baris rusak — Object.fromEntries pada non-array crash.
      if (!Array.isArray(block)) continue;
      const ev = Object.fromEntries(fields.map((f, i) => [f, block[i]]));

      const id = String(ev.c_name || '');
      const calendar = ev.calendarName || '';
      // Normalisasi ke string agar Number 1 dan "1" dedup-nya sama.
      const key = `${id}|${String(ev.c_startdate ?? '')}|${calendar}`;
      if (id && seen.has(key)) continue;
      if (id) seen.add(key);

      events.push({
        id,
        title: ev.c_title || '(Tanpa Judul)',
        start: ev.c_startdate,   // unix timestamp
        end: ev.c_enddate,       // unix timestamp
        startHour: ev.startHour || '',
        location: ev.c_location || '',
        isAllDay: !!ev.c_isallday,
        isRecurring: !!ev.c_iscycle,
        calendar,
        folder: ev.c_folder || '',
        owner: ev.c_owner || '',
        status: ev.c_status,
        description: ev.c_description || '',
        // c_partmails newline-separated (iCalEvent+SOGo.m quickRecordFromContent)
        attendees: ev.c_partmails ? String(ev.c_partmails).split('\n').filter(Boolean).join(', ') : '',
        // c_classification: 0=public, 1=private, 2=confidential
        classification: ev.c_classification === 1 ? 'private' : ev.c_classification === 2 ? 'confidential' : 'public',
      });
    }
  }
  return events;
}

/**
 * Event yang TAMPIL pada satu hari (local midnight → +24 jam).
 *
 * Overlap-based, bukan hanya hari-mulai: event multi-hari (mis. konferensi
 * 2 hari, all-day lintas tanggal) harus muncul di SEMUA hari yang di-span,
 * bukan hanya hari pertama. End bersifat eksklusif (end = tengah malam hari
 * berikutnya tidak menampilkan event di hari itu).
 *
 * @param {Array} events daftar event (dari parseCalendarEvents)
 * @param {Date} date  tanggal lokal apa pun dalam hari yang dicari
 */
export function eventsOnDay(events, date) {
  const dt = date instanceof Date ? date : new Date(date);
  if (!dt || Number.isNaN(dt.getTime())) return [];
  const dayStart = Math.floor(new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime() / 1000);
  const dayEnd = dayStart + 86399;
  return (Array.isArray(events) ? events : []).filter((ev) => {
    const s = Number(ev.start);
    if (!Number.isFinite(s)) return false;
    const e = Number(ev.end) || s;
    return s <= dayEnd && e > dayStart;
  });
}
