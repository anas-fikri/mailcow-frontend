/**
 * Multi-signature per-akun (pola Outlook) — disimpan di SERVER (preferensi
 * SOGo user, key `PCPWebmailSignatures`) sehingga sama di semua perangkat;
 * localStorage hanya CACHE agar baca tetap sinkron & cepat (ComposeModal).
 *
 * Setiap akun punya daftar signature bernama. Satu dipilih sebagai default
 * utk email baru, satu lagi (opsional) utk balasan/forward.
 *
 * Cache key: `pcp_signatures_v2_<email>` → { list: [{id,name,html}], defaults: { new: id, reply: id } }
 * (v1 legacy: `pcp_signatures_<email>` — dimigrasi sekali-jalan ke v2).
 *
 * Alur sinkron:
 *  - Tulis (add/update/remove/setDefault) → cache diperbarui seketika
 *    (optimistic) → `syncSignaturesToServer` (debounce 500 ms) menulis ke
 *    server; gagal → cache di-rollback + status 'error' (AppLayout: toast).
 *  - `refreshSignaturesFromServer(email, token)` (login/app start, buka tab
 *    Signature) memuat salinan server ke cache. Server menang bila
 *    `updatedAt`-nya ≥ salinan terakhir yang disimpan perangkat ini.
 *  - Migrasi SEKALI per akun (`pcp_sig_migrated_v1_<email>`): server kosong →
 *    unggah signature lokal; server & lokal sama-sama ada → GABUNG (union
 *    by id, dedupe nama+html), default server dipertahankan.
 *  - Aplikasi email terpisah (Outlook/Mail HP) tidak membaca preferensi SOGo.
 */

import {
  readStorage,
  persistNormalized,
  readJSON,
  writeJSON,
} from './storageMigrate.js';
import { fetchServerSignatures, saveServerSignatures } from './api.js';
import { storeFromLocal, mergeSignatureStores, validateSignatureStore, normalizeSignatureStore } from './signatureStore.js';

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
  writeLocal(email, data);
  return sig;
}

export function updateSignature(email, id, patch) {
  const data = loadSignatures(email);
  const idx = data.list.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  data.list[idx] = { ...data.list[idx], ...patch };
  // User menyetel html secara eksplisit → bukan lagi placeholder legacy.
  if ('html' in patch) delete data.list[idx].placeholder;
  writeLocal(email, data);
  return data.list[idx];
}

export function removeSignature(email, id) {
  const data = loadSignatures(email);
  data.list = data.list.filter((s) => s.id !== id);
  if (data.defaults.new === id) data.defaults.new = data.list[0]?.id || null;
  if (data.defaults.reply === id) data.defaults.reply = data.list[0]?.id || null;
  writeLocal(email, data);
  return data;
}

