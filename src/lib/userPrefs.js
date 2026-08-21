import { readStorage, persistNormalized } from './storageMigrate.js';

/**
 * Preferensi UI per-akun (tema terang/gelap, warna aksen, urutan sortir,
 * tampilan percakapan).
 *
 * Disimpan di localStorage dengan key per email sehingga:
 * - Setiap akun punya pengaturannya sendiri (tidak saling menimpa antar akun).
 * - Tidak ter-reset saat logout / berganti akun / session berakhir.
 *
 * Mengikuti pola yang sama seperti `autoArchive.js` dan `flagColors.js`.
 */

export const DEFAULT_PREFS = {
  theme: 'dark',
  themeColor: 'blue',
  sortAsc: false,
  conversationView: false,
};

const normalizeEmail = (email) => typeof email === 'string' ? email.trim().toLowerCase() : '';
const BASE_KEY = 'pcp_prefs';
const LS_KEY = (email) => `pcp_prefs_v2_${normalizeEmail(email)}`;

/** Ambil preferensi tersimpan untuk satu akun; null jika belum pernah disimpan. */
export function loadPrefs(email) {
  const normEmail = normalizeEmail(email);
  if (!normEmail) return null;
  const { value: parsed, key: targetKey, version, fromLegacy } = readStorage(BASE_KEY, normEmail);
  if (parsed == null) return null;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const normalized = {
    theme: parsed.theme === 'light' || parsed.theme === 'dark' ? parsed.theme : DEFAULT_PREFS.theme,
    themeColor: typeof parsed.themeColor === 'string' && parsed.themeColor ? parsed.themeColor : DEFAULT_PREFS.themeColor,
    sortAsc: !!parsed.sortAsc,
    conversationView: !!parsed.conversationView,
  };
  // Migrasi SEKALI-JALAN: bila bentuk tersimpan beda dari bentuk
  // ternormalisasi (field hilang / key ekstra / nilai tidak valid),
  // tulis balik agar baca berikutnya tidak mengulang normalisasi.
  persistNormalized(BASE_KEY, normEmail, parsed, normalized, { fromLegacy, key: targetKey, version });
  return normalized;
}

/** Simpan preferensi untuk satu akun. */
export function savePrefs(email, prefs) {
  if (!normalizeEmail(email)) return;
  try {
    localStorage.setItem(LS_KEY(email), JSON.stringify({
      ...DEFAULT_PREFS,
      ...prefs,
    }));
  } catch { /* quota exceeded — silent */ }
}

