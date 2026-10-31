// ─── Lampiran validation helpers (pure — testable di Node) ────────────────────
// Dipakai oleh /api/send (server.js) sebelum diteruskan ke Nodemailer.
// Data lampiran dikirim sebagai base64 dari browser (tanpa prefix data URI).
//
// Batas bisa di-override via env di server.js (SMTP_MAX_ATTACHMENT_MB,
// SMTP_MAX_TOTAL_MB, SMTP_MAX_ATTACHMENTS) — server.js menghitung nilai
// base64 di sini saat start. Default: 20 MB/file, 60 MB total, 10 file.

export const MAX_ATTACHMENTS_DEFAULT = 10;        // jumlah maksimal file per email
export const MAX_FILE_MB_DEFAULT = 20;            // MB biner per file (base64 +33%)
export const MAX_TOTAL_MB_DEFAULT = 60;           // MB biner total (base64 +33%)

export const MAX_ATTACHMENTS = MAX_ATTACHMENTS_DEFAULT;
export const MAX_FILE_BASE64 = MAX_FILE_MB_DEFAULT * 1024 * 1024 * 4 / 3 + 1024;      // ≈ 20 MB biner
export const MAX_TOTAL_BASE64 = MAX_TOTAL_MB_DEFAULT * 1024 * 1024 * 4 / 3 + 2048;    // ≈ 60 MB biner

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

/**
 * Validasi satu attachment. Batas file/total dapat di-override per-panggilan
 * (server.js membaca env saat start; test memakai nilai default).
 * Return { ok: true, sanitized } atau { ok: false, error }.
 */
export function validateAttachment(att, index = 0, limits = {}) {
  const maxFileBase64 = limits.maxFileBase64 || MAX_FILE_BASE64;
  const maxFileMB = limits.maxFileMB || MAX_FILE_MB_DEFAULT;
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
  if (data.length > maxFileBase64) {
    return { ok: false, error: `Lampiran #${index + 1} (${filename}) melebihi ${maxFileMB} MB.` };
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
 * @param {Array} list daftar lampiran
 * @param {object} [limits] { maxAttachments, maxFileBase64, maxFileMB, maxTotalBase64, maxTotalMB }
 * @returns {{ ok: true, sanitized: Array } | { ok: false, error: string }}
 */
export function validateAttachments(list, limits = {}) {
  if (!Array.isArray(list) || list.length === 0) return { ok: true, sanitized: [] };
  const maxAttachments = limits.maxAttachments || MAX_ATTACHMENTS;
  const maxTotalBase64 = limits.maxTotalBase64 || MAX_TOTAL_BASE64;
  const maxTotalMB = limits.maxTotalMB || MAX_TOTAL_MB_DEFAULT;
  if (list.length > maxAttachments) {
    return { ok: false, error: `Maksimal ${maxAttachments} lampiran per email.` };
  }

  const sanitized = [];
  let total = 0;
  for (let i = 0; i < list.length; i++) {
    const res = validateAttachment(list[i], i, limits);
    if (!res.ok) return res;
    sanitized.push(res.sanitized);
    total += res.sanitized.data.length;
    if (total > maxTotalBase64) {
      return { ok: false, error: `Total ukuran lampiran melebihi ${maxTotalMB} MB.` };
    }
  }
  return { ok: true, sanitized };
}
