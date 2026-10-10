/**
 * Helper murni untuk ComposeModal (pola jendela compose Outlook desktop).
 * Tanpa dependency DOM/React — diuji langsung di Node lewat
 * scripts/test-compose-utils.mjs.
 *
 * Isi:
 *   - mode compose (new/reply/replyAll/forward/draft) → judul, aria-label,
 *     mode signature, flag "reply-like" utk posisi caret
 *   - pengingat lampiran (teks menyebut lampiran tapi tidak ada file)
 *   - parsing/validasi/dedup chip penerima (sadar tanda kutip & <>)
 *   - format tanggal lokal utk <input type="datetime-local"> + label jadwal
 *   - format countdown undo-send
 *   - snapshot initialData utk membuka ulang compose setelah "Urungkan"
 */

import { isSafeRecipient, recipientAddress } from './emailValidation.js';

// ─── Mode compose ─────────────────────────────────────────────────────────────

export const COMPOSE_MODES = ['new', 'reply', 'replyAll', 'forward', 'draft'];

const MODE_TITLES = {
  new: 'Pesan Baru',
  reply: 'Balas',
  replyAll: 'Balas Semua',
  forward: 'Teruskan',
  draft: 'Ubah Draf',
};

const MODE_ARIA = {
  new: 'Tulis pesan baru',
  reply: 'Balas pesan',
  replyAll: 'Balas semua',
  forward: 'Teruskan pesan',
  draft: 'Ubah draf',
};

/** Normalisasi nilai composeMode dari initialData (nilai asing → 'new'). */
export function normalizeComposeMode(mode) {
  return COMPOSE_MODES.includes(mode) ? mode : 'new';
}

/**
 * Reply-like = balasan (reply/replyAll): caret mengikuti preferensi posisi
 * balasan (SOGoMailReplyPlacement). Forward BUKAN reply-like — catatan
 * pengantar selalu di atas blok pesan yang diteruskan.
 */
export function isReplyLikeMode(mode) {
  const m = normalizeComposeMode(mode);
  return m === 'reply' || m === 'replyAll';
}

/**
 * Mode signature (getSignatureFor): balasan & teruskan memakai signature
 * 'reply', lainnya 'new'. Draf tidak disuntik ulang (ditangani pemanggil).
 */
export function signatureModeFor(mode) {
  const m = normalizeComposeMode(mode);
  return m === 'reply' || m === 'replyAll' || m === 'forward' ? 'reply' : 'new';
}

/** Judul header per mode ("Pesan Baru", "Balas", "Balas Semua", ...). */
export function composeTitle(mode) {
  return MODE_TITLES[normalizeComposeMode(mode)];
}

/** Judul jendela = judul mode + subjek (bila ada) — dipakai header & bar minimize. */
export function composeWindowTitle(mode, subject = '') {
  const title = composeTitle(mode);
  const s = String(subject || '').trim();
  return s ? `${title} — ${s}` : title;
}

/** aria-label dialog per mode (bahasa Indonesia). */
export function composeAriaLabel(mode, subject = '') {
  const base = MODE_ARIA[normalizeComposeMode(mode)];
  const s = String(subject || '').trim();
  return s ? `${base}: ${s}` : base;
}

// ─── Pengingat lampiran ───────────────────────────────────────────────────────

// Kata kunci ID + EN yang lazim dipakai saat menyebut lampiran.
const ATTACH_WORDS_RE = /\b(lampiran|terlampir|dilampirkan|melampirkan|lampirkan|attached|attachment|attachments|attaching|enclosed)\b/i;

/** Buang blok kutipan (reply/forward) + tag HTML → teks polos yang ditulis user. */
export function stripQuotedHtml(html) {
  return String(html || '')
    // Blockquote bersarang: ulangi sampai tidak ada lagi.
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, ' ')
    .replace(/<blockquote[\s\S]*$/i, ' ') // blockquote tanpa penutup
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True bila teks (subjek/body) menyebut lampiran. */
export function mentionsAttachment(text) {
  return ATTACH_WORDS_RE.test(String(text || ''));
}

