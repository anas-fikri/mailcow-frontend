/**
 * Snooze email (client-side) — pola Gmail.
 *
 * Email yang di-snooze TIDAK dipindah dari folder aslinya; hanya disembunyikan
 * dari daftar pesan di UI sampai waktu "bangun" (wakeEpoch). Ini aman: tidak
 * ada perubahan folder di server, tidak butuh endpoint SOGo baru, dan kalau
 * user membuka email dari klien lain email tetap ada di Inbox.
 *
 * Storage: localStorage per-akun `pcp_snooze_v3_<email>` →
 *   { [folderId]: { [uid]: wakeEpoch } }
 *
 * Schema v3 = FOLDER-SCOPED. Alasan: SOGo memberi UID per-folder — pesan yang
 * dipindah (arsip/move) mendapat UID BARU di folder tujuan. Entri snooze yang
 * hanya berisi uid (schema v2 flat) menjadi YATIM saat pesan pindah: uid lama
 * tidak lagi merujuk pesan itu, dan bila UID itu dipakai ulang oleh pesan
 * inbox baru, pesan baru ikut tersembunyi (stale false-positive). Dengan
 * scope per folder, entri snooze hanya berlaku untuk folder asal.
 *
 * (v2 legacy flat `pcp_snooze_v2_<email>` → { [uid]: wakeEpoch } dimigrasi
 * sekali-jalan ke v3 — entri v2 dianggap milik folderINBOX.)
 */

import { readStorage, persistNormalized } from './storageMigrate.js';

const normalizeEmail = (email) => typeof email === 'string' ? email.trim().toLowerCase() : '';
const BASE_KEY = 'pcp_snooze';
const SNOOZE_SCHEMA_VERSION = 3;

export const SNOOZE_PRESETS = [
  { id: 'tonight', label: 'Nanti malam', hours: 3 },
  { id: 'tomorrow', label: 'Besok pagi', hours: 12 },
  { id: 'weekend', label: 'Akhir pekan', hours: 48 },
  { id: 'week', label: 'Minggu depan', hours: 168 },
];

/**
 * Ambil seluruh map snooze user (folder → { uid: wakeEpoch }), TER-NORMALISASI.
 *
 * Normalisasi: nilai wake harus number (string numerik di-coerce, null/true/
 * NaN dibuang), folder map harus object. Bentuk rusak ditulis ulang sekali
 * (idempotent), dan data v2 legacy flat dimigrasi ke v3 (folderINBOX).
 */
export function loadSnoozes(email) {
  const normEmail = normalizeEmail(email);
  if (!normEmail) return {};

  const { value: parsed, key: targetKey, version, fromLegacy } =
    readStorage(BASE_KEY, normEmail, SNOOZE_SCHEMA_VERSION);

  if (parsed == null) return {};

  // Schema v2 (flat { uid: wakeEpoch }) → bungkus ke folderINBOX.
  // Schema v3 ({ folderId: { uid: wakeEpoch } }) → normalisasi per folder.
  const out = version >= 3 ? normalizeNested(parsed) : { folderINBOX: normalizeFlat(parsed) };

  // Write-back SEKALI-JALAN: persist hasil bersih agar baca berikutnya tidak
  // mengulang normalisasi (idempotent) + pindahkan data v2 ke v3 (key v2
  // dihapus hanya bila tulis sukses).
  persistNormalized(BASE_KEY, normEmail, parsed, out, { fromLegacy, key: targetKey, version });
  return out;
}

/** Normalisasi bentuk { folderId: { uid: wakeEpoch } }. */
function normalizeNested(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out = {};
  for (const [folderId, uidMap] of Object.entries(parsed)) {
    if (!uidMap || typeof uidMap !== 'object' || Array.isArray(uidMap)) continue;
    const clean = normalizeFlat(uidMap);
    if (Object.keys(clean).length > 0 || Object.keys(uidMap).length === 0) {
      out[folderId] = clean;
    }
  }
  return out;
}

