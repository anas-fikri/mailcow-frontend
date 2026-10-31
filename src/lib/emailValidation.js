/**
 * Validasi email/recipient untuk SMTP proxy (pure, tanpa dependency Node).
 * Diuji via scripts/test-email-validation.mjs.
 *
 * Poin keamanan utama: tolak SEMUA karakter kontrol (CR, LF, tab, NUL, dll),
 * bukan hanya CRLF — mencegah header injection lewat field alamat/subjek.
 */

// Semua karakter kontrol (0x00–0x1F + DEL).
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** True bila value adalah alamat email tunggal yang aman (tanpa kontrol/spasi/<>). */
export function isSafeEmail(value) {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > 254) return false;
  if (CONTROL_CHARS.test(value)) return false;
  const at = value.indexOf('@');
  if (at <= 0 || at !== value.lastIndexOf('@') || at === value.length - 1) return false;
  return !value.includes(' ') && !value.includes('<') && !value.includes('>');
}

/** True bila value adalah recipient aman (alamat polos atau "Nama <a@b.com>"). */
export function isSafeRecipient(value) {
  if (typeof value !== 'string' || CONTROL_CHARS.test(value)) return false;
  const trimmed = value.trim();
  const open = trimmed.lastIndexOf('<');
  if (open >= 0 && trimmed.endsWith('>')) return isSafeEmail(trimmed.slice(open + 1, -1));
  return isSafeEmail(trimmed);
}

/** Ekstrak alamat email dari recipient (utk perbandingan from vs session). */
export function recipientAddress(value) {
  const trimmed = String(value || '').trim();
  const open = trimmed.lastIndexOf('<');
  return (open >= 0 && trimmed.endsWith('>')
    ? trimmed.slice(open + 1, -1)
    : trimmed).trim().toLowerCase();
}

/** True bila daftar recipient (dipisah koma) kosong ATAU semua elemen aman. */
export function validateRecipientList(value) {
  if (!value) return true;
  const recipients = value.split(',').map((item) => item.trim()).filter(Boolean);
  return recipients.length > 0 && recipients.every(isSafeRecipient);
}

/**
 * Kembalikan entri pertama yang TIDAK valid dalam daftar recipient
 * (dipisah koma), atau null bila kosong/semua valid. Dipakai UI compose
 * untuk pesan error per-field yang jelas (bukan hanya boelan true/false).
 */
export function firstInvalidRecipient(value) {
  if (!value) return null;
  const recipients = value.split(',').map((item) => item.trim()).filter(Boolean);
  for (const item of recipients) {
    if (!isSafeRecipient(item)) return item;
  }
  return null;
}

/** True bila string mengandung karakter kontrol (dipakai utk validasi subject). */
export function hasControlChars(value) {
  return typeof value === 'string' && CONTROL_CHARS.test(value);
}
