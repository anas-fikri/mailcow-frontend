/**
 * Multi-signature per-akun (pola Outlook) — disimpan di localStorage.
 *
 * Setiap akun punya daftar signature bernama. Satu dipilih sebagai default
 * utk email baru, satu lagi (opsional) utk balasan/forward.
 *
 * Storage key: `pcp_signatures_v2_<email>` → { list: [{id,name,html}], defaults: { new: id, reply: id } }
 * (v1 legacy: `pcp_signatures_<email>` — dimigrasi sekali-jalan ke v2).
 *
 * Kompatibel dgn userPrefs.js — localStorage per email, tidak ter-reset saat
 * logout. Signature tidak pernah disinkronkan ke server; hanya dipakai app ini
 * saat compose (inject HTML ke editor).
 */

import {
  readStorage,
  persistNormalized,
} from './storageMigrate.js';

const normalizeEmail = (email) => typeof email === 'string' ? email.trim().toLowerCase() : '';
const BASE_KEY = 'pcp_signatures';

// Placeholder utk entri signature legacy (versi sebelum fitur multi-signature
// menyimpan { id, name } tanpa field html). Migrasi sekali-jalan di
// loadSignatures mengisinya agar tidak tampil kosong/aneh di daftar, lalu
// menulis balik ke localStorage + menandai `placeholder: true` agar:
//   - tidak diulang (idempotent),
//   - tidak ikut disuntik ke email baru/balasan (lihat ComposeModal/MessageReader).
export const LEGACY_PLACEHOLDER = '<p>Ketik signature Anda di sini…</p>';

let _idCounter = 0;
export function createSigId() {
  _idCounter += 1;
  return `sig_${Date.now().toString(36)}_${_idCounter}_${Math.random().toString(36).slice(2, 7)}`;
}

export function loadSignatures(email) {
  if (!normalizeEmail(email)) return { list: [], defaults: { new: null, reply: null } };
  const { value: parsed, key: targetKey, version, fromLegacy } = readStorage(BASE_KEY, normalizeEmail(email));
  if (parsed == null) {
    // Data lama di key v1 tetap dibaca via readStorage; bila tidak ada sama
    // sekali, key v2 tidak perlu dibuat.
    return { list: [], defaults: { new: null, reply: null } };
  }
  // Normalisasi tiap entri: entri legacy (sebelum fitur multi-signature) bisa
  // berbentuk { id, name } tanpa html, atau id non-string. Pastikan semua
  // consumer (PreferencesPage, ComposeModal) selalu menerima
  // { id, name, html } ber-string — mencegah crash sig.html.length.
  //
  // Migrasi SEKALI-JALAN: entri legacy tanpa field html diberi placeholder
  // + flag `placeholder: true`, lalu ditulis balik ke localStorage agar tidak
  // diulang pada baca berikutnya (idempotent) dan tidak disuntik ke email.
  let migrated = false;
  const list = (Array.isArray(parsed?.list) ? parsed.list : [])
    .filter((e) => e && typeof e === 'object' && typeof e.id === 'string')
    .map((e) => {
      const name = typeof e.name === 'string' ? e.name : 'Tanpa Nama';
      if (typeof e.html !== 'string') {
        migrated = true;
        return { id: e.id, name, html: LEGACY_PLACEHOLDER, placeholder: true };
      }
      const out = { id: e.id, name, html: e.html };
      if (e.placeholder) out.placeholder = true;
      return out;
    });
  const defaults = parsed?.defaults && typeof parsed.defaults === 'object' ? parsed.defaults : {};
  const normalizedDefaults = {
    new: defaults.new || null,
    reply: defaults.reply || null,
  };
  const normalized = { list, defaults: normalizedDefaults };
  // Persist hasil migrasi (sekali jalan): tulis ke key terbaru (v2), lalu
  // hapus key sumber bila data berasal dari versi lama (v1) — hanya bila
  // tulis sukses (quota → key v1 dipertahankan utk migrasi ulang). Idempotent:
  // data valid di v2 tidak ditulis ulang.
  persistNormalized(BASE_KEY, normalizeEmail(email), parsed, normalized, { fromLegacy, key: targetKey, version });
  return {
    list,
    defaults: normalizedDefaults,
  };
}

function save(email, data) {
  if (!normalizeEmail(email)) return;
  try {
    localStorage.setItem(`pcp_signatures_v2_${normalizeEmail(email)}`, JSON.stringify(data));
  } catch { /* quota — silent */ }
}

/** Tambah signature baru; bila belum ada default utk "new", jadikan default. */
export function addSignature(email, name, html) {
  const data = loadSignatures(email);
  const sig = { id: createSigId(), name: String(name || '').trim() || 'Tanpa Nama', html: String(html || '') };
  data.list.push(sig);
  if (!data.defaults.new) data.defaults.new = sig.id;
  if (!data.defaults.reply) data.defaults.reply = sig.id;
  save(email, data);
  return sig;
}

export function updateSignature(email, id, patch) {
  const data = loadSignatures(email);
  const idx = data.list.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  data.list[idx] = { ...data.list[idx], ...patch };
  // User menyetel html secara eksplisit → bukan lagi placeholder legacy.
  if ('html' in patch) delete data.list[idx].placeholder;
  save(email, data);
  return data.list[idx];
}

export function removeSignature(email, id) {
  const data = loadSignatures(email);
  data.list = data.list.filter((s) => s.id !== id);
  if (data.defaults.new === id) data.defaults.new = data.list[0]?.id || null;
  if (data.defaults.reply === id) data.defaults.reply = data.list[0]?.id || null;
  save(email, data);
  return data;
}

export function setDefaultSignature(email, kind, id) {
  const data = loadSignatures(email);
  if (kind !== 'new' && kind !== 'reply') return data;
  data.defaults[kind] = id || null;
  save(email, data);
  return data;
}

/**
 * Ambil signature yang dipakai untuk sebuah mode compose.
 * @param {string} email
 * @param {'new'|'reply'} kind  'new' = pesan baru, 'reply' = balasan/forward
 * @returns {{id,name,html}|null}
 */
export function getSignatureFor(email, kind) {
  const data = loadSignatures(email);
  const id = kind === 'reply' ? (data.defaults.reply || data.defaults.new) : data.defaults.new;
  return data.list.find((s) => s.id === id) || null;
}

export function getSignatureById(email, id) {
  if (!id) return null;
  const data = loadSignatures(email);
  return data.list.find((s) => s.id === id) || null;
}

/** Nama utk dropdown; '' bila tidak ada signature. */
export function signatureLabel(sig) {
  return sig ? (sig.name || 'Signature') : '';
}

/**
 * Keputusan impor signature SOGo ke daftar lokal (reconcile multi-device).
 *
 * SOGoMailSignature adalah sumber BERSAMA antar perangkat (syncToSogo
 * menulisnya); perangkat lain harus bisa menariknya ke daftar lokal tanpa
 * menimpa editan lokal. Idempotent: jangan impor bila html yang sama sudah
 * ada di daftar (normalisasi trim) atau SOGo kosong — mencegah penumpukan
 * entri duplikat tiap kali halaman dibuka.
 *
 * @param {Array} list  daftar signature lokal [{id,name,html}]
 * @param {string} sogoHtml  nilai SOGoMailSignature dari prefs
 * @returns {boolean} true bila SOGo punya signature yang belum ada di lokal
 */
export function shouldImportSogoSignature(list, sogoHtml) {
  const html = String(sogoHtml || '').trim();
  if (!html) return false;
  return !(Array.isArray(list) ? list : []).some(
    (s) => typeof s?.html === 'string' && s.html.trim() === html
  );
}
