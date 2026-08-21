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
import { readJSON, writeJSON } from './storageMigrate.js';

const LS_KEY = (email) => `flag_colors_${email}`;

function getStore(email) {
  if (!email) return {};
  const parsed = readJSON(LS_KEY(email));
  if (parsed == null) return {};
  // Guard bentuk: JSON "null"/array/string → operasi store[...] crash.
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    // Bentuk rusak → bersihkan sekali: tulis {} (pola write-back idempotent).
    writeJSON(LS_KEY(email), {});
    return {};
  }
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
  if (changed) writeJSON(LS_KEY(email), parsed);
  return parsed;
}

function saveStore(email, store) {
  if (!email) return;
  try {
    localStorage.setItem(LS_KEY(email), JSON.stringify(store));
  } catch {}
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
}
