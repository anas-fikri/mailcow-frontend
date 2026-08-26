/**
 * Flag Color System — menyimpan preferensi warna flag per user di localStorage.
 * Tidak perlu SOGo API changes, cukup overlay client-side.
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
const LS_KEY = (email) => `flag_colors_v2_${email}`;

// Cache in-memory per email — getFlagColor dipanggil PER-BARIS di hot path
// render MailPage (50+ baris × beberapa kali per baris). Tanpa cache, setiap
// pemanggilan membaca + JSON.parse + normalisasi SELURUH store dari
// localStorage → lambat (jank saat scroll) dan hit GC. Cache di-invalidate
// saat store ditulis (setFlagColor dkk), jadi selalu segar di tab ini.
const storeCache = new Map(); // email → parsed store (object)

function getStore(email) {
  if (!email) return {};
  if (storeCache.has(email)) return storeCache.get(email);

  const { value: parsed, key: targetKey, version, fromLegacy } = readStorage(BASE_KEY, email);
  let result;
  if (parsed == null) {
    result = {};
  } else if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    // Bentuk rusak → bersihkan sekali: tulis {} di key terbaru (v2).
    writeJSON(targetKey, {});
    result = {};
  } else {
    // Migrasi sekali-jalan: buang key dengan warna yang tidak lagi dikenal
    // (mis. warna lama/rusak) agar countFlagColors/getAllFlags tidak menyimpan
    // sampah; ditulis balik bila ada yang dibuang.
    let changed = false;
    for (const [uid, colorKey] of Object.entries(parsed)) {
      if (typeof colorKey !== 'string' || !FLAG_COLORS[colorKey]) {
        delete parsed[uid];
        changed = true;
      }
    }
    // Write-back SEKALI-JALAN: hasil prune dipersist + data v1 dipindah ke v2
    // (key v1 dihapus hanya bila tulis sukses). Idempotent utk data valid.
    persistNormalized(BASE_KEY, email, parsed, parsed, { fromLegacy, key: targetKey, version });
    result = parsed;
  }
  storeCache.set(email, result);
  return result;
}

function invalidateStore(email) {
  if (email) storeCache.delete(email);
}

function saveStore(email, store) {
  if (!email) return;
  try {
    localStorage.setItem(LS_KEY(email), JSON.stringify(store));
  } catch {}
  invalidateStore(email);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Dapatkan warna flag untuk satu message */
export function getFlagColor(email, msgUid) {
  if (!email || !msgUid) return null;
  const store = getStore(email);
  const colorKey = store[String(msgUid)];
  return colorKey && FLAG_COLORS[colorKey] ? colorKey : null;
}

/** Set warna flag untuk satu message (null = hapus flag) */
export function setFlagColor(email, msgUid, colorKey) {
  if (!email || !msgUid) return;
  const store = getStore(email);
  if (colorKey && FLAG_COLORS[colorKey]) {
    store[String(msgUid)] = colorKey;
  } else {
    delete store[String(msgUid)];
  }
  saveStore(email, store);
}

/** Bulk set flag colors */
export function setFlagColorsBulk(email, uidColorMap) {
  if (!email) return;
  const store = getStore(email);
  Object.entries(uidColorMap).forEach(([uid, colorKey]) => {
    if (colorKey && FLAG_COLORS[colorKey]) {
      store[String(uid)] = colorKey;
    } else {
      delete store[String(uid)];
    }
  });
  saveStore(email, store);
}

/** Dapatkan semua flag dengan warnanya untuk satu user */
export function getAllFlags(email) {
  return getStore(email);
}

/** Hitung jumlah per warna */
export function countFlagColors(email) {
  const store = getStore(email);
  const counts = {};
  FLAG_COLOR_KEYS.forEach((k) => (counts[k] = 0));
  Object.values(store).forEach((color) => {
    if (counts[color] !== undefined) counts[color]++;
  });
  return counts;
}

/** Hapus flag untuk UID tertentu */
export function removeFlagColor(email, msgUid) {
  setFlagColor(email, msgUid, null);
}

/** Hapus semua flag untuk user */
export function clearAllFlags(email) {
  if (!email) return;
  localStorage.removeItem(LS_KEY(email));
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
