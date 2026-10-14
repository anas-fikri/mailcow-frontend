// ─── Saran alamat untuk kondisi aturan (Dari / Kepada / Cc) ──────────────────
// Logika murni (tanpa React/fetch) agar bisa diuji Node.
//
// Sumber (digabung, tanpa duplikat, alamat lowercase):
//  - contacts : kontak pribadi + GAL (bentuk sama dgn yang dipakai Compose)
//  - history  : riwayat penerima yang pernah dikirimi user (emailHistory.js)
//  - seen     : alamat dari pesan yang sudah dimuat di cache daftar
//               [{ from, to, cc }] — string "Nama <a@b>, …" atau array SOGo
// Urutan menyesuaikan kolom: 'from' mendahulukan pengirim yang sering muncul;
// 'to'/'cc'/'to_or_cc' mendahulukan alamat user sendiri + penerima riwayat.
import { parseAddressList } from './format.js';

const norm = (s) => String(s || '').trim().toLowerCase();

function contactEntry(c) {
  const name = c?.name || c?.c_cn || (Array.isArray(c) ? c[1] : '') || '';
  const email = norm(c?.email || c?.c_mail || (Array.isArray(c) ? c[2] : ''));
  return email.includes('@') ? { name: String(name || ''), email } : null;
}

/**
 * @param {object} p
 * @param {'from'|'to'|'cc'|'to_or_cc'} p.field
 * @param {string} p.query        teks yang sedang diketik
 * @param {string} [p.accountEmail]
 * @param {Array}  [p.contacts]
 * @param {Array<{name,email}>} [p.history]
 * @param {Array<{from,to,cc}>} [p.seen]
 * @param {number} [p.limit=8]
 * @returns {Array<{name:string,email:string,hint:string}>}
 */
export function buildAddressSuggestions({ field, query, accountEmail = '', contacts = [], history = [], seen = [], limit = 8 }) {
  const q = norm(query);
  const me = norm(accountEmail);
  const byEmail = new Map();
  const add = (name, email, patch) => {
    const e = norm(email);
    if (!e.includes('@')) return;
    const cur = byEmail.get(e) || { name: '', email: e, contact: false, history: false, fromCount: 0, rcptCount: 0, me: e === me };
    if (name && !cur.name) cur.name = String(name);
    Object.assign(cur, typeof patch === 'function' ? patch(cur) : patch);
    byEmail.set(e, cur);
  };

  for (const c of contacts || []) { const it = contactEntry(c); if (it) add(it.name, it.email, { contact: true }); }
  for (const h of history || []) add(h?.name, h?.email, { history: true });
  for (const m of seen || []) {
    for (const a of parseAddressList(m?.from)) add(a.name, a.email, (cur) => ({ fromCount: cur.fromCount + 1 }));
    for (const a of [...parseAddressList(m?.to), ...parseAddressList(m?.cc)]) add(a.name, a.email, (cur) => ({ rcptCount: cur.rcptCount + 1 }));
  }
  if (me) add('', me, { me: true });

  const wantFrom = field === 'from';
  const scored = [];
  for (const it of byEmail.values()) {
    const nameLower = it.name.toLowerCase();
    if (q && !(`${nameLower} ${it.email}`.includes(q))) continue;
    let score = 0;
    if (q) {
      if (it.email.startsWith(q)) score += 40;
      if (nameLower.startsWith(q)) score += 30;
      if (nameLower.split(/\s+/).some((w) => w.startsWith(q))) score += 10;
    }
    if (wantFrom) {
      // Frekuensi sebagai pengirim lebih menentukan daripada status kontak.
      score += Math.min(it.fromCount, 20) * 3 + (it.contact ? 2 : 0);
      if (it.me) score -= 15; // jarang membuat aturan "dari saya sendiri"
    } else {
      score += (it.me ? 25 : 0) + (it.history ? 8 : 0) + Math.min(it.rcptCount, 20) + (it.contact ? 4 : 0);
    }
    scored.push({ ...it, score });
  }
  scored.sort((a, b) => b.score - a.score || a.email.localeCompare(b.email));
  return scored.slice(0, Math.max(1, limit)).map((it) => ({
    name: it.name,
    email: it.email,
    hint: it.me ? 'Saya' : it.contact ? 'Kontak' : it.history ? 'Pernah dikirimi' : (wantFrom ? 'Pengirim' : 'Penerima'),
  }));
}
