// Registry palet perintah (Ctrl/Cmd+K) — MURNI, tanpa DOM/React, teruji di
// Node (scripts/test-command-palette.mjs). CommandPalette.jsx hanya merender
// hasil buildCommands + filterCommands; SEMUA keputusan "perintah apa yang
// ada & bagaimana dirangking" terpusat di sini.
//
// Kontrak ctx (disuplai AppLayout):
//   navigate(path)              : react-router navigate
//   dispatchMail(action, extra) : kirim CustomEvent 'pcp:palette' ke MailPage
//                                 (AppLayout memastikan rute /mail aktif dulu)
//   openShortcuts()             : buka modal bantuan pintasan (event pcp:open-shortcuts)
//   setTheme(mode)              : authStore setTheme ('dark'|'light'|'auto')
//   setPref(key, value)         : authStore setPref ('density'|'readingPane')
//   theme / density / readingPane / conversationView : nilai preferensi aktif
//   folders                     : cache ['folders', token] (array) | null —
//                                 grup Folder hanya muncul bila tersedia.

import { FOLDER_TYPE_LABELS } from './mailboxTree.js';

/** Ikon dirender CommandPalette dari key string — registry bebas dependensi UI. */
export const COMMAND_ICONS = [
  'mail', 'calendar', 'contacts', 'rules', 'stats', 'settings',
  'folder', 'compose', 'search', 'read-all', 'conversation', 'density',
  'pane-right', 'pane-bottom', 'pane-off', 'theme-dark', 'theme-light',
  'theme-auto', 'keyboard', 'refresh',
];

// Folder non-mail (Calendar/Contacts) tidak ikut grup Folder — pola yang sama
// dgn filterFoldersForPicker (mailSearch.js).
const NON_MAIL_FOLDER = /^folder(Calendar|Contacts)$/i;

const NAV_ITEMS = [
  { id: 'nav-mail', label: 'Email', path: '/mail', icon: 'mail', keywords: ['kotak masuk', 'inbox', 'surat', 'pesan'] },
  { id: 'nav-calendar', label: 'Kalender', path: '/calendar', icon: 'calendar', keywords: ['jadwal', 'agenda', 'calendar', 'acara'] },
  { id: 'nav-contacts', label: 'Kontak', path: '/contacts', icon: 'contacts', keywords: ['alamat', 'contacts', 'buku alamat'] },
  { id: 'nav-rules', label: 'Aturan', path: '/rules', icon: 'rules', keywords: ['rules', 'filter', 'saring'] },
  { id: 'nav-stats', label: 'Statistik', path: '/stats', icon: 'stats', keywords: ['stats', 'grafik', 'laporan'] },
  { id: 'nav-settings', label: 'Pengaturan', path: '/settings', icon: 'settings', keywords: ['settings', 'preferensi', 'tema', 'opsi'] },
];

// Nama IMAP standar → label pohon folder (fallback bila `type` tidak ada).
const STANDARD_IMAP_LABELS = {
  inbox: FOLDER_TYPE_LABELS.inbox,
  sent: FOLDER_TYPE_LABELS.sent,
  'sent items': FOLDER_TYPE_LABELS.sent,
  drafts: FOLDER_TYPE_LABELS.drafts,
  draft: FOLDER_TYPE_LABELS.drafts,
  trash: FOLDER_TYPE_LABELS.trash,
  'deleted items': FOLDER_TYPE_LABELS.trash,
  junk: FOLDER_TYPE_LABELS.junk,
  spam: FOLDER_TYPE_LABELS.junk,
};

/**
 * Label folder di palet = label pohon folder (Kotak Masuk/Terkirim/Draft/
 * Sampah/Spam — FOLDER_TYPE_LABELS), BUKAN nama IMAP mentah (INBOX/Sent/…).
 * Subfolder tampil sebagai path ramah-baca: "Arsip / 2025",
 * "Kotak Masuk / Proyek" (segmen pertama standar ikut diterjemahkan).
 */
