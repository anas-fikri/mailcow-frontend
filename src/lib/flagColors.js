/**
 * Flag Color System — menyimpan preferensi warna flag per user di localStorage.
 * Tidak perlu SOGo API changes, cukup overlay client-side.
 *
 * ─── Schema v3: FOLDER-SCOPED (audit 2026-09-05) ─────────────────────────────
 * SOGo memberi UID PER-FOLDER: pesan yang dipindah (arsip/move/trash/junk)
 * mendapat UID BARU di folder tujuan, dan UID lama bisa DIPAKAI ULANG oleh
 * pesan baru di folder asal. Store flat { uid: color } (v2) membuat entri
 * yatim: warna lama menempel pada pesan baru yang kebetulan memakai uid yang
 * sama, dan filter flag ikut salah (false positive) — kelas bug yang sama
 * dengan snooze v2→v3 (lihat src/lib/snooze.js).
 *
 * Bentuk v3: { [folderId]: { [uid]: colorKey } }
 *   - getFlagColor(email, uid, folderId) hanya melihat folder tsb.
 *   - Purge-on-move (removeFlagColorsBulk) tetap ada sebagai pembersihan
 *     eksplisit; dengan folder-scoping, entri yang lolos purge pun tidak
 *     bisa salah sasaran lintas folder.
 *
 * Migrasi v2 (flat, per-user) → v3: entri flat dianggap milik folderINBOX
 * (asal mayoritas operasi flag) — konsisten dengan migrasi snooze v2→v3.
 */

// ─── Color Definitions ───────────────────────────────────────────────────────
export const FLAG_COLORS = {
  red:    { label: 'Urgent',      color: '#ef4444', bg: 'bg-red-500',      fill: 'fill-red-500',      text: 'text-red-500' },
  yellow: { label: 'Penting',     color: '#eab308', bg: 'bg-yellow-500',   fill: 'fill-yellow-500',   text: 'text-yellow-500' },
  green:  { label: 'Normal',      color: '#22c55e', bg: 'bg-green-500',    fill: 'fill-green-500',    text: 'text-green-500' },
  blue:   { label: 'Info',        color: '#3b82f6', bg: 'bg-blue-500',     fill: 'fill-blue-500',     text: 'text-blue-500' },
  purple: { label: 'Follow Up',   color: '#8b5cf6', bg: 'bg-purple-500',   fill: 'fill-purple-500',   text: 'text-purple-500' },
};

export const FLAG_COLOR_KEYS = Object.keys(FLAG_COLORS);
export const FLAG_COLOR_DEFAULT = 'yellow';

// ─── localStorage helpers ────────────────────────────────────────────────────
import { writeJSON, readStorage, persistNormalized } from './storageMigrate.js';

const BASE_KEY = 'flag_colors';
const SCHEMA_VERSION = 3;
const LS_KEY = (email) => `flag_colors_v3_${email}`;
/** Folder fallback untuk entri legacy flat (v2) — konsisten dgn migrasi snooze. */
const LEGACY_DEFAULT_FOLDER = 'folderINBOX';

// Cache in-memory per email — getFlagColor dipanggil PER-BARIS di hot path
// render MailPage (50+ baris × beberapa kali per baris). Tanpa cache, setiap
// pemanggilan membaca + JSON.parse + normalisasi SELURUH store dari
// localStorage → lambat (jank saat scroll) dan hit GC. Cache di-invalidate
// saat store ditulis (setFlagColor dkk), jadi selalu segar di tab ini.
const storeCache = new Map(); // email → normalized store (folder-scoped)

/** Normalisasi satu map { uid: color } — hanya warna yang dikenal. */
function normalizeFlat(uidMap) {
  if (!uidMap || typeof uidMap !== 'object' || Array.isArray(uidMap)) return {};
  const clean = {};
  for (const [uid, colorKey] of Object.entries(uidMap)) {
    if (typeof colorKey === 'string' && FLAG_COLORS[colorKey]) clean[uid] = colorKey;
  }
  return clean;
}

/** Normalisasi bentuk v3 { folderId: { uid: color } }; buang folder kosong. */
function normalizeNested(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out = {};
  for (const [folderId, uidMap] of Object.entries(parsed)) {
    if (!uidMap || typeof uidMap !== 'object' || Array.isArray(uidMap)) continue;
    const clean = normalizeFlat(uidMap);
    if (Object.keys(clean).length > 0) out[folderId] = clean;
  }
  return out;
}

function getStore(email) {
  if (!email) return {};
  if (storeCache.has(email)) return storeCache.get(email);

  const { value: parsed, key: targetKey, version, fromLegacy } =
    readStorage(BASE_KEY, email, SCHEMA_VERSION);
  let result;
  if (parsed == null) {
    // Tidak ada data (key absen / literal null) → tidak ada yang dinormalisasi:
    // JANGAN menulis '{}' ke storage saat baca (read-only path). Store baru
    // dibuat saat tulis pertama lewat setFlagColor dkk.
    result = {};
    storeCache.set(email, result);
    return result;
  } else if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    // Bentuk rusak → bersihkan sekali: tulis {} di key terbaru (v3).
    writeJSON(targetKey, {});
    result = {};
  } else if (version < 3) {
    // v1/v2 flat { uid: color } → bungkus ke folderINBOX (migrasi v3).
    result = { [LEGACY_DEFAULT_FOLDER]: normalizeFlat(parsed) };
  } else {
    result = normalizeNested(parsed);
  }
  // Write-back SEKALI-JALAN: bentuk ternormalisasi dipersist ke key v3,
  // key legacy dihapus bila tulis sukses (idempotent utk data valid).
  persistNormalized(BASE_KEY, email, parsed, result, { fromLegacy, key: targetKey, version });
  storeCache.set(email, result);
  return result;
}

