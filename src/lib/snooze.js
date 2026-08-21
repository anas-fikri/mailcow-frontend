/**
 * Snooze email (client-side) — pola Gmail.
 *
 * Email yang di-snooze TIDAK dipindah dari folder aslinya; hanya disembunyikan
 * dari daftar pesan di UI sampai waktu "bangun" (wakeEpoch). Ini aman: tidak
 * ada perubahan folder di server, tidak butuh endpoint SOGo baru, dan kalau
 * user membuka email dari klien lain email tetap ada di Inbox.
 *
 * Storage: localStorage per-akun `pcp_snooze_<email>` → { [uid]: wakeEpoch }
 */

import { readJSON, writeJSON } from './storageMigrate.js';

const normalizeEmail = (email) => typeof email === 'string' ? email.trim().toLowerCase() : '';
const LS_KEY = (email) => `pcp_snooze_${normalizeEmail(email)}`;

export const SNOOZE_PRESETS = [
  { id: 'tonight', label: 'Nanti malam', hours: 3 },
  { id: 'tomorrow', label: 'Besok pagi', hours: 12 },
  { id: 'weekend', label: 'Akhir pekan', hours: 48 },
  { id: 'week', label: 'Minggu depan', hours: 168 },
];

export function loadSnoozes(email) {
  if (!normalizeEmail(email)) return {};
  const parsed = readJSON(LS_KEY(email));
  if (parsed == null) return {};
  // Normalisasi: map { uid: wakeEpoch } dengan nilai numerik saja.
  // Data lama/rusak (nilai string, null, array) dibuang agar isSnoozed /
  // pruneExpired tidak bergantung pada Number() yang bisa NaN.
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    // Bentuk rusak → bersihkan sekali: tulis {} (pola write-back idempotent).
    writeJSON(LS_KEY(email), {});
    return {};
  }
  const out = {};
  let changed = false;
  for (const [uid, wake] of Object.entries(parsed)) {
    // Hanya number / string numerik (Number(null)=0 dan Number(true)=1 yang
    // merupakan koersi tidak diinginkan dari data rusak → tolak keduanya).
    const n = typeof wake === 'number' ? wake : Number(wake);
    if (Number.isFinite(n) && (typeof wake === 'number' || typeof wake === 'string')) {
      out[uid] = n;
      if (typeof wake !== 'number') changed = true;   // string epoch → number
    } else {
      changed = true;                                  // nilai invalid dibuang
    }
  }
  // Write-back SEKALI-JALAN: persist hasil bersih agar baca berikutnya
  // tidak mengulang normalisasi (idempotent).
  if (changed) writeJSON(LS_KEY(email), out);
  return out;
}

function save(email, map) {
  if (!normalizeEmail(email)) return;
  try {
    localStorage.setItem(LS_KEY(email), JSON.stringify(map));
  } catch { /* quota — silent */ }
}

/** Snooze satu pesan sampai `wakeEpoch` (detik). */
export function snoozeMessage(email, uid, wakeEpoch) {
  const map = loadSnoozes(email);
  map[String(uid)] = Number(wakeEpoch);
  save(email, map);
}

/** Batalkan snooze — pesan langsung muncul lagi. */
export function unsnoozeMessage(email, uid) {
  const map = loadSnoozes(email);
  delete map[String(uid)];
  save(email, map);
}

/** True jika pesan ini sedang di-snooze (belum waktunya bangun). */
export function isSnoozed(email, uid, nowEpoch = Math.floor(Date.now() / 1000)) {
  const wake = loadSnoozes(email)[String(uid)];
  return typeof wake === 'number' && wake > nowEpoch;
}

/** Hapus snooze yang sudah lewat waktunya (pemeliharaan). */
export function pruneExpired(email, nowEpoch = Math.floor(Date.now() / 1000)) {
  const map = loadSnoozes(email);
  let changed = false;
  for (const [uid, wake] of Object.entries(map)) {
    if (Number(wake) <= nowEpoch) {
      delete map[uid];
      changed = true;
    }
  }
  if (changed) save(email, map);
  return Object.keys(map).length;
}
