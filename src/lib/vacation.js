// ─── Auto-reply (Vacation) — format data SOGo ─────────────────────────────────
// Logika murni (tanpa React/fetch) agar bisa diuji Node.
//
// BUG 2026-10-29: form menyimpan isi pesan ke `Vacation.text` dan subjek ke
// `Vacation.subject` — field yang TIDAK dibaca SOGo. SOGo membangkitkan skrip
// Sieve dari (terverifikasi di template UIxPreferences.wox server):
//   enabled, autoReplyText, customSubject + customSubjectEnabled,
//   daysBetweenResponse, autoReplyEmailAddresses, ignoreLists, alwaysSend,
//   startDate + startDateEnabled, endDate + endDateEnabled (epoch detik).
// Akibatnya auto-reply terkirim KOSONG dgn subjek bawaan "Auto: …", dan
// tanggal selesai tidak pernah berlaku (endDateEnabled tak di-set).

const pad = (n) => String(n).padStart(2, '0');

/** epoch detik → 'YYYY-MM-DD' waktu LOKAL ('' bila tak valid). */
export function epochToDateInput(epoch) {
  const n = parseInt(epoch, 10);
  if (!Number.isFinite(n) || n <= 0) return '';
  const d = new Date(n * 1000);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'YYYY-MM-DD' → epoch detik tengah malam LOKAL (pola SOGo: beginOfDay). */
export function dateInputToEpoch(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : Math.floor(d.getTime() / 1000);
}

const truthy = (v) => v === true || v === 1 || v === '1' || v === 'true';

/** Baca objek Vacation SOGo (termasuk data lama `text`/`subject`) → state form. */
export function readVacationForm(v) {
  const src = v && typeof v === 'object' ? v : {};
  const message = typeof src.autoReplyText === 'string' && src.autoReplyText.trim()
    ? src.autoReplyText
    : (typeof src.text === 'string' ? src.text : '');
  const subject = typeof src.customSubject === 'string' && src.customSubject.trim()
    ? src.customSubject
    : (typeof src.subject === 'string' ? src.subject : '');
  return {
    enabled: truthy(src.enabled),
    message,
    subject,
    startDate: truthy(src.startDateEnabled) || src.startDate ? epochToDateInput(src.startDate) : '',
    endDate: truthy(src.endDateEnabled) ? epochToDateInput(src.endDate) : '',
    days: parseInt(src.daysBetweenResponse, 10) > 0 ? parseInt(src.daysBetweenResponse, 10) : 7,
  };
}

/** Validasi form; [] bila valid. */
export function validateVacationForm(form) {
  const errors = [];
  if (form.enabled && !String(form.message || '').trim()) errors.push('Isi pesan auto-reply wajib diisi.');
  const s = dateInputToEpoch(form.startDate);
  const e = dateInputToEpoch(form.endDate);
  if (s !== null && e !== null && e < s) errors.push('Tanggal selesai tidak boleh sebelum tanggal mulai.');
  return errors;
}

/**
 * Susun objek Vacation untuk disimpan ke SOGo dari objek lama + form.
 * Field asing dipertahankan; field lama yang salah (`text`, `subject`) dibuang.
 */
export function buildVacationPayload(existing, form, userEmail) {
  const prev = existing && typeof existing === 'object' ? { ...existing } : {};
  delete prev.text;
  delete prev.subject;
  const out = { ...prev };
  out.enabled = form.enabled ? 1 : 0;
  out.autoReplyText = String(form.message || '');
  const subj = String(form.subject || '').trim();
  if (subj) { out.customSubjectEnabled = 1; out.customSubject = subj; } else { out.customSubjectEnabled = 0; delete out.customSubject; }
  out.daysBetweenResponse = parseInt(form.days, 10) > 0 ? parseInt(form.days, 10) : (parseInt(prev.daysBetweenResponse, 10) > 0 ? parseInt(prev.daysBetweenResponse, 10) : 7);
  const addrs = Array.isArray(prev.autoReplyEmailAddresses)
    ? prev.autoReplyEmailAddresses.filter(Boolean)
    : (typeof prev.autoReplyEmailAddresses === 'string' && prev.autoReplyEmailAddresses ? prev.autoReplyEmailAddresses.split(/, */) : []);
  out.autoReplyEmailAddresses = addrs.length ? addrs : (userEmail ? [userEmail] : []);
  if (out.ignoreLists === undefined) out.ignoreLists = 1;
  const s = dateInputToEpoch(form.startDate);
  if (s !== null) { out.startDateEnabled = 1; out.startDate = s; } else { delete out.startDateEnabled; delete out.startDate; }
  const e = dateInputToEpoch(form.endDate);
  if (e !== null) { out.endDateEnabled = 1; out.endDate = e; } else { delete out.endDateEnabled; delete out.endDate; }
  return out;
}

/** True bila data tersimpan memakai field lama dan perlu diperbaiki (auto-reply aktif tapi autoReplyText kosong). */
export function needsVacationRepair(v) {
  if (!v || typeof v !== 'object' || !truthy(v.enabled)) return false;
  const hasNew = typeof v.autoReplyText === 'string' && v.autoReplyText.trim();
  const hasOld = typeof v.text === 'string' && v.text.trim();
  return !hasNew && !!hasOld;
}
