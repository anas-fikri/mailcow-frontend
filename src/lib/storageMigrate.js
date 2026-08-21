/**
 * Helper bersama untuk pola baca/tulis localStorage dengan migrasi write-back
 * idempotent (pola loadSignatures).
 *
 * Semua modul storage (signatures, autoArchive, snooze, flagColors, prefs
 * cache, userPrefs) memakai pola yang sama:
 *   1. baca + parse JSON (readJSON),
 *   2. normalisasi bentuk di memori,
 *   3. tulis balik HANYA bila bentuk berubah (writeIfChanged) atau saat sudah
 *      diputuskan berubah (writeJSON) — sehingga baca berikutnya no-op.
 *
 * Semua operasi tulis dibungkus try/catch: storage penuh / tidak tersedia
 * (Safari private mode, dll) TIDAK boleh membuat baca gagal.
 */

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
