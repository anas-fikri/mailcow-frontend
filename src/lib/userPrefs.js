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
  // ── Tata letak ala Outlook desktop ──
  readingPane: 'right',        // 'right' | 'bottom' | 'off'
  density: 'normal',           // 'normal' | 'compact'
  markReadMode: 'instant',     // 'instant' | 'delay' | 'manual'
  markReadDelaySec: 3,         // dipakai saat markReadMode === 'delay'
  paneWidths: { folders: 220, list: 340, listHeight: 320 },
  collapsedFolders: [],        // id folder yang di-collapse di pohon folder
  favoriteFolders: [],         // id folder di seksi "Favorit"
};

const READING_PANE = ['right', 'bottom', 'off'];
const DENSITY = ['normal', 'compact'];
const MARK_READ = ['instant', 'delay', 'manual'];
const oneOf = (list, v, dflt) => (list.includes(v) ? v : dflt);
const strList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x).slice(0, 500) : []);
const clampInt = (v, min, max, dflt) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : dflt;
};
function normalizePaneWidths(v) {
  const d = DEFAULT_PREFS.paneWidths;
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  return {
    folders: clampInt(o.folders, 160, 320, d.folders),
    list: clampInt(o.list, 240, 560, d.list),
    listHeight: clampInt(o.listHeight, 160, 800, d.listHeight),
  };
}

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
    readingPane: oneOf(READING_PANE, parsed.readingPane, DEFAULT_PREFS.readingPane),
    density: oneOf(DENSITY, parsed.density, DEFAULT_PREFS.density),
    markReadMode: oneOf(MARK_READ, parsed.markReadMode, DEFAULT_PREFS.markReadMode),
    markReadDelaySec: clampInt(parsed.markReadDelaySec, 0, 60, DEFAULT_PREFS.markReadDelaySec),
    paneWidths: normalizePaneWidths(parsed.paneWidths),
    collapsedFolders: strList(parsed.collapsedFolders),
    favoriteFolders: strList(parsed.favoriteFolders),
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