/** Normalisasi satu map { uid: wakeEpoch } — nilai numerik saja. */
function normalizeFlat(uidMap) {
  if (!uidMap || typeof uidMap !== 'object' || Array.isArray(uidMap)) return {};
  const clean = {};
  for (const [uid, wake] of Object.entries(uidMap)) {
    // Hanya number / string numerik (Number(null)=0 dan Number(true)=1 yang
    // merupakan koersi tidak diinginkan dari data rusak → tolak keduanya).
    const n = typeof wake === 'number' ? wake : Number(wake);
    if (Number.isFinite(n) && (typeof wake === 'number' || typeof wake === 'string')) {
      clean[uid] = n;
    }
  }
  return clean;
}

function save(email, map) {
  if (!normalizeEmail(email)) return;
  try {
    localStorage.setItem(`pcp_snooze_v3_${normalizeEmail(email)}`, JSON.stringify(map));
  } catch { /* quota — silent */ }
}

/** Snooze satu pesan sampai `wakeEpoch` (detik), di dalam folder asalnya. */
export function snoozeMessage(email, folderId, uid, wakeEpoch) {
  const map = loadSnoozes(email);
  const folder = String(folderId || 'folderINBOX');
  const folderMap = (map[folder] && typeof map[folder] === 'object' && !Array.isArray(map[folder]))
    ? map[folder] : {};
  folderMap[String(uid)] = Number(wakeEpoch);
  map[folder] = folderMap;
  save(email, map);
}

/** Batalkan snooze satu pesan di folder tertentu — pesan langsung muncul lagi. */
export function unsnoozeMessage(email, folderId, uid) {
  const map = loadSnoozes(email);
  const folder = String(folderId || 'folderINBOX');
  const folderMap = (map[folder] && typeof map[folder] === 'object' && !Array.isArray(map[folder]))
    ? map[folder] : {};
  delete folderMap[String(uid)];
  map[folder] = folderMap;
  save(email, map);
}

/**
 * Hapus entri snooze untuk beberapa pesan di satu folder (pemeliharaan).
 *
 * Dipanggil SETELAH pesan dipindah/dihapus dari folder asal (arsip, move,
 * pindah ke Sampah, spam). Tanpa ini entri snooze menjadi yatim: uid lama
 * tidak lagi merujuk pesan itu, dan bila uid dipakai ulang oleh pesan baru,
 * pesan baru ikut tersembunyi. Dengan menghapus entri di sumber, stale
 * false-positive tidak pernah terjadi.
 *
 * @returns {number} jumlah entri yang dihapus (0 bila tidak ada).
 */
export function unsnoozeMessages(email, folderId, uids) {
  if (!normalizeEmail(email) || !Array.isArray(uids) || uids.length === 0) return 0;
  const map = loadSnoozes(email);
  const folder = String(folderId || 'folderINBOX');
  const folderMap = (map[folder] && typeof map[folder] === 'object' && !Array.isArray(map[folder]))
    ? map[folder] : {};
  let removed = 0;
  for (const uid of uids) {
    if (uid != null && Object.prototype.hasOwnProperty.call(folderMap, String(uid))) {
      delete folderMap[String(uid)];
      removed += 1;
    }
  }
  if (removed > 0) {
    map[folder] = folderMap;
    save(email, map);
  }
  return removed;
}

/** True jika pesan ini sedang di-snooze di folder tsb (belum waktunya bangun). */
export function isSnoozed(email, folderId, uid, nowEpoch = Math.floor(Date.now() / 1000)) {
  const map = loadSnoozes(email);
  const wake = map[String(folderId || 'folderINBOX')]?.[String(uid)];
  return typeof wake === 'number' && wake > nowEpoch;
}

/** Hapus snooze yang sudah lewat waktunya (pemeliharaan, semua folder). */
export function pruneExpired(email, nowEpoch = Math.floor(Date.now() / 1000)) {
  const map = loadSnoozes(email);
  let changed = false;
  for (const [folderId, folderMap] of Object.entries(map)) {
    if (!folderMap || typeof folderMap !== 'object') continue;
    for (const [uid, wake] of Object.entries(folderMap)) {
      if (Number(wake) <= nowEpoch) {
        delete folderMap[uid];
        changed = true;
      }
    }
    if (Object.keys(folderMap).length === 0) {
      delete map[folderId];
      changed = true;
    }
  }
  if (changed) save(email, map);
  return Object.keys(map).length;
}
