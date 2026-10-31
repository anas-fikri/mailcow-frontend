/**
 * Helper bersama untuk pola baca/tulis localStorage dengan migrasi write-back
 * idempotent (pola loadSignatures) + VERSI SKEMA pada nama key.
 *
 * Setiap domain storage memakai base key ber-version, mis.:
 *   v1 (legacy): `pcp_signatures_<email>`
 *   v2 (sekarang): `pcp_signatures_v2_<email>`
 *   v3 (nanti):   `pcp_signatures_v3_<email>`
 *
 * `readStorage(baseKey, scope)` membaca versi TERTINGGI dulu, lalu turun ke
 * versi lebih lama (fallback chain) — migrasi berikutnya cukup menaikkan
 * `STORAGE_VERSION` + menambahkan normalisasi di pemakai; data lama dibaca
 * dari key lama, dinormalisasi, dan dipindahkan ke key terbaru sekali
 * (`persistNormalized`), lalu key lama dihapus setelah tulis sukses.
 *
 * Semua operasi tulis dibungkus try/catch: storage penuh / tidak tersedia
 * (Safari private mode, dll) TIDAK boleh membuat baca gagal.
 */

/** Versi skema saat ini — naikkan saat ada migrasi skema baru. */
export const STORAGE_VERSION = 2;

/** Baca + parse JSON dari localStorage; null bila key tidak ada / JSON rusak. */
export function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Tulis nilai apa pun (stringify), dibungkus try/catch. True bila tertulis. */
export function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Hapus key, dibungkus try/catch. True bila terhapus. */
export function removeJSON(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Tulis balik HANYA bila bentuk tersimpan berbeda dari bentuk ternormalisasi
 * (bandingkan JSON.stringify — cocok utk struktur kecil: rules, prefs).
 * Idempotent: baca kedua dengan data valid tidak menulis apa pun.
 * @returns {boolean} true bila ada penulisan.
 */
export function writeIfChanged(key, original, normalized) {
  try {
    if (JSON.stringify(normalized) !== JSON.stringify(original)) {
      localStorage.setItem(key, JSON.stringify(normalized));
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Bentuk nama key ber-version.
 * @param {string} baseKey  prefix domain, mis. 'pcp_signatures'
 * @param {string} [scope]  scope per-akun, mis. email (tanpa pemisah)
 * @param {number} [version] versi skema (default STORAGE_VERSION)
 * @example storageKey('pcp_signatures', 'u@x.com')  → 'pcp_signatures_v2_u@x.com'
 * @example storageKey('pcp_signatures', 'u@x.com', 1) → 'pcp_signatures_u@x.com'
 */
export function storageKey(baseKey, scope = '', version = STORAGE_VERSION) {
  const suffix = scope ? `_${scope}` : '';
  return version > 1 ? `${baseKey}_v${version}${suffix}` : `${baseKey}${suffix}`;
}

/**
 * Baca dengan fallback chain: coba versi tertinggi → turun ke versi lama.
 * @param {string} baseKey prefix domain
 * @param {string} [scope] scope per-akun
 * @param {number} [maxVersion] versi tertinggi yg dicoba (default STORAGE_VERSION)
 * @returns {{ value: any, key: string, version: number, fromLegacy: boolean }}
 *   - value: parsed JSON dari versi tertinggi yang ADA (null bila tidak ada)
 *   - key:   key versi TERBARU (target migrasi)
 *   - version: versi sumber data (0 = tidak ada)
 *   - fromLegacy: true bila data berasal dari versi < maxVersion (perlu migrasi key)
 */
export function readStorage(baseKey, scope = '', maxVersion = STORAGE_VERSION) {
  const currentKey = storageKey(baseKey, scope, maxVersion);
  for (let v = maxVersion; v >= 1; v--) {
    const value = readJSON(storageKey(baseKey, scope, v));
    if (value != null) {
      return { value, key: currentKey, version: v, fromLegacy: v < maxVersion };
    }
  }
  return { value: null, key: currentKey, version: 0, fromLegacy: false };
}

/**
 * Tulis hasil normalisasi ke key TERBARU dengan pola migrasi sekali-jalan:
 * - Data dari key versi lama (fromLegacy): pindahkan ke key terbaru + hapus
 *   key lama (key lama dihapus HANYA bila tulis ke key baru sukses).
 * - Data sudah di key terbaru: tulis balik HANYA bila bentuk berubah
 *   (writeIfChanged — idempotent).
 * @returns {boolean} true bila ada penulisan.
 */
export function persistNormalized(baseKey, scope, parsed, normalized, info) {
  if (info.fromLegacy) {
    if (writeJSON(info.key, normalized)) {
      // Hapus key sumber lama agar tidak dibaca ulang/dimigrasi lagi.
      removeJSON(storageKey(baseKey, scope, info.version));
      return true;
    }
    return false;
  }
  return writeIfChanged(info.key, parsed, normalized);
}
