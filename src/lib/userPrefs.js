import { readJSON, writeIfChanged } from './storageMigrate.js';

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
const LS_KEY = (email) => `pcp_prefs_${normalizeEmail(email)}`;

/** Ambil preferensi tersimpan untuk satu akun; null jika belum pernah disimpan. */
export function loadPrefs(email) {
  if (!normalizeEmail(email)) return null;
  const parsed = readJSON(LS_KEY(email));
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
  writeIfChanged(LS_KEY(email), parsed, normalized);
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

