// ─── Folder Icons ────────────────────────────────────────────────────────────
export const FOLDER_ICONS = {
  inbox: 'inbox',
  sent: 'sent',
  draft: 'draft',
  trash: 'trash',
  junk: 'junk',
  templates: 'templates',
  custom: 'custom',
};

export const FOLDER_TYPE_LABELS = {
  inbox: 'Kotak Masuk',
  draft: 'Draf',
  sent: 'Terkirim',
  trash: 'Sampah',
  junk: 'Junk/Spam',
  templates: 'Templates',
  folder: null, // pakai nama folder apa adanya
};

export const DEFAULT_FOLDERS = [
  { id: 'folderINBOX',  label: 'Kotak Masuk', type: 'inbox' },
  { id: 'folderSent',   label: 'Terkirim',    type: 'sent'  },
  { id: 'folderDrafts', label: 'Draf',         type: 'draft' },
  { id: 'folderTrash',  label: 'Sampah',       type: 'trash' },
  { id: 'folderJunk',   label: 'Junk/Spam',    type: 'junk'  },
];

// ─── Calendar ────────────────────────────────────────────────────────────────
export const DAYS_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
export const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

export const CAL_COLORS = [
  'bg-blue-500/20 text-blue-700 dark:text-blue-300',
  'bg-purple-500/20 text-purple-700 dark:text-purple-300',
  'bg-green-500/20 text-green-700 dark:text-green-300',
  'bg-orange-500/20 text-orange-700 dark:text-orange-300',
  'bg-pink-500/20 text-pink-700 dark:text-pink-300',
  'bg-teal-500/20 text-teal-700 dark:text-teal-300',
];

// Teks avatar putih — semua shade dipilih agar kontras ≥ 4.5:1 (WCAG AA).
// orange-500/teal-500/green-500/pink-500 + putih GAGAL AA → dinaikkan ke -600/-700.
export const AVATAR_COLORS = [
  'bg-blue-600', 'bg-purple-600', 'bg-green-700',
  'bg-orange-700', 'bg-pink-600', 'bg-teal-700',
];

// ─── Folder helpers ───────────────────────────────────────────────────────────
/** True jika folder adalah folder Terkirim/Draf — dipakai utk memilih nama & avatar yang benar. */
export function isSentOrDraftFolder(folderId, folders = []) {
  return ['folderSent', 'folderDrafts'].includes(folderId) ||
    folders.some((f) => f.id === folderId && (f.type === 'sent' || f.type === 'draft'));
}

// ─── Timeouts ─────────────────────────────────────────────────────────────────
export const TOAST_DURATION = 5000;     // 5 detik
export const UNDO_DELAY    = 6000;     // 6 detik untuk undo delete
export const STALE_TIMES = {
  FOLDERS:   5 * 60_000,  // 5 menit
  MESSAGES:  30_000,      // 30 detik
  CONTACTS:  5 * 60_000,  // 5 menit
  CALENDAR:  5 * 60_000,  // 5 menit
  PREFERENCES: 0,          // selalu fresh
  UNSEEN:    60_000,       // 1 menit (refetch interval)
};

// ─── Message field indexes ────────────────────────────────────────────────────
export const MSG_FIELD = {
  TO: 0,
  HAS_ATTACHMENT: 1,
  IS_FLAGGED: 2,
  SUBJECT: 3,
  FROM: 4,
  IS_READ: 5,
  PRIORITY: 6,
  RELATIVE_DATE: 7,
  SIZE: 8,
  FLAGS: 9,
  UID: 10,
  IS_ANSWERED: 11,
  IS_FORWARDED: 12,
};

// ─── Editor modes ─────────────────────────────────────────────────────────────
export const EDITOR_MODES = [
  { id: 'rich',  label: 'Rich Text' },
  { id: 'html',  label: 'HTML Source' },
  { id: 'plain', label: 'Teks Biasa' },
];

// ─── Keyboard ownership ───────────────────────────────────────────────────────
// Saat MessageReader terbuka (selectedMsgId set), aksi per-pesan (s=rstar,
// r=balas, f=teruskan) dimiliki MessageReader — MailPage harus SKIP supaya
// tidak double-fire (bug: 's' toggle flag 2x = net nol + 2 request).
export const READER_OWNED_KEYS = ['s', 'r', 'f'];

/** True bila shortcut per-pesan harus diserahkan ke MessageReader. */
export function isReaderOwnedShortcut(selectedMsgId, key) {
  return !!selectedMsgId && READER_OWNED_KEYS.includes(String(key || '').toLowerCase());
}
