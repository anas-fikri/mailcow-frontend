/**
 * Preferensi notifikasi webmail — localStorage per-akun.
 *
 * Key: `pcp_notify_v1_<email>` → { rich: boolean } (rich = notifikasi
 * menampilkan pengirim + subjek email terbaru; false = ringkas saja).
 * Pola mengikuti lib/snooze.js: key per-akun, normalizeEmail, toleran
 * data rusak (fallback default, tidak pernah throw).
 */

const BASE_KEY = 'pcp_notify';

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function storageKey(email) {
  return `${BASE_KEY}_v1_${normalizeEmail(email)}`;
}

/**
 * Baca preferensi notifikasi. Selalu mengembalikan objek valid.
 * @returns {{ rich: boolean }}
 */
export function loadNotifyPrefs(email) {
  try {
    const raw = localStorage.getItem(storageKey(email));
    if (!raw) return { rich: true };
    const parsed = JSON.parse(raw);
    return { rich: parsed?.rich !== false };
  } catch {
    return { rich: true };
  }
}

/**
 * Simpan preferensi notifikasi (merge partial). Return objek tersimpan.
 */
export function saveNotifyPrefs(email, patch) {
  const next = { ...loadNotifyPrefs(email), ...(patch || {}) };
  try {
    localStorage.setItem(storageKey(email), JSON.stringify(next));
  } catch {
    // storage penuh/di-block — tetap return nilai untuk UX optimis
  }
  return next;
}
