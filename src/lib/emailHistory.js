/**
 * Riwayat alamat email yang pernah dikirim (pola Gmail "people you've emailed").
 *
 * Setiap kali email berhasil TERKIRIM, seluruh penerima (to/cc/bcc) dicatat
 * per-akun di localStorage. Daftar ini dipakai autocomplete di kolom
 * Kepada/Cc/Bcc (ComposeModal) — dikombinasikan dengan kontak; yang paling
 * baru dipakai muncul lebih dulu.
 *
 * Storage: `pcp_emailHistory_v1_<email>` → [ { email, name, lastUsed } ]
 * (urut lastUsed terbaru dulu, maks MAX_ENTRIES). Email dinormalisasi
 * lowercase; semua operasi tulis dibungkus try/catch (storage penuh/private
 * mode tidak boleh membuat kirim email gagal).
 */

import { storageKey, readJSON, writeJSON } from './storageMigrate.js';
import { isSafeRecipient, recipientAddress } from './emailValidation.js';

const BASE_KEY = 'pcp_emailHistory';
const HISTORY_VERSION = 1;
const MAX_ENTRIES = 200;

const normalizeEmail = (email) => (typeof email === 'string' ? email.trim().toLowerCase() : '');

/** Baca daftar riwayat (toleran bentuk rusak — entri non-object dibuang). */
function loadList(email) {
  const raw = readJSON(storageKey(BASE_KEY, email, HISTORY_VERSION));
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const addr = typeof item.email === 'string' ? item.email.trim().toLowerCase() : '';
    if (!addr.includes('@')) continue;
    const lastUsed = Number(item.lastUsed);
    out.push({
      email: addr,
      name: typeof item.name === 'string' ? item.name.trim() : '',
      lastUsed: Number.isFinite(lastUsed) ? lastUsed : 0,
    });
  }
  // Urutkan di baca — jaga invariant recency meski data lama/rusak urutannya acak.
  out.sort((a, b) => b.lastUsed - a.lastUsed || a.email.localeCompare(b.email));
  return out;
}

function save(email, list) {
  writeJSON(storageKey(BASE_KEY, email, HISTORY_VERSION), list.slice(0, MAX_ENTRIES));
}

/**
 * Parse satu entri recipient — "Nama <a@b.com>" atau "a@b.com" →
 * { email (lowercase), name } | null. Alamat diekstrak lewat
 * emailValidation.recipientAddress (aman terhadap kontrol chars).
 */
export function parseRecipientEntry(value) {
  const s = String(value || '').trim();
  // Satu entri saja — koma berarti daftar (harus di-split dulu oleh pemanggil).
  if (!s || s.includes(',')) return null;
  // Validasi format penuh (tolak kontrol chars, spasi di alamat polos, ganda
  // '@') lalu ekstrak alamat.
  if (!isSafeRecipient(s)) return null;
  const addr = recipientAddress(s);
  if (!addr.includes('@')) return null;
  let name = '';
  const open = s.lastIndexOf('<');
  if (open >= 0 && s.endsWith('>')) {
    name = s.slice(0, open).trim().replace(/^"|"$/g, '').replace(/\s+/g, ' ');
  }
  return { email: addr, name };
}

/**
 * Catat seluruh penerima dari satu/lebih kolom recipient (tiap kolom dipisah
 * koma) sebagai riwayat terkirim. Idempotent: alamat yang sudah ada di-update
 * lastUsed + nama (bila nama lama kosong). Panggil SETELAH kirim sukses.
 */
export function recordSentRecipients(accountEmail, ...recipientFields) {
  const email = normalizeEmail(accountEmail);
  if (!email) return;
  const entries = [];
  for (const field of recipientFields) {
    for (const part of String(field || '').split(',')) {
      const parsed = parseRecipientEntry(part);
      if (parsed) entries.push(parsed);
    }
  }
  if (entries.length === 0) return;

  const now = Date.now();
  const seen = new Set();
  const byEmail = new Map();
  for (const item of loadList(email)) byEmail.set(item.email, item);
  for (const e of entries) {
    if (seen.has(e.email)) continue;
    seen.add(e.email);
    const existing = byEmail.get(e.email);
    if (existing) {
      existing.lastUsed = now;
      if (!existing.name && e.name) existing.name = e.name;
    } else {
      byEmail.set(e.email, { email: e.email, name: e.name, lastUsed: now });
    }
  }
  const merged = [...byEmail.values()].sort((a, b) => b.lastUsed - a.lastUsed);
  save(email, merged);
}

/** Ambil riwayat terkirim utk akun (terbaru dulu), opsional filter query. */
export function getEmailHistory(accountEmail, query = '', limit = 20) {
  const email = normalizeEmail(accountEmail);
  if (!email) return [];
  let list = loadList(email);
  const q = String(query || '').trim().toLowerCase();
  if (q) {
    list = list.filter(
      (it) => it.email.includes(q) || String(it.name || '').toLowerCase().includes(q)
    );
  }
  return list.slice(0, Math.max(0, limit));
}

/**
 * Saran autocomplete gabungan: kontak (diutamakan) + riwayat terkirim,
 * dedup per email (kontak menang utk nama). Skor: prefix email > prefix nama
 * > substring; tie-break kontak dulu. Minimal 2 karakter query.
 */
export function getEmailSuggestions(accountEmail, contacts, query, limit = 8) {
  const q = String(query || '').trim().toLowerCase();
  if (q.length < 2) return [];
  const byEmail = new Map();
  for (const c of contacts || []) {
    const name = c?.name || c?.c_cn || (Array.isArray(c) ? c[1] : '') || '';
    const email = String(c?.email || c?.c_mail || (Array.isArray(c) ? c[2] : '') || '')
      .trim().toLowerCase();
    if (!email.includes('@')) continue;
    if (!byEmail.has(email)) byEmail.set(email, { name, email, source: 0 });
  }
  for (const h of getEmailHistory(accountEmail)) {
    if (!byEmail.has(h.email)) byEmail.set(h.email, { name: h.name, email: h.email, source: 1 });
  }
  const scored = [];
  for (const it of byEmail.values()) {
    const nameLower = String(it.name || '').toLowerCase();
    const hay = `${nameLower} ${it.email}`;
    if (!hay.includes(q)) continue;
    let score = 0;
    if (it.email.startsWith(q)) score += 40;
    if (nameLower.startsWith(q)) score += 30;
    if (it.email.includes(q)) score += 10;
    if (nameLower.includes(q)) score += 5;
    scored.push({ ...it, score });
  }
  scored.sort((a, b) => b.score - a.score || a.source - b.source || a.email.localeCompare(b.email));
  return scored.slice(0, Math.max(1, limit)).map(({ name, email }) => ({ name, email }));
}
