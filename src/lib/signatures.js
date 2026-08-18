/**
 * Multi-signature per-akun (pola Outlook) — disimpan di localStorage.
 *
 * Setiap akun punya daftar signature bernama. Satu dipilih sebagai default
 * utk email baru, satu lagi (opsional) utk balasan/forward.
 *
 * Storage key: `pcp_signatures_<email>` → { list: [{id,name,html}], defaults: { new: id, reply: id } }
 *
 * Kompatibel dgn userPrefs.js — localStorage per email, tidak ter-reset saat
 * logout. Signature tidak pernah disinkronkan ke server; hanya dipakai app ini
 * saat compose (inject HTML ke editor).
 */

const normalizeEmail = (email) => typeof email === 'string' ? email.trim().toLowerCase() : '';
const LS_KEY = (email) => `pcp_signatures_${normalizeEmail(email)}`;

let _idCounter = 0;
export function createSigId() {
  _idCounter += 1;
  return `sig_${Date.now().toString(36)}_${_idCounter}_${Math.random().toString(36).slice(2, 7)}`;
}

export function loadSignatures(email) {
  if (!normalizeEmail(email)) return { list: [], defaults: { new: null, reply: null } };
  try {
    const raw = localStorage.getItem(LS_KEY(email));
    if (!raw) return { list: [], defaults: { new: null, reply: null } };
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed?.list) ? parsed.list : [];
    const defaults = parsed?.defaults && typeof parsed.defaults === 'object' ? parsed.defaults : {};
    return {
      list,
      defaults: {
        new: defaults.new || null,
        reply: defaults.reply || null,
      },
    };
  } catch {
    return { list: [], defaults: { new: null, reply: null } };
  }
}

function save(email, data) {
  if (!normalizeEmail(email)) return;
  try {
    localStorage.setItem(LS_KEY(email), JSON.stringify(data));
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
