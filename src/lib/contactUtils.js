/**
 * Utilitas kontak — fungsi murni agar bisa diuji tanpa DOM/SOGo.
 *
 * Fokus edge case: duplikat kontak GAL vs personal. GAL adalah direktori
 * (read-only, tidak bisa dihapus); user sah menambah salinan personal dari
 * kolega yang ada di GAL. Karena itu duplikat di GAL TIDAK diblokir, tapi
 * duplikat di kontak PERSONAL diblokir (itu murni duplikat).
 */

/**
 * Deteksi duplikat email di daftar kontak.
 * @param {Array} contacts  daftar kontak [{email, isGAL}]
 * @param {string} email    email baru yang dicek
 * @returns {'personal'|'gal'|null} — 'personal' lebih prioritas (duplikat nyata)
 */
export function findDuplicateKind(contacts, email) {
  const target = String(email || '').trim().toLowerCase();
  if (!target) return null;
  let gal = false;
  for (const c of (Array.isArray(contacts) ? contacts : [])) {
    if (String(c?.email || '').trim().toLowerCase() !== target) continue;
    if (c?.isGAL) gal = true;
    else return 'personal';
  }
  return gal ? 'gal' : null;
}

// ── Parsing baris kontak SOGo ────────────────────────────────────────────────
// SOGo `Contacts/personal/view` mengembalikan `headers: [colNames, ...rows]`.
// Field `c_cn`/`c_mail`/`emails`/`c_telephonenumber`/`c_o` BISA berupa object
// (bukan string) pada beberapa versi SOGo — tanpa normalisasi, `.toLowerCase()`
// di filter pencarian atau render React ("Objects are not valid as a React
// child") membuat halaman kontak crash. Sama dgn pola normalisasi di
// messageRows.js (subject/date).

/** Coerce value ke string aman (object/array/angka → string; null/undefined → ''). */
function str(value) {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : String(value);
}

/** Ambil email pertama dari field `emails` (array string ATAU array object). */
function firstEmail(value) {
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    if (typeof first === 'string') return first;
    if (first && typeof first === 'object') return str(first.email || first.address || first.value);
  }
  return '';
}

/**
 * Parse satu baris kontak menjadi objek bersih (semua field string).
 * @param {Array} cols  nama kolom (index 0 dari `headers`)
 * @param {Array} row   baris data
 * @returns {object|null} null bila baris rusak (non-array)
 */
export function parseContactRow(cols, row) {
  if (!Array.isArray(row)) return null;
  const c = Object.fromEntries((Array.isArray(cols) ? cols : []).map((k, i) => [k, row[i]]));

  const uid = str(c.id || c.c_uid);
  return {
    uid,
    name: str(c.c_cn || c.fn || c.c_uid),
    firstName: str(c.c_givenname),
    lastName: str(c.c_sn),
    email: str(c.c_mail) || firstEmail(c.emails),
    phone: str(c.c_telephonenumber),
    org: str(c.c_o),
    isGAL: str(c.containerName).includes('GAL'),
    source: str(c.sourceID),
  };
}