export function folderCommandLabel(folder) {
  const raw = String(folder?.path || folder?.label || folder?.name || '').trim();
  const segments = raw.split('/').map((x) => x.trim()).filter(Boolean);
  if (segments.length <= 1) {
    const typeLabel = FOLDER_TYPE_LABELS[folder?.type]
      || (folder?.type === 'draft' ? FOLDER_TYPE_LABELS.drafts : undefined);
    return typeLabel
      || STANDARD_IMAP_LABELS[raw.toLowerCase()]
      || String(folder?.label || '').trim()
      || raw
      || folder?.id
      || '';
  }
  const first = STANDARD_IMAP_LABELS[segments[0].toLowerCase()];
  if (first) segments[0] = first;
  return segments.join(' / ');
}

/**
 * Bangun seluruh perintah, dikelompokkan utk tampilan palet.
 * @returns {Array<{ id:string, title:string, commands:Array }>}
 * Command: { id, label, group, icon, keywords:string[], hint?, active?, run() }
 */
export function buildCommands(ctx = {}) {
  const groups = [];
  const noop = () => {};
  const navigate = ctx.navigate || noop;
  const dispatchMail = ctx.dispatchMail || noop;
  const setTheme = ctx.setTheme || noop;
  const setPref = ctx.setPref || noop;
  const openShortcuts = ctx.openShortcuts || noop;

  // ── Navigasi ───────────────────────────────────────────────────────────────
  groups.push({
    id: 'nav',
    title: 'Navigasi',
    commands: NAV_ITEMS.map((n) => ({
      id: n.id,
      label: n.label,
      group: 'Navigasi',
      icon: n.icon,
      keywords: ['buka', 'halaman', ...n.keywords],
      run: () => navigate(n.path),
    })),
  });

  // ── Folder (hanya bila cache folder tersedia) ──────────────────────────────
  const folders = Array.isArray(ctx.folders) ? ctx.folders : null;
  if (folders && folders.length > 0) {
    const cmds = folders
      .filter((f) => f && f.id && !NON_MAIL_FOLDER.test(f.id))
      .map((f) => ({
        id: `folder-${f.id}`,
        label: folderCommandLabel(f),
        group: 'Folder',
        icon: 'folder',
        // Nama IMAP mentah (INBOX/Sent/…) tetap jadi kata kunci pencarian.
        keywords: ['folder', 'pindah', 'buka', ...new Set([f.label, f.name, f.path].map((x) => String(x || '')).filter(Boolean))],
        active: ctx.currentFolderId ? ctx.currentFolderId === f.id : false,
        run: () => dispatchMail('goto-folder', { folderId: f.id }),
      }));
    if (cmds.length > 0) groups.push({ id: 'folders', title: 'Folder', commands: cmds });
  }

  // ── Aksi ───────────────────────────────────────────────────────────────────
  const conversationOn = !!ctx.conversationView;
  const compact = ctx.density === 'compact';
  const pane = ctx.readingPane === 'bottom' || ctx.readingPane === 'off' ? ctx.readingPane : 'right';
  const theme = ctx.theme || 'dark';
  const actions = [
    { id: 'act-compose', label: 'Tulis pesan', icon: 'compose', hint: 'Ctrl+N', keywords: ['compose', 'baru', 'email baru', 'kirim'], run: () => dispatchMail('compose') },
    { id: 'act-search', label: 'Cari pesan', icon: 'search', hint: 'Ctrl+E', keywords: ['search', 'temukan', 'pencarian'], run: () => dispatchMail('focus-search') },
    { id: 'act-mark-all-read', label: 'Tandai semua dibaca', icon: 'read-all', keywords: ['mark all read', 'baca semua', 'folder'], run: () => dispatchMail('mark-all-read') },
    { id: 'act-refresh', label: 'Muat ulang daftar', icon: 'refresh', keywords: ['refresh', 'reload', 'segarkan', 'sinkron'], run: () => dispatchMail('refresh') },
    {
      id: 'act-conversation',
      label: conversationOn ? 'Nonaktifkan tampilan percakapan' : 'Aktifkan tampilan percakapan',
      icon: 'conversation', keywords: ['conversation', 'thread', 'utas', 'percakapan'],
      run: () => dispatchMail('toggle-conversation'),
    },
    {
      id: 'act-density',
      label: compact ? 'Kepadatan: nyaman' : 'Kepadatan: rapat',
      icon: 'density', keywords: ['density', 'compact', 'kepadatan', 'rapat', 'nyaman'],
      run: () => setPref('density', compact ? 'normal' : 'compact'),
    },
    { id: 'act-pane-right', label: 'Panel baca di kanan', icon: 'pane-right', keywords: ['reading pane', 'panel baca', 'kanan'], active: pane === 'right', run: () => setPref('readingPane', 'right') },
    { id: 'act-pane-bottom', label: 'Panel baca di bawah', icon: 'pane-bottom', keywords: ['reading pane', 'panel baca', 'bawah'], active: pane === 'bottom', run: () => setPref('readingPane', 'bottom') },
    { id: 'act-pane-off', label: 'Panel baca nonaktif', icon: 'pane-off', keywords: ['reading pane', 'panel baca', 'mati', 'tutup'], active: pane === 'off', run: () => setPref('readingPane', 'off') },
    { id: 'act-theme-dark', label: 'Tema gelap', icon: 'theme-dark', keywords: ['theme', 'dark', 'malam', 'tema'], active: theme === 'dark', run: () => setTheme('dark') },
    { id: 'act-theme-light', label: 'Tema terang', icon: 'theme-light', keywords: ['theme', 'light', 'siang', 'tema'], active: theme === 'light', run: () => setTheme('light') },
    { id: 'act-theme-auto', label: 'Tema otomatis', icon: 'theme-auto', keywords: ['theme', 'auto', 'sistem', 'tema'], active: theme === 'auto', run: () => setTheme('auto') },
    { id: 'act-shortcuts', label: 'Pintasan keyboard', icon: 'keyboard', hint: '?', keywords: ['shortcut', 'bantuan', 'keyboard', 'tombol'], run: () => openShortcuts() },
  ];
  groups.push({
    id: 'actions',
    title: 'Aksi',
    commands: actions.map((a) => ({ group: 'Aksi', keywords: [], ...a })),
  });

  return groups;
}

