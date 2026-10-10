/**
 * Preferensi notifikasi webmail — localStorage per-akun.
 *
 * Key: `pcp_notify_v1_<email>` → { rich: boolean, sound: boolean }
 *  - rich  = notifikasi menampilkan pengirim + subjek email terbaru;
 *            false = ringkas saja. Default true.
 *  - sound = mainkan suara singkat saat notifikasi email baru muncul.
 *            Default false (opt-in — suara tak terduga mengganggu di kantor).
 * Pola mengikuti lib/snooze.js: key per-akun, normalizeEmail, toleran
 * data rusak (fallback default, tidak pernah throw).
 */

const BASE_KEY = 'pcp_notify';

export const DEFAULT_NOTIFY_PREFS = Object.freeze({ rich: true, sound: false });

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function storageKey(email) {
  return `${BASE_KEY}_v1_${normalizeEmail(email)}`;
}

/** Normalisasi objek mentah → bentuk valid (field hilang / tipe salah → default). */
export function normalizeNotifyPrefs(parsed) {
  const o = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  return {
    rich: o.rich !== false,
    sound: o.sound === true,
  };
}

/**
 * Baca preferensi notifikasi. Selalu mengembalikan objek valid.
 * @returns {{ rich: boolean, sound: boolean }}
 */
export function loadNotifyPrefs(email) {
  try {
    const raw = localStorage.getItem(storageKey(email));
    if (!raw) return { ...DEFAULT_NOTIFY_PREFS };
    return normalizeNotifyPrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_NOTIFY_PREFS };
  }
}

/** Alias semantik — dipakai MailPage utk `getNotifyPrefs(email).sound`. */
export const getNotifyPrefs = loadNotifyPrefs;

/**
 * Simpan preferensi notifikasi (merge partial). Return objek tersimpan.
 */
export function saveNotifyPrefs(email, patch) {
  const next = normalizeNotifyPrefs({ ...loadNotifyPrefs(email), ...(patch || {}) });
  try {
    localStorage.setItem(storageKey(email), JSON.stringify(next));
  } catch {
    // storage penuh/di-block — tetap return nilai untuk UX optimis
  }
  return next;
}
