/**
 * Auto-capture kontak eksternal — simpan-otomatis alamat penerima eksternal
 * ke Personal Address Book setelah kirim sukses (pola Gmail "create contacts
 * for auto-complete"). Diminta user 2026-09-04: reply email masuk (dan compose
 * baru) harus otomatis meninggalkan alamat external di kontak.
 *
 * Filter kandidat (murni, tanpa I/O — mudah dites):
 *  - format alamat valid (parseRecipientEntry — "Nama <a@b>" atau "a@b")
 *  - bukan alamat akun sendiri (from)
 *  - bukan alamat layanan/no-reply/daemon (bounce, postmaster, dst —
 *    menyimpan alamat ini hanya menambah noise autocomplete)
 *  - unik per kirim (case-insensitive)
 * Dedup terhadap kontak existing (Personal + GAL — fetchContacts memuat
 * keduanya) dilakukan lewat filterKnownContacts di pemanggil (api.js).
 */

import { parseRecipientEntry } from './emailHistory.js';

/** Local part alamat layanan yang TIDAK perlu disimpan sebagai kontak. */
const SERVICE_LOCAL_RE = /^(no-?reply|donotreply|do-not-reply|no_reply|mailer-daemon|postmaster|auto-?reply|autoreply|bounce[sd]?|bounces|return-?sender|sender-?return|lists?-?(ns|nsp)|abuse)/i;

/** Normalisasi alamat akun ("Nama <a@b>" atau "a@b") → a@b lowercase. */
function accountAddress(accountEmail) {
  if (!accountEmail) return '';
  const parsed = parseRecipientEntry(accountEmail);
  return (parsed?.email || String(accountEmail).trim().toLowerCase());
}

/**
 * Satu recipient layak disimpan sebagai kontak otomatis?
 * @param {{email:string, name:string}} parsed - hasil parseRecipientEntry
 * @param {string} accountEmail - identitas pengirim (untuk skip self)
 */
export function isAutoContactCandidate(parsed, accountEmail) {
  if (!parsed?.email || !parsed.email.includes('@')) return false;
  if (accountAddress(accountEmail) === parsed.email) return false;
  const local = parsed.email.split('@')[0] || '';
  if (SERVICE_LOCAL_RE.test(local)) return false;
  return true;
}

/**
 * Ekstrak kandidat kontak dari field penerima satu kirim ({to,cc,bcc}).
 * @returns {{email:string, name:string}[]} unik, urut kemunculan
 */
export function pickExternalContacts(recipientFields, accountEmail) {
  const out = [];
  const seen = new Set();
  for (const field of [recipientFields?.to, recipientFields?.cc, recipientFields?.bcc]) {
    for (const part of String(field || '').split(',')) {
      const parsed = parseRecipientEntry(part);
      if (!parsed) continue;
      if (seen.has(parsed.email)) continue;
      if (!isAutoContactCandidate(parsed, accountEmail)) continue;
      seen.add(parsed.email);
      out.push(parsed);
    }
  }
  return out;
}

/**
 * Buang kandidat yang sudah ada di daftar kontak (Personal ATAU GAL —
 * bentuk objek = hasil parseContactRow: { email }).
 */
export function filterKnownContacts(candidates, contacts) {
  const known = new Set(
    (Array.isArray(contacts) ? contacts : [])
      .map((c) => String(c?.email || '').trim().toLowerCase())
      .filter(Boolean),
  );
  return (candidates || []).filter((c) => !known.has(c.email));
}
