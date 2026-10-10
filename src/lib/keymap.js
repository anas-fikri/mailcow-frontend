// Peta pintasan keyboard daftar pesan (ala Outlook desktop) — murni, tanpa DOM.
// MailPage memanggil resolveMailShortcut(event, ctx) lalu menjalankan aksi
// yang dikembalikan. Semua keputusan "siapa yang menangani tombol ini"
// terpusat di sini supaya bisa diuji di Node.
//
// Kepemilikan tombol (kontrak dgn MessageReader):
// - Reader (saat terbuka, TANPA ctrl/meta/alt, dan tidak ada seleksi multi):
//   r, Shift+R, f, s, u, Delete, Esc, serta Ctrl/Cmd+, dan Ctrl/Cmd+. (prev/next).
// - Selebihnya milik MailPage.
import { READER_OWNED_KEYS } from './constants.js';

// Tombol polos yang diserahkan ke reader saat reader terbuka.
export const READER_PLAIN_KEYS = new Set([...READER_OWNED_KEYS, 'u', 'delete']);

/** Nama aksi yang bisa dikembalikan (dipakai MailPage utk switch). */
export const MAIL_ACTIONS = {
  HELP: 'help',
  ESCAPE: 'escape',
  BLUR_INPUT: 'blurInput',
  CLOSE_MODAL: 'closeModal',
  FOCUS_SEARCH: 'focusSearch',
  COMPOSE: 'compose',
  SELECT_ALL: 'selectAll',
  MOVE_FOCUS: 'moveFocus',
  OPEN: 'open',
  DELETE: 'delete',
  MARK_READ: 'markRead',
  MARK_UNREAD: 'markUnread',
  TOGGLE_FLAG: 'toggleFlag',
  ARCHIVE: 'archive',
  SPAM_TOGGLE: 'spamToggle',
  MOVE_PICKER: 'movePicker',
  REPLY: 'reply',
  REPLY_ALL: 'replyAll',
  FORWARD: 'forward',
  UNDO: 'undo',
};

const A = MAIL_ACTIONS;
const act = (action, extra) => (extra ? { action, ...extra } : { action });

/**
 * @param {object} ev   mirip KeyboardEvent: { key, ctrlKey, metaKey, shiftKey, altKey }
 * @param {object} ctx
 *   inInput      : fokus sedang di input/textarea/contenteditable
 *   modalOpen    : ada modal/menu yang menutupi (compose, help, dialog, menu konteks, picker)
 *   readerOpen   : reader sedang menampilkan pesan
 *   hasSelection : selectedUids.length > 0 (seleksi multi)
 *   hasTarget    : ada pesan fokus/terbuka/terpilih utk dikenai aksi
 *   listLength   : jumlah baris tampil
 * @returns {null | { action: string, step?: number|'home'|'end' }}
 */
export function resolveMailShortcut(ev, ctx = {}) {
  if (!ev || typeof ev.key !== 'string') return null;
  const key = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key.toLowerCase();
  const mod = !!(ev.ctrlKey || ev.metaKey);
  const alt = !!ev.altKey;
  const shift = !!ev.shiftKey;

  // ── Sedang mengetik di input ─────────────────────────────────────────────
  if (ctx.inInput) {
    if (mod && !alt && (key === '/' || key === 'e')) return act(A.FOCUS_SEARCH);
    if (!mod && !alt && key === 'escape') return act(A.BLUR_INPUT);
    return null;
  }

  // ── Modal/menu di atas daftar → bungkam semua kecuali Escape ─────────────
  if (ctx.modalOpen) {
    return !mod && !alt && key === 'escape' ? act(A.CLOSE_MODAL) : null;
  }

  if (alt) return null; // kombinasi Alt = milik OS/browser

  const hasTarget = !!ctx.hasTarget;

  // ── Kombinasi Ctrl/Cmd (eksplisit; selebihnya diserahkan ke browser) ─────
  if (mod) {
    if (key === ',' || key === '.') return null; // prev/next milik reader
    switch (key) {
      case 'a': return shift ? null : act(A.SELECT_ALL);
      case 'q': return act(A.MARK_READ);
      case 'u': return act(A.MARK_UNREAD);
      case 'e': return act(A.FOCUS_SEARCH);
      case 'n': return act(A.COMPOSE);
      case 'z': return shift ? null : act(A.UNDO);
      case 'r': return hasTarget ? act(shift ? A.REPLY_ALL : A.REPLY) : null;
      case 'f': return hasTarget && !shift ? act(A.FORWARD) : null;
      case 'v': return shift && hasTarget ? act(A.MOVE_PICKER) : null;
      case 'g': return shift && hasTarget ? act(A.TOGGLE_FLAG) : null;
      default: return null;
    }
  }

  // ── Tombol polos ─────────────────────────────────────────────────────────
  if (key === '?') return act(A.HELP);
  if (key === 'escape') return act(A.ESCAPE);

  const readerOwned = !!ctx.readerOpen && !ctx.hasSelection;
  if (readerOwned && READER_PLAIN_KEYS.has(key)) return null;

  const listLength = Number(ctx.listLength) || 0;
  switch (key) {
    case 'j':
    case 'arrowdown': return listLength > 0 ? act(A.MOVE_FOCUS, { step: 1 }) : null;
    case 'k':
    case 'arrowup': return listLength > 0 ? act(A.MOVE_FOCUS, { step: -1 }) : null;
    case 'home': return listLength > 0 ? act(A.MOVE_FOCUS, { step: 'home' }) : null;
    case 'end': return listLength > 0 ? act(A.MOVE_FOCUS, { step: 'end' }) : null;
    case 'o':
    case 'enter': return hasTarget ? act(A.OPEN) : null;
    case '/': return act(A.FOCUS_SEARCH);
    case 'c': return act(A.COMPOSE);
    case 'a': return act(A.SELECT_ALL);
    default: break;
  }

  if (!hasTarget) return null;
  switch (key) {
    case 's': return act(A.TOGGLE_FLAG);
    case 'e': return act(A.ARCHIVE);
    case 'u': return act(A.MARK_UNREAD);
    case 'x': return act(A.MARK_READ);
    case 'd':
    case '#':
    case 'delete':
    case 'backspace': return act(A.DELETE);
    case '!': return act(A.SPAM_TOGGLE);
    case 'm': return act(A.MOVE_PICKER);
    case 'r': return act(shift ? A.REPLY_ALL : A.REPLY);
    case 'f': return act(A.FORWARD);
    default: return null;
  }
}