/**
 * Perlu pengingat "kirim tanpa lampiran?" — teks user (bukan kutipan)
 * menyebut lampiran tapi daftar lampiran kosong.
 */
export function needsAttachmentReminder({ subject = '', body = '', attachments = [] } = {}) {
  if (Array.isArray(attachments) && attachments.length > 0) return false;
  return mentionsAttachment(subject) || mentionsAttachment(stripQuotedHtml(body));
}

// ─── Penerima (chip) ──────────────────────────────────────────────────────────

/**
 * Pecah teks penerima jadi entri: pemisah koma / titik koma / baris baru,
 * TAPI koma di dalam tanda kutip atau <> tidak memecah
 * ("Doe, John" <j@x.com> tetap satu entri).
 */
export function splitRecipients(text) {
  const s = String(text || '');
  const out = [];
  let cur = '';
  let inQuote = false;
  let inAngle = false;
  for (const ch of s) {
    if (ch === '"' && !inAngle) { inQuote = !inQuote; cur += ch; continue; }
    if (ch === '<' && !inQuote) { inAngle = true; cur += ch; continue; }
    if (ch === '>' && !inQuote) { inAngle = false; cur += ch; continue; }
    if ((ch === ',' || ch === ';' || ch === '\n' || ch === '\r') && !inQuote && !inAngle) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  // Beberapa alamat polos dipisah spasi saja ("a@x.com b@y.com") → pecah juga.
  const expanded = [];
  for (const item of out) {
    if (!item.includes('<') && !item.includes('"') && /\s/.test(item) && item.split(/\s+/).every((p) => p.includes('@'))) {
      expanded.push(...item.split(/\s+/));
    } else {
      expanded.push(item);
    }
  }
  return expanded;
}

/** Gabungkan daftar entri jadi nilai field (dipisah ", "). */
export function joinRecipients(list) {
  return (list || []).map((s) => String(s || '').trim()).filter(Boolean).join(', ');
}

// Pengecekan sisi klien lebih ketat dari server (domain wajib ber-titik,
// local-part tanpa karakter aneh). Server (emailValidation.isSafeRecipient)
// tetap sumber kebenaran keamanan; ini hanya umpan balik dini di UI.
const CLIENT_EMAIL_RE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

/**
 * Parse satu entri penerima → { raw, name, email, valid, error }.
 * name = nama tampilan (tanpa kutip), email lowercase.
 */
export function parseRecipientChip(raw) {
  const s = String(raw || '').trim();
  const chip = { raw: s, name: '', email: '', valid: false, error: '' };
  if (!s) { chip.error = 'Alamat kosong.'; return chip; }
  if (!isSafeRecipient(s)) {
    chip.email = recipientAddress(s);
    chip.error = s.includes('@')
      ? `"${s}" bukan alamat email yang valid. Gunakan format nama@domain.com.`
      : `"${s}" tidak memiliki @ — gunakan format nama@domain.com.`;
    return chip;
  }
  const email = recipientAddress(s);
  const open = s.lastIndexOf('<');
  if (open >= 0 && s.endsWith('>')) {
    chip.name = s.slice(0, open).trim().replace(/^"|"$/g, '').replace(/\s+/g, ' ').trim();
  }
  chip.email = email;
  if (!CLIENT_EMAIL_RE.test(email)) {
    chip.error = `"${email}" bukan alamat email yang valid. Gunakan format nama@domain.com.`;
    return chip;
  }
  chip.valid = true;
  return chip;
}

/** Dedup daftar entri penerima berdasarkan alamat (case-insensitive); yang pertama menang. */
export function dedupeRecipients(list) {
  const seen = new Set();
  const out = [];
  for (const item of list || []) {
    const raw = String(item || '').trim();
    if (!raw) continue;
    const key = recipientAddress(raw) || raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(raw);
  }
  return out;
}

/**
 * Tambah entri baru (teks ketik/tempel/pilih saran) ke daftar yang ada:
 * pecah, dedup terhadap yang sudah ada (case-insensitive), hasil = daftar baru.
 */
export function addRecipients(existing, input) {
  return dedupeRecipients([...(existing || []), ...splitRecipients(input)]);
}

/** True bila teks tempel berisi lebih dari satu penerima (perlu dipecah jadi chip). */
export function looksLikeRecipientList(text) {
  return splitRecipients(text).length > 1;
}

/**
 * Entri pertama yang tidak valid dalam nilai field (string dipisah koma)
 * → { raw, error } | null. Dipakai utk blokir kirim dengan pesan jelas.
 */
export function firstInvalidChip(value) {
  for (const raw of splitRecipients(value)) {
    const chip = parseRecipientChip(raw);
    if (!chip.valid) return { raw: chip.raw, error: chip.error };
  }
  return null;
}

// ─── Tanggal & waktu lokal ────────────────────────────────────────────────────

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * Format Date → "YYYY-MM-DDTHH:mm" dalam zona waktu LOKAL — nilai yang benar
 * utk <input type="datetime-local">. (toISOString() memberi UTC → jam
 * bergeser sejauh offset zona; bug lama compose.)
 */
export function formatLocalDateTimeInput(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Nilai input datetime-local (lokal) → ISO string UTC; kosong/invalid → ''. */
export function parseLocalDateTimeInput(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(value || ''));
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), 0, 0);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

