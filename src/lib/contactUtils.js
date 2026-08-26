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