/** Daftar pintasan utk modal bantuan — dikelompokkan ala Outlook. */
export const SHORTCUT_GROUPS = [
  {
    title: 'Navigasi',
    shortcuts: [
      { keys: ['↓', 'j'], desc: 'Pesan berikutnya (dibuka di panel baca)' },
      { keys: ['↑', 'k'], desc: 'Pesan sebelumnya' },
      { keys: ['Home', 'End'], desc: 'Pesan pertama / terakhir' },
      { keys: ['Enter', 'o'], desc: 'Buka pesan' },
      { keys: ['Ctrl+,', 'Ctrl+.'], desc: 'Pesan sebelumnya / berikutnya di reader' },
      { keys: ['Escape'], desc: 'Tutup reader / batal pilih / bersihkan pencarian' },
    ],
  },
  {
    title: 'Seleksi',
    shortcuts: [
      { keys: ['Klik'], desc: 'Pilih & buka' },
      { keys: ['Ctrl+Klik'], desc: 'Tambah/lepas dari seleksi' },
      { keys: ['Shift+Klik'], desc: 'Pilih rentang' },
      { keys: ['Ctrl+A', 'a'], desc: 'Pilih semua yang tampil / batal' },
      { keys: ['Klik kanan'], desc: 'Menu konteks' },
    ],
  },
  {
    title: 'Balas & Tulis',
    shortcuts: [
      { keys: ['Ctrl+R', 'r'], desc: 'Balas' },
      { keys: ['Ctrl+Shift+R', 'Shift+R'], desc: 'Balas semua' },
      { keys: ['Ctrl+F', 'f'], desc: 'Teruskan' },
      { keys: ['Ctrl+N', 'c'], desc: 'Tulis pesan baru' },
    ],
  },
  {
    title: 'Tandai',
    shortcuts: [
      { keys: ['Ctrl+Q', 'x'], desc: 'Tandai dibaca' },
      { keys: ['Ctrl+U', 'u'], desc: 'Tandai belum dibaca' },
      { keys: ['Ctrl+Shift+G', 's'], desc: 'Bendera / batal bendera' },
    ],
  },
  {
    title: 'Pindahkan & Hapus',
    shortcuts: [
      { keys: ['Delete', 'd', '#'], desc: 'Hapus (bisa diurungkan 6 detik)' },
      { keys: ['e'], desc: 'Arsipkan' },
      { keys: ['Ctrl+Shift+V', 'm'], desc: 'Pindahkan ke folder…' },
      { keys: ['!'], desc: 'Laporkan spam / bukan spam' },
      { keys: ['Ctrl+Z'], desc: 'Urungkan aksi terakhir' },
    ],
  },
  {
    title: 'Lainnya',
    shortcuts: [
      { keys: ['Ctrl+E', '/'], desc: 'Fokus ke pencarian' },
      { keys: ['?'], desc: 'Tampilkan bantuan ini' },
    ],
  },
];