const DAY_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MONTH_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * Label jadwal (tanggal + jam, lokal): "hari ini 18:00", "besok 08:00",
 * "Sen, 12 Okt 08:00" (+ tahun bila beda tahun). now di-inject utk tes.
 */
export function formatScheduleLabel(when, now = new Date()) {
  const d = when instanceof Date ? when : new Date(when);
  if (Number.isNaN(d.getTime())) return '';
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const n = now instanceof Date ? now : new Date(now);
  if (sameDay(d, n)) return `hari ini ${time}`;
  const tomorrow = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1);
  if (sameDay(d, tomorrow)) return `besok ${time}`;
  const year = d.getFullYear() !== n.getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${DAY_ID[d.getDay()]}, ${d.getDate()} ${MONTH_ID[d.getMonth()]}${year} ${time}`;
}

/**
 * Countdown undo-send: "0:45", "2:05"; di atas 60 menit tampil jam
 * "1:05:30" supaya tidak jadi "75:30" yang membingungkan.
 */
export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(Number(ms) / 1000 || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${pad2(m)}:${pad2(s)}`;
  return `${m}:${pad2(s)}`;
}

// ─── Snapshot utk "Urungkan" ──────────────────────────────────────────────────

/**
 * Bangun initialData lengkap dari state compose saat ini — dipakai onReopen
 * setelah user mengurungkan kiriman, supaya pesan kembali utuh (termasuk
 * lampiran & header threading).
 */
export function buildReopenSnapshot(state = {}) {
  const atts = Array.isArray(state.attachments) ? state.attachments : [];
  return {
    composeMode: normalizeComposeMode(state.composeMode),
    to: String(state.to || ''),
    cc: String(state.cc || ''),
    bcc: String(state.bcc || ''),
    subject: String(state.subject || ''),
    body: String(state.body || ''),
    attachments: atts.map((a) => ({
      name: a.name || 'attachment',
      type: a.type || a.contentType || 'application/octet-stream',
      size: a.size || 0,
      data: a.data || '',
    })),
    inReplyTo: state.inReplyTo || '',
    references: state.references || '',
    sourceFolder: state.sourceFolder || '',
    sourceUid: state.sourceUid || '',
    editorMode: state.editorMode || 'rich',
    ...(state.sendAt ? { sendAt: state.sendAt } : {}),
  };
}