/** Semua command dari hasil buildCommands sebagai daftar datar (urutan grup). */
export function flattenCommands(groups) {
  const out = [];
  for (const g of Array.isArray(groups) ? groups : []) {
    for (const c of g.commands || []) out.push(c);
  }
  return out;
}

// ── Fuzzy filter: prefix > word-start > subsequence ──────────────────────────
const norm = (s) => String(s || '').toLowerCase();

/** q muncul berurutan (tidak harus bersebelahan) di s. */
function isSubsequence(q, s) {
  if (!q) return true;
  let i = 0;
  for (const ch of s) {
    if (ch === q[i]) i += 1;
    if (i === q.length) return true;
  }
  return false;
}

/** Rank terbaik sebuah teks utk query: 0 prefix, 1 word-start, 2 subsequence, -1 gagal. */
function rankText(q, text) {
  const t = norm(text);
  if (!t) return -1;
  if (t.startsWith(q)) return 0;
  // Awal kata: setelah spasi / tanda pemisah umum.
  const words = t.split(/[\s/:,.()\-_]+/).filter(Boolean);
  if (words.some((w) => w.startsWith(q))) return 1;
  if (isSubsequence(q, t)) return 2;
  return -1;
}

/** Rank terbaik sebuah command (label diutamakan atas keywords pada rank sama). */
export function rankCommand(command, query) {
  const q = norm(query).trim();
  if (!q) return 0;
  let best = rankText(q, command?.label);
  for (const kw of command?.keywords || []) {
    const r = rankText(q, kw);
    // Keyword tidak boleh mengalahkan label pada rank yang sama — +0.5 agar
    // "prefix di label" tampil di atas "prefix di keyword".
    const adjusted = r < 0 ? -1 : r + 0.5;
    if (adjusted >= 0 && (best < 0 || adjusted < best)) best = adjusted;
  }
  return best;
}

/**
 * Saring + rangking: prefix > word-start > subsequence; stabil di dalam rank
 * (urutan asli dipertahankan). Query kosong → daftar apa adanya.
 */
export function filterCommands(commands, query) {
  const list = Array.isArray(commands) ? commands : [];
  const q = norm(query).trim();
  if (!q) return list.slice();
  return list
    .map((c, idx) => ({ c, idx, rank: rankCommand(c, q) }))
    .filter((e) => e.rank >= 0)
    .sort((a, b) => (a.rank - b.rank) || (a.idx - b.idx))
    .map((e) => e.c);
}
