// ─── Lampiran validation helpers (pure — testable di Node) ────────────────────
// Dipakai oleh /api/send (server.js) sebelum diteruskan ke Nodemailer.
// Data lampiran dikirim sebagai base64 dari browser (tanpa prefix data URI).

export const MAX_ATTACHMENTS = 10;            // jumlah maksimal file per email
export const MAX_FILE_BASE64 = 5_400_000;     // ≈ 4 MB biner per file (base64 +33%)
export const MAX_TOTAL_BASE64 = 24_000_000;   // ≈ 18 MB biner total (base64 +33%)

const CTRL_RE = /[\u0000-\u001f\u007f]/;
const PATH_RE = /[\\/]/;

/** Cek string base64 valid (standar + URL-safe alphabet, padding opsional). */
export function isBase64(str) {
  if (typeof str !== 'string' || str.length === 0) return false;
  return /^[A-Za-z0-9+/_-]*={0,2}$/.test(str) && str.length % 4 !== 1;
}

/** Perkiraan ukuran biner dari panjang base64 (byte). */
export function base64Length(data) {
  const pad = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  return Math.floor((data.length * 3) / 4) - pad;
}

/** Validasi satu attachment. Return { ok: true, sanitized } atau { ok: false, error }. */
export function validateAttachment(att, index = 0) {
  const filename   = typeof att?.filename === 'string' ? att.filename.trim() : '';
  const contentType = typeof att?.contentType === 'string' ? att.contentType.trim() : '';
  const data       = typeof att?.data === 'string' ? att.data : '';

  if (!filename) return { ok: false, error: `Lampiran #${index + 1}: nama file wajib diisi.` };
  if (filename.length > 255) return { ok: false, error: `Lampiran #${index + 1}: nama file terlalu panjang.` };
  if (CTRL_RE.test(filename)) return { ok: false, error: `Lampiran #${index + 1}: nama file mengandung karakter tidak valid.` };
  // Cegah traversal/path injection ke header Content-Disposition.
  if (PATH_RE.test(filename)) return { ok: false, error: `Lampiran #${index + 1}: nama file tidak boleh mengandung path.` };
  if (!contentType || contentType.length > 255 || !/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(contentType)) {
    return { ok: false, error: `Lampiran #${index + 1}: tipe konten tidak valid.` };
  }
  if (!isBase64(data)) return { ok: false, error: `Lampiran #${index + 1}: data tidak valid.` };
  if (data.length > MAX_FILE_BASE64) {
    return { ok: false, error: `Lampiran #${index + 1} (${filename}) melebihi 4 MB.` };
  }

  return {
    ok: true,
    sanitized: {
      filename,
      contentType,
      data,
      size: base64Length(data),
    },
  };
}

/**
 * Validasi daftar lampiran untuk /api/send.
 * @returns {{ ok: true, sanitized: Array } | { ok: false, error: string }}
 */
export function validateAttachments(list) {
  if (!Array.isArray(list) || list.length === 0) return { ok: true, sanitized: [] };
  if (list.length > MAX_ATTACHMENTS) {
    return { ok: false, error: `Maksimal ${MAX_ATTACHMENTS} lampiran per email.` };
  }

  const sanitized = [];
  let total = 0;
  for (let i = 0; i < list.length; i++) {
    const res = validateAttachment(list[i], i);
    if (!res.ok) return res;
    sanitized.push(res.sanitized);
    total += res.sanitized.data.length;
    if (total > MAX_TOTAL_BASE64) {
      return { ok: false, error: 'Total ukuran lampiran melebihi 18 MB.' };
    }
  }
  return { ok: true, sanitized };
}