function invalidateStore(email) {
  if (email) storeCache.delete(email);
}

function saveStore(email, store) {
  if (!email) return;
  writeJSON(LS_KEY(email), store);
  invalidateStore(email);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Dapatkan warna flag untuk satu message PADA FOLDER tertentu. */
export function getFlagColor(email, msgUid, folderId = LEGACY_DEFAULT_FOLDER) {
  if (!email || !msgUid) return null;
  const folderMap = getStore(email)[String(folderId || LEGACY_DEFAULT_FOLDER)];
  const colorKey = folderMap?.[String(msgUid)];
  return colorKey && FLAG_COLORS[colorKey] ? colorKey : null;
}

/** Set warna flag untuk satu message (null = hapus flag). */
export function setFlagColor(email, msgUid, colorKey, folderId = LEGACY_DEFAULT_FOLDER) {
  if (!email || !msgUid) return;
  const store = getStore(email);
  const folder = String(folderId || LEGACY_DEFAULT_FOLDER);
  const folderMap = { ...(store[folder] || {}) };
  if (colorKey && FLAG_COLORS[colorKey]) {
    folderMap[String(msgUid)] = colorKey;
  } else {
    delete folderMap[String(msgUid)];
  }
  if (Object.keys(folderMap).length > 0) {
    store[folder] = folderMap;
  } else {
    delete store[folder];
  }
  saveStore(email, store);
}

/** Bulk set flag colors untuk SATU folder. */
export function setFlagColorsBulk(email, uidColorMap, folderId = LEGACY_DEFAULT_FOLDER) {
  if (!email) return;
  const store = getStore(email);
  const folder = String(folderId || LEGACY_DEFAULT_FOLDER);
  const folderMap = { ...(store[folder] || {}) };
  Object.entries(uidColorMap || {}).forEach(([uid, colorKey]) => {
    if (colorKey && FLAG_COLORS[colorKey]) {
      folderMap[String(uid)] = colorKey;
    } else {
      delete folderMap[String(uid)];
    }
  });
  if (Object.keys(folderMap).length > 0) {
    store[folder] = folderMap;
  } else {
    delete store[folder];
  }
  saveStore(email, store);
}

/** Semua flag user utk satu folder — { uid: colorKey } (bentuk lama API). */
export function getAllFlags(email, folderId = LEGACY_DEFAULT_FOLDER) {
  return getStore(email)[String(folderId || LEGACY_DEFAULT_FOLDER)] || {};
}

/** Hitung jumlah per warna untuk satu folder. */
export function countFlagColors(email, folderId = LEGACY_DEFAULT_FOLDER) {
  const counts = {};
  FLAG_COLOR_KEYS.forEach((k) => (counts[k] = 0));
  Object.values(getAllFlags(email, folderId)).forEach((color) => {
    if (counts[color] !== undefined) counts[color] += 1;
  });
  return counts;
}

/**
 * Hapus entri flag-color untuk BANYAK uid pada SATU folder.
 *
 * Dipanggil SETELAH pesan dipindah/dihapus dari folder asal (move/arsip/
 * trash/junk) — uid di folder asal tidak berlaku lagi. Dengan store
 * folder-scoped, purge ini scopenya presisi: hanya entri folder asal yang
 * dihapus; warna di folder lain tidak mungkin salah sasaran walau uid sama.
 *
 * @returns {number} jumlah entri yang dihapus (0 bila tidak ada).
 */
export function removeFlagColorsBulk(email, msgUids, folderId = LEGACY_DEFAULT_FOLDER) {
  if (!email || !Array.isArray(msgUids) || msgUids.length === 0) return 0;
  const store = getStore(email);
  const folder = String(folderId || LEGACY_DEFAULT_FOLDER);
  const folderMap = store[folder];
  if (!folderMap) return 0;
  let removed = 0;
  for (const uid of msgUids) {
    if (uid != null && Object.prototype.hasOwnProperty.call(folderMap, String(uid))) {
      delete folderMap[String(uid)];
      removed += 1;
    }
  }
  if (removed > 0) {
    if (Object.keys(folderMap).length === 0) delete store[folder];
    saveStore(email, store);
  }
  return removed;
}

/** Hapus flag untuk UID tertentu pada satu folder. */
export function removeFlagColor(email, msgUid, folderId = LEGACY_DEFAULT_FOLDER) {
  setFlagColor(email, msgUid, null, folderId);
}

/** Hapus semua flag untuk user (SEMUA folder). */
export function clearAllFlags(email) {
  if (!email) return;
  try { localStorage.removeItem(LS_KEY(email)); } catch {}
  try { localStorage.removeItem(`flag_colors_v2_${email}`); } catch {}
  try { localStorage.removeItem(`flag_colors_${email}`); } catch {}
  invalidateStore(email);
}

/**
 * (Internal/test) Kosongkan cache in-memory — dipakai saat storage diubah
 * langsung dari luar (mis. simulasi tab lain / setup test). Bukan bagian dari
 * API normal: di aplikasi, semua tulis lewat setFlagColor dkk yang sudah
 * invalidate cache otomatis.
 */
export function __resetFlagColorCache() {
  storeCache.clear();
}
