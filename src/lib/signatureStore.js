/**
 * Model signature yang disimpan di SERVER (SOGo user defaults, key
 * `PCPWebmailSignatures`) — fungsi murni, tanpa jaringan/localStorage.
 * Dipakai api.js (simpan/baca server) dan signatures.js (cache + sinkron).
 *
 * Bentuk tersimpan:
 *   { v: 1, list: [{ id, name, html }], defaults: { new: id|null, reply: id|null }, updatedAt: <ms> }
 *
 * Batas ukuran: kolom c_defaults SOGo menyimpan SELURUH preferensi user
 * (Vacation, aturan Sieve, dll) dalam satu nilai (LONGTEXT, terverifikasi di
 * skema mailcow) dan SOGo meng-cache preferensi di memcached (batas item 1 MB).
 * Signature dibatasi 384 KB total (+ salinan default di SOGoMailSignature) —
 * cukup utk signature nyata hasil tempel Outlook/Word (kasus live 2026-10-15:
 * 77 KB, 2 gambar 7+22 KB; batas awal 64 KB terlalu ketat). Gambar base64
 * (data:) diperiksa per gambar.
 */

export const SIG_PREF_KEY = 'PCPWebmailSignatures';
export const SIG_STORE_VERSION = 1;
export const MAX_SIG_STORE_BYTES = 384 * 1024;
export const MAX_SIG_IMAGE_BYTES = 200 * 1024;
export const MAX_SIG_COUNT = 50;

export const SIG_IMAGE_TOO_LARGE_MSG =
  'Gambar di signature terlalu besar; gunakan gambar ≤ 200 KB (atau tautan gambar https://).';
export const SIG_STORE_TOO_LARGE_MSG =
  'Signature terlalu besar untuk disimpan di server (maks 384 KB total). Kecilkan atau hapus gambar.';

const str = (v) => (typeof v === 'string' ? v : '');

/** Panjang byte UTF-8 (TextEncoder ada di browser & Node). */
export function byteLength(s) {
  const text = String(s ?? '');
  try { return new TextEncoder().encode(text).length; } catch { return text.length; }
}

/** Kunci dedupe: nama + html (trim). */
export function sigKey(s) {
  return `${str(s?.name).trim()}\u0000${str(s?.html).trim()}`;
}

/**
 * Normalisasi nilai server (tidak dipercaya). null bila absen/bukan object.
 * Entri tanpa id/html string dibuang; default yang menunjuk id hilang → null.
 */
export function normalizeSignatureStore(raw) {
  let value = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return null; }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const seen = new Set();
  const list = (Array.isArray(value.list) ? value.list : [])
    .filter((e) => e && typeof e === 'object' && typeof e.id === 'string' && e.id && typeof e.html === 'string')
    .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .slice(0, MAX_SIG_COUNT)
    .map((e) => ({ id: e.id, name: str(e.name).trim() || 'Tanpa Nama', html: e.html }));
  const ids = new Set(list.map((s) => s.id));
  const d = value.defaults && typeof value.defaults === 'object' ? value.defaults : {};
  const pick = (id) => (typeof id === 'string' && ids.has(id) ? id : null);
  const updatedAt = Number(value.updatedAt);
  return {
    v: SIG_STORE_VERSION,
    list,
    defaults: { new: pick(d.new), reply: pick(d.reply) },
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : 0,
  };
}

/** Ukuran (byte terdekode) tiap gambar data: base64 di html. */
export function dataImageSizes(html) {
  const out = [];
  const re = /data:image\/[a-z0-9.+-]+;base64,([a-z0-9+/=\s]+)/gi;
  let m;
  while ((m = re.exec(str(html)))) {
    const b64 = m[1].replace(/\s+/g, '');
    out.push(Math.floor((b64.length * 3) / 4));
  }
  return out;
}

/**
 * Validasi sebelum simpan ke server. Melempar Error berpesan Indonesia
 * (`code`: 'image-too-large' | 'too-large').
 */
export function validateSignatureStore(store) {
  for (const s of store?.list || []) {
    if (dataImageSizes(s.html).some((n) => n > MAX_SIG_IMAGE_BYTES)) {
      const err = new Error(SIG_IMAGE_TOO_LARGE_MSG);
      err.code = 'image-too-large';
      err.signatureName = s.name;
      throw err;
    }
  }
  if (byteLength(JSON.stringify(store)) > MAX_SIG_STORE_BYTES) {
    const err = new Error(SIG_STORE_TOO_LARGE_MSG);
    err.code = 'too-large';
    throw err;
  }
  return true;
}

/** Bentuk store server dari daftar lokal (placeholder legacy tidak ikut). */
export function storeFromLocal(localList, localDefaults, updatedAt = Date.now()) {
  const seen = new Set();
  const list = [];
  for (const s of Array.isArray(localList) ? localList : []) {
    if (!s || s.placeholder || typeof s.id !== 'string' || typeof s.html !== 'string') continue;
    const k = sigKey(s);
    if (seen.has(k)) continue;
    seen.add(k);
    list.push({ id: s.id, name: str(s.name).trim() || 'Tanpa Nama', html: s.html });
  }
  return normalizeSignatureStore({ list, defaults: localDefaults || {}, updatedAt })
    || { v: SIG_STORE_VERSION, list: [], defaults: { new: null, reply: null }, updatedAt };
}

/**
 * Gabung signature lokal (perangkat ini, sebelum fitur server) ke store
 * server — dipakai SEKALI per akun (migrasi). Union by id; entri lokal
 * dengan nama+html sama dengan entri server dilewati; placeholder dilewati.
 * Default server dipertahankan; default kosong diisi dari default lokal.
 * @returns {{ store, changed: boolean }}
 */
export function mergeSignatureStores(server, localList, localDefaults) {
  const base = normalizeSignatureStore(server) || storeFromLocal([], {}, 0);
  const list = base.list.map((s) => ({ ...s }));
  const ids = new Set(list.map((s) => s.id));
  const keys = new Set(list.map(sigKey));
  let changed = false;
  for (const s of Array.isArray(localList) ? localList : []) {
    if (!s || s.placeholder || typeof s.id !== 'string' || typeof s.html !== 'string') continue;
    if (ids.has(s.id) || keys.has(sigKey(s))) continue;
    list.push({ id: s.id, name: str(s.name).trim() || 'Tanpa Nama', html: s.html });
    ids.add(s.id);
    keys.add(sigKey(s));
    changed = true;
  }
  const defaults = { ...base.defaults };
  for (const kind of ['new', 'reply']) {
    const cand = localDefaults?.[kind];
    if (!defaults[kind] && typeof cand === 'string' && ids.has(cand)) {
      defaults[kind] = cand;
      changed = true;
    }
  }
  return { store: { ...base, list: list.slice(0, MAX_SIG_COUNT), defaults }, changed };
}

/** HTML signature default "pesan baru" — untuk mirror SOGoMailSignature. */
export function defaultNewHtml(store) {
  const id = store?.defaults?.new;
  const sig = (store?.list || []).find((s) => s.id === id);
  return sig && typeof sig.html === 'string' ? sig.html : '';
}
