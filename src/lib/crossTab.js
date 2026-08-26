/**
 * Koordinasi lintas-tab sederhana: "domain version bump" via localStorage.
 *
 * Masalah: cache React Query bersifat PER-TAB. Tab A create/delete event atau
 * kontak → invalidate hanya di tab A; tab B masih menampilkan data basi sampai
 * staleTime (kalender/kontak = 5 menit).
 *
 * Pola: setiap kali mutasi sukses, tab yang menulis me-`bump` versi domain
 * (`pcp_<domain>_v_<email>` = timestamp epoch). Tab LAIN mendengar event
 * `storage` (hanya ter-fire di tab lain, bukan penulis), membandingkan versi
 * dengan yang terakhir dilihat, dan invalidate query domain tsb → refetch.
 * Penulis sudah invalidate lokal, jadi tidak perlu event untuk dirinya.
 */

const VERSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 jam — versi kedaluwarsa dibersihkan

function normEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function keyFor(domain, email) {
  return `pcp_${domain}_v_${normEmail(email)}`;
}

/** Baca versi domain saat ini (0 bila belum pernah di-bump / key rusak). */
export function readDomainVersion(domain, email) {
  const k = keyFor(domain, email);
  try {
    const raw = localStorage.getItem(k);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * Bump versi domain (timestamp, MONOTONIK). Dipanggil oleh tab penulis
 * setelah mutasi sukses — tab lain mendengar lewat event 'storage' dan
 * invalidate query-nya.
 *
 * Monotonik: dua bump dalam milidetik yang sama (mutasi cepat beruntun)
 * menghasilkan timestamp sama → tab lain TIDAK mendeteksi perubahan. Jamin
 * versi selalu naik minimal 1 dari versi terakhir yang dibaca.
 * @returns {number} versi baru
 */
export function bumpDomainVersion(domain, email) {
  if (!normEmail(email)) return 0; // tanpa scope akun, versi tidak bermakna
  const k = keyFor(domain, email);
  const prev = readDomainVersion(domain, email);
  const next = Math.max(Date.now(), prev + 1);
  try {
    localStorage.setItem(k, String(next));
  } catch { /* quota/privasi — abaikan */ }
  return next;
}

/** Bersihkan versi yang kedaluwarsa (dipanggil saat bump — ringan). */
export function pruneDomainVersions(domain, email) {
  const k = keyFor(domain, email);
  try {
    const v = readDomainVersion(domain, email);
    if (v > 0 && Date.now() - v > VERSION_TTL_MS) localStorage.removeItem(k);
  } catch { /* abaikan */ }
}

/**
 * Pasang listener 'storage' utk domain — invalidate query saat versi berubah
 * (tab lain melakukan mutasi). Cleanup otomatis saat unmount.
 *
 * @param {string}   domain    'calendar' | 'contacts'
 * @param {string}   email     akun (scope)
 * @param {function} onInvalidate callback (dipanggil saat versi berubah)
 * @returns {function} cleanup
 */
export function watchDomainVersion(domain, email, onInvalidate) {
  const k = keyFor(domain, email);
  let last = readDomainVersion(domain, email);
  const onStorage = (e) => {
    // e.key null = localStorage.clear() — anggap semua domain berubah.
    if (e?.key !== null && e?.key !== k) return;
    const current = readDomainVersion(domain, email);
    if (current > last) {
      last = current;
      onInvalidate?.();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}