export function setDefaultSignature(email, kind, id) {
  const data = loadSignatures(email);
  if (kind !== 'new' && kind !== 'reply') return data;
  data.defaults[kind] = id || null;
  writeLocal(email, data);
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

/**
 * Resolve HTML signature final untuk compose: lokal menang, fallback ke
 * SOGoMailSignature. SELALU mengembalikan STRING (bisa '') — konsumen boleh
 * langsung memanggil .substring/.replace tanpa guard.
 *
 * Bug yang dicegah (regresi e6a57e6): ekspresi
 *   `(localSig?.html && !localSig?.placeholder) || sogo`
 * bernilai boolean `true` bila localSig real → `sigHtml.substring(0,80)`
 * melempar TypeError dan Modal Compose crash (white screen) untuk semua user
 * yang punya signature lokal.
 *
 * Aturan:
 * - localSig tanpa flag placeholder dan html-nya non-empty → pakai html itu.
 * - localSig placeholder / kosong / bukan string → fallback SOGo.
 * - Fallback SOGo dinormalisasi: bukan-string ATAU whitespace-only → ''.
 *
 * @param {{html?:string, placeholder?:boolean}|null} localSig
 * @param {unknown} sogoHtml  nilai prefs?.defaults?.SOGoMailSignature (tidak dipercaya)
 * @returns {string}
 */
export function resolveSignatureHtml(localSig, sogoHtml) {
  const localHtml = localSig && !localSig.placeholder ? localSig.html : null;
  if (typeof localHtml === 'string' && localHtml.trim()) return localHtml;
  return typeof sogoHtml === 'string' && sogoHtml.trim() ? sogoHtml : '';
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

// ─── Sinkron ke server ────────────────────────────────────────────────────────

const SYNC_DEBOUNCE_MS = 500;
const MIGRATED_KEY = (e) => `pcp_sig_migrated_v1_${e}`;
const META_KEY = (e) => `pcp_sig_sync_v1_${e}`;
const CACHE_KEY = (e) => `pcp_signatures_v2_${e}`;

const _tokens = new Map();      // email → sogoToken
const _states = new Map();      // email → { status, error, kind, loaded }
const _timers = new Map();      // email → timeout id
const _snapshots = new Map();   // email → isi cache sebelum batch tulis (rollback)
const _pendingPush = new Set(); // email dgn tulis lokal yang belum terkirim
const _refreshing = new Map();  // email → Promise refresh
const _localVer = new Map();    // email → counter tulis lokal
const _listeners = new Set();

const IDLE = Object.freeze({ status: 'idle', error: null, kind: null, loaded: false });

/** Status sinkron per akun: idle | loading | saving | saved | error | local. */
export function getSignatureSyncState(email) {
  return _states.get(normalizeEmail(email)) || IDLE;
}

/** Langganan perubahan status/cache — fn(email, state). Mengembalikan unsubscribe. */
export function subscribeSignatureSync(fn) {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}

function setState(email, patch) {
  const prev = _states.get(email) || IDLE;
  const next = { ...prev, ...patch };
  _states.set(email, next);
  for (const fn of [..._listeners]) {
    try { fn(email, next); } catch { /* listener rusak ≠ hentikan sinkron */ }
  }
}

/** Daftarkan token sesi utk akun (tanpa jaringan). */
export function setSignatureSyncContext(email, token) {
  const e = normalizeEmail(email);
  if (!e || !token) return;
  _tokens.set(e, token);
}

function bumpLocal(email) {
  _localVer.set(email, (_localVer.get(email) || 0) + 1);
}

function writeLocal(email, data) {
  const e = normalizeEmail(email);
  if (!e) return;
  if (!_snapshots.has(e)) {
    try { _snapshots.set(e, localStorage.getItem(CACHE_KEY(e))); } catch { _snapshots.set(e, null); }
  }
  save(e, data);
  bumpLocal(e);
  scheduleSync(e);
}

function scheduleSync(email) {
  _pendingPush.add(email);
  // Tanpa token (belum login / test) → tetap lokal; dikirim saat refresh.
  if (!_tokens.has(email)) { setState(email, { status: 'local', error: null, kind: null }); return; }
  clearTimeout(_timers.get(email));
  _timers.set(email, setTimeout(() => {
    _timers.delete(email);
    syncSignaturesToServer(email).catch(() => { /* status 'error' sudah diset */ });
  }, SYNC_DEBOUNCE_MS));
  setState(email, { status: 'saving', error: null, kind: 'save' });
}

/** Tulis cache dari store server; entri placeholder legacy lokal dipertahankan. */
function applyServerToCache(email, store) {
  const ids = new Set(store.list.map((s) => s.id));
  const placeholders = loadSignatures(email).list.filter((s) => s.placeholder && !ids.has(s.id));
  save(email, { list: [...store.list.map((s) => ({ ...s })), ...placeholders], defaults: { ...store.defaults } });
  writeJSON(META_KEY(email), { updatedAt: store.updatedAt || 0 });
}

function localStore(email) {
  const data = loadSignatures(email);
  return storeFromLocal(data.list, data.defaults, Date.now());
}

/**
 * Kirim isi cache ke server sekarang (tanpa debounce). Gagal → cache
 * dikembalikan ke kondisi sebelum batch tulis + status 'error' (dilempar ulang).
 */
export async function syncSignaturesToServer(email, token) {
  const e = normalizeEmail(email);
  if (e && token) _tokens.set(e, token);
  const tok = _tokens.get(e);
  if (!e || !tok) return null;
  clearTimeout(_timers.get(e));
  _timers.delete(e);
  const verAtSend = _localVer.get(e) || 0;
  const snapshot = _snapshots.get(e);
  const hadSnapshot = _snapshots.has(e);
  _snapshots.delete(e);
  _pendingPush.delete(e);
  setState(e, { status: 'saving', error: null, kind: 'save' });
  try {
    const saved = await saveServerSignatures(tok, e, localStore(e));
    // Tulis lokal baru selama request berjalan → cache dibiarkan; sinkron
    // berikutnya (sudah dijadwalkan) mengirim versi terbaru.
    if ((_localVer.get(e) || 0) === verAtSend) applyServerToCache(e, saved);
    else writeJSON(META_KEY(e), { updatedAt: saved.updatedAt || 0 });
    setState(e, { status: _pendingPush.has(e) ? 'saving' : 'saved', error: null, kind: 'save', loaded: true });
    return saved;
  } catch (err) {
    if (hadSnapshot && (_localVer.get(e) || 0) === verAtSend) {
      try {
        if (snapshot == null) localStorage.removeItem(CACHE_KEY(e));
        else localStorage.setItem(CACHE_KEY(e), snapshot);
      } catch { /* storage tidak tersedia */ }
      bumpLocal(e);
    }
    setState(e, { status: 'error', error: err?.message || 'Gagal menyimpan signature ke server.', kind: 'save' });
    throw err;
  }
}

/**
 * Cek ukuran SEBELUM menyimpan (UI menampilkan pesan tanpa rollback).
 * @returns {string|null} pesan error, atau null bila aman.
 */
export function checkSignatureDraft(email, { id = null, name = '', html = '' } = {}) {
  const data = loadSignatures(email);
  const list = data.list.filter((s) => s.id !== id);
  list.push({ id: id || 'draft', name: String(name || '').trim() || 'Tanpa Nama', html: String(html || '') });
  try {
    validateSignatureStore(storeFromLocal(list, data.defaults, Date.now()));
    return null;
  } catch (err) {
    return err.message;
  }
}

/**
 * Keputusan refresh (murni — diuji scripts/test-signature-sync.mjs).
 * @returns {{ action: 'none'|'apply'|'push', store?: object }}
 *  - server absen: unggah lokal (+ SOGoMailSignature lama bila belum ada) bila ada isi.
 *  - belum migrasi: gabung lokal ke server (push bila berubah, selain itu apply).
 *  - sudah migrasi: server menang bila updatedAt ≥ salinan terakhir perangkat
 *    ini; lebih lama (ditimpa klien lama / snapshot basi) → push lokal.
 */
export function planSignatureRefresh({ server, local, migrated, lastSyncedAt = 0, sogoSignature = '', newId = createSigId }) {
  const srv = normalizeSignatureStore(server);
  const list = Array.isArray(local?.list) ? local.list : [];
  const defaults = local?.defaults || {};
  const withSogoImport = (store) => {
    if (!shouldImportSogoSignature(store.list, sogoSignature)) return { store, imported: false };
    const sig = { id: newId(), name: store.list.length ? 'Signature SOGo' : 'Signature', html: String(sogoSignature) };
    const next = { ...store, list: [...store.list, sig], defaults: { ...store.defaults } };
    if (!next.defaults.new) next.defaults.new = sig.id;
    if (!next.defaults.reply) next.defaults.reply = sig.id;
    return { store: next, imported: true };
  };
  if (!srv) {
    const { store } = withSogoImport(storeFromLocal(list, defaults, Date.now()));
    return store.list.length ? { action: 'push', store } : { action: 'none' };
  }
  if (!migrated) {
    const merged = mergeSignatureStores(srv, list, defaults);
    const { store, imported } = withSogoImport(merged.store);
    return { action: merged.changed || imported ? 'push' : 'apply', store };
  }
  if ((srv.updatedAt || 0) >= (lastSyncedAt || 0)) return { action: 'apply', store: srv };
  return { action: 'push', store: storeFromLocal(list, defaults, Date.now()) };
}

/**
 * Muat salinan server ke cache (login / app start / tab Signature).
 * Tidak pernah melempar: gagal → status 'error' (kind 'load'), cache utuh.
 * @returns {Promise<object|null>} store server yang berlaku, atau null.
 */
export function refreshSignaturesFromServer(email, token) {
  const e = normalizeEmail(email);
  if (!e || !token) return Promise.resolve(null);
  _tokens.set(e, token);
  if (_refreshing.has(e)) return _refreshing.get(e);
  const run = (async () => {
    setState(e, { status: 'loading', error: null, kind: 'load' });
    const verBefore = _localVer.get(e) || 0;
    let server;
    let sogoSignature = '';
    try {
      const res = await fetchServerSignatures(e, { withDefaults: true });
      server = res.store;
      sogoSignature = res.sogoSignature;
    } catch (err) {
      setState(e, { status: 'error', error: err?.message || 'Gagal memuat signature dari server.', kind: 'load' });
      return null;
    }
    // User menulis selama fetch / ada tulis lokal yang belum terkirim → itu
    // niat terbaru: kirim, jangan timpa cache dengan salinan server.
    if ((_localVer.get(e) || 0) !== verBefore || _pendingPush.has(e)) {
      writeJSON(MIGRATED_KEY(e), 1);
      try { return await syncSignaturesToServer(e); } catch { return null; }
    }
    const decision = planSignatureRefresh({
      server,
      local: loadSignatures(e),
      migrated: readJSON(MIGRATED_KEY(e)) === 1,
      lastSyncedAt: Number(readJSON(META_KEY(e))?.updatedAt) || 0,
      sogoSignature,
    });
    if (decision.action === 'none') {
      writeJSON(MIGRATED_KEY(e), 1);
      setState(e, { status: 'idle', error: null, kind: null, loaded: true });
      return null;
    }
    if (decision.action === 'apply') {
      applyServerToCache(e, decision.store);
      writeJSON(MIGRATED_KEY(e), 1);
      setState(e, { status: 'idle', error: null, kind: null, loaded: true });
      return decision.store;
    }
    // 'push': unggah hasil migrasi/gabungan atau salinan lokal yang lebih
    // baru. Flag migrasi baru diset setelah server menerima — gagal → diulang
    // pada refresh berikutnya (union idempotent).
    try {
      const ids = new Set(decision.store.list.map((s) => s.id));
      const placeholders = loadSignatures(e).list.filter((s) => s.placeholder && !ids.has(s.id));
      save(e, { list: [...decision.store.list, ...placeholders], defaults: { ...decision.store.defaults } });
      bumpLocal(e);
      const saved = await syncSignaturesToServer(e);
      writeJSON(MIGRATED_KEY(e), 1);
      return saved;
    } catch {
      return null;
    }
  })().finally(() => { _refreshing.delete(e); });
  _refreshing.set(e, run);
  return run;
}

/** Khusus test: reset state modul sinkron. */
export function __resetSignatureSync() {
  for (const t of _timers.values()) clearTimeout(t);
  _tokens.clear(); _states.clear(); _timers.clear(); _snapshots.clear();
  _pendingPush.clear(); _refreshing.clear(); _localVer.clear(); _listeners.clear();
}
