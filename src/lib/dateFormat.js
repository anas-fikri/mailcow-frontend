/**
 * Format tanggal/jam LOKAL untuk input date/time kalender (SOGo).
 *
 * Kenapa BUKAN toISOString(): toISOString selalu UTC. Untuk timezone di timur
 * UTC (mis. WIB +7), jam dini hari (00:00–06:59) menghasilkan tanggal UTC
 * = HARI SEBELUMNYA. Dampak nyata yang pernah terjadi:
 *   - klik sel kalender (midnight lokal) → modal terisi tanggal kemarin
 *   - edit event jam 02:00 → tersimpan sehari lebih awal
 *   - drag & drop ke slot dini hari → mendarat di hari sebelumnya
 * getFullYear/getMonth/getDate/getHours selalu LOKAL → konsisten dengan
 * toTimeString() yang sudah dipakai untuk jam.
 */

function pad(n) {
  return String(n).padStart(2, '0');
}

function toValid(d) {
  // new Date(null) = epoch (valid) — null/undefined harus dianggap kosong.
  if (d === null || d === undefined) return null;
  const dt = d instanceof Date ? d : new Date(d);
  return dt && !Number.isNaN(dt.getTime()) ? dt : null;
}

/** 'YYYY-MM-DD' dari komponen lokal (aman untuk input type=date). */
export function toLocalDateStr(d) {
  const dt = toValid(d);
  return dt ? `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}` : '';
}

/** 'HH:mm' dari komponen lokal (konsisten dengan getHours lokal). */
export function toLocalTimeStr(d) {
  const dt = toValid(d);
  return dt ? `${pad(dt.getHours())}:${pad(dt.getMinutes())}` : '';
}
