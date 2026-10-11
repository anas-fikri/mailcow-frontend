// Palet perintah (Ctrl/Cmd+K): unit commandRegistry (build + fuzzy ranking),
// tambahan keymap OPEN_PALETTE, dan kontrak statis wiring (palette di
// AppLayout, listener pcp:palette di MailPage, hover prefetch pointer:fine,
// toast email baru, chip hint Ctrl+K).
// Jalankan: node scripts/test-command-palette.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCommands, flattenCommands, filterCommands, rankCommand, folderCommandLabel,
} from '../src/lib/commandRegistry.js';
import { resolveMailShortcut, MAIL_ACTIONS as A, SHORTCUT_GROUPS } from '../src/lib/keymap.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); pass++; };

// ── 1. buildCommands: grup & wiring ──────────────────────────────────────────
const calls = [];
const ctx = {
  navigate: (p) => calls.push(['navigate', p]),
  dispatchMail: (a, extra) => calls.push(['dispatchMail', a, extra]),
  openShortcuts: () => calls.push(['openShortcuts']),
  setTheme: (m) => calls.push(['setTheme', m]),
  setPref: (k, v) => calls.push(['setPref', k, v]),
  theme: 'dark', density: 'normal', readingPane: 'right', conversationView: false,
  currentFolderId: 'folderINBOX',
  folders: [
    { id: 'folderINBOX', label: 'Kotak Masuk', type: 'inbox', path: 'INBOX' },
    { id: 'folderArsip%2F2025', label: '2025', path: 'Arsip/2025', type: 'custom' },
    { id: 'folderCalendar', label: 'Calendar', type: 'custom' },
    { id: 'folderContacts', label: 'Contacts', type: 'custom' },
  ],
};
const groups = buildCommands(ctx);
ok(groups.map((g) => g.title).join('|') === 'Navigasi|Folder|Aksi', 'urutan grup: Navigasi, Folder, Aksi');

const flat = flattenCommands(groups);
ok(flat.every((c) => c.id && c.label && c.group && typeof c.run === 'function'), 'setiap command punya id/label/group/run');

// Navigasi: 6 halaman
const nav = groups.find((g) => g.title === 'Navigasi').commands;
assert.deepEqual(nav.map((c) => c.label), ['Email', 'Kalender', 'Kontak', 'Aturan', 'Statistik', 'Pengaturan']); pass++;
nav[1].run();
assert.deepEqual(calls.pop(), ['navigate', '/calendar'], 'Kalender → navigate /calendar'); pass++;

// Folder: non-mail (Calendar/Contacts) dikecualikan; subfolder pakai path
const folderCmds = groups.find((g) => g.title === 'Folder').commands;
ok(folderCmds.length === 2, 'folderCalendar/folderContacts dikecualikan dari grup Folder');
ok(folderCmds[1].label === 'Arsip / 2025', 'subfolder tampil sbg path "Arsip / 2025"');
ok(folderCmds[0].active === true, 'folder aktif (currentFolderId) ditandai active');
folderCmds[1].run();
assert.deepEqual(calls.pop(), ['dispatchMail', 'goto-folder', { folderId: 'folderArsip%2F2025' }], 'folder → dispatch goto-folder'); pass++;
ok(folderCommandLabel({ label: 'Draf' }) === 'Draf', 'folderCommandLabel fallback label');
// Label = label pohon folder, bukan nama IMAP mentah (QA 2026-10-11)
ok(folderCmds[0].label === 'Kotak Masuk', 'INBOX tampil sbg "Kotak Masuk"');
ok(folderCmds[0].keywords.includes('INBOX'), 'nama IMAP mentah tetap jadi kata kunci');
ok(folderCommandLabel({ path: 'Sent', name: 'Sent', label: 'Terkirim', type: 'sent' }) === 'Terkirim', 'Sent → Terkirim');
ok(folderCommandLabel({ path: 'Trash', name: 'Trash' }) === 'Sampah', 'Trash tanpa type → Sampah');
ok(folderCommandLabel({ path: 'Junk', name: 'Junk', type: 'junk' }) === 'Spam', 'Junk → Spam');
ok(folderCommandLabel({ path: 'Drafts', name: 'Drafts', type: 'draft' }) === 'Draft', 'Drafts (type draft) → Draft');
ok(folderCommandLabel({ path: 'INBOX/Proyek', label: 'Proyek', type: 'folder' }) === 'Kotak Masuk / Proyek', 'subfolder INBOX → "Kotak Masuk / Proyek"');
ok(folderCommandLabel({ path: 'Klien', name: 'Klien', label: 'Klien', type: 'folder' }) === 'Klien', 'folder custom tetap namanya');
{
  const hit = filterCommands(flattenCommands(buildCommands(ctx)), 'inbox');
  ok(hit.some((c) => c.id === 'folder-folderINBOX'), 'cari "inbox" tetap menemukan Kotak Masuk');
}

// Tanpa ctx.folders → grup Folder tidak ada
ok(!buildCommands({}).some((g) => g.title === 'Folder'), 'grup Folder hanya muncul bila ctx.folders tersedia');

// Aksi: dispatch mail-events + aksi langsung (theme/pref)
const actions = groups.find((g) => g.title === 'Aksi').commands;
const byId = Object.fromEntries(actions.map((c) => [c.id, c]));
byId['act-compose'].run();
assert.deepEqual(calls.pop(), ['dispatchMail', 'compose', undefined]); pass++;
byId['act-search'].run();
assert.deepEqual(calls.pop(), ['dispatchMail', 'focus-search', undefined]); pass++;
byId['act-mark-all-read'].run();
assert.deepEqual(calls.pop(), ['dispatchMail', 'mark-all-read', undefined]); pass++;
byId['act-refresh'].run();
assert.deepEqual(calls.pop(), ['dispatchMail', 'refresh', undefined]); pass++;
byId['act-conversation'].run();
assert.deepEqual(calls.pop(), ['dispatchMail', 'toggle-conversation', undefined]); pass++;
byId['act-density'].run();
assert.deepEqual(calls.pop(), ['setPref', 'density', 'compact'], 'density normal → tawarkan rapat'); pass++;
byId['act-pane-bottom'].run();
assert.deepEqual(calls.pop(), ['setPref', 'readingPane', 'bottom']); pass++;
byId['act-theme-light'].run();
assert.deepEqual(calls.pop(), ['setTheme', 'light']); pass++;
byId['act-shortcuts'].run();
assert.deepEqual(calls.pop(), ['openShortcuts']); pass++;
ok(byId['act-pane-right'].active === true && byId['act-theme-dark'].active === true, 'pane/tema aktif ditandai active');
ok(buildCommands({ ...ctx, density: 'compact' }).find((g) => g.title === 'Aksi').commands
  .find((c) => c.id === 'act-density').label === 'Kepadatan: nyaman', 'label density mengikuti state (compact → tawarkan nyaman)');

// ── 2. filterCommands: prefix > word-start > subsequence ─────────────────────
const sample = [
  { id: 's1', label: 'Panel baca di kanan', keywords: [] },   // "ka": word-start (kanan)
  { id: 's2', label: 'Kalender', keywords: [] },              // "ka": prefix
  { id: 's3', label: 'Tandai semua dibaca', keywords: [] },   // "ka": subsequence (tand-A... k? t-a-n-d-a-i → k tidak ada... cek di bawah)
  { id: 's4', label: 'Kotak Masuk', keywords: [] },           // "ka": prefix? K-o… tidak; word-start tidak; subsequence: k..a ya
];
const ranked = filterCommands(sample, 'ka');
ok(ranked[0].id === 's2', 'prefix ("Kalender") menang atas word-start');
ok(ranked[1].id === 's1', 'word-start ("kanan") menang atas subsequence');
ok(ranked.some((c) => c.id === 's4'), 'subsequence ("Kotak mAsuk") tetap cocok');
ok(!ranked.some((c) => c.id === 's3'), 'tanpa k…a berurutan → tidak cocok');

ok(filterCommands(sample, '').length === sample.length, 'query kosong → semua command');
ok(filterCommands(sample, 'zzz').length === 0, 'tidak ada hasil → [] (palet tampil "Tidak ada hasil")');

// Keyword ikut dicocokkan tapi label diutamakan pada rank sama
const kwSample = [
  { id: 'k1', label: 'Muat ulang daftar', keywords: ['refresh'] },
  { id: 'k2', label: 'Refresh token', keywords: [] },
];
const kwRanked = filterCommands(kwSample, 'refresh');
ok(kwRanked[0].id === 'k2' && kwRanked[1].id === 'k1', 'prefix label > prefix keyword');
ok(rankCommand({ label: 'Tema gelap', keywords: ['dark'] }, 'dark') >= 0, 'keyword match tetap lolos');

// Stabil dalam rank yang sama (urutan asli dipertahankan)
const stable = filterCommands([
  { id: 'a', label: 'Tema gelap', keywords: [] },
  { id: 'b', label: 'Tema terang', keywords: [] },
], 'tema');
assert.deepEqual(stable.map((c) => c.id), ['a', 'b'], 'urutan stabil dalam rank sama'); pass++;

// ── 3. keymap: Ctrl/Cmd+K → OPEN_PALETTE ─────────────────────────────────────
const ev = (key, mods = {}) => ({ key, ctrlKey: !!mods.ctrl, metaKey: !!mods.meta, shiftKey: !!mods.shift, altKey: !!mods.alt });
const base = { inInput: false, modalOpen: false, readerOpen: false, hasSelection: false, hasTarget: true, listLength: 10 };
assert.equal(resolveMailShortcut(ev('k', { ctrl: true }), base)?.action, A.OPEN_PALETTE, 'ctrl+k → palet'); pass++;
assert.equal(resolveMailShortcut(ev('K', { meta: true }), base)?.action, A.OPEN_PALETTE, 'cmd+k (huruf besar) → palet'); pass++;
assert.equal(resolveMailShortcut(ev('k', { ctrl: true }), { ...base, inInput: true })?.action, A.OPEN_PALETTE, 'ctrl+k saat mengetik → palet'); pass++;
assert.equal(resolveMailShortcut(ev('k', { ctrl: true, shift: true }), base), null, 'ctrl+shift+k tidak dicuri'); pass++;
assert.equal(resolveMailShortcut(ev('k'), base)?.action, A.MOVE_FOCUS, 'k polos tetap navigasi daftar'); pass++;
ok(SHORTCUT_GROUPS[0]?.title === 'Umum'
  && SHORTCUT_GROUPS[0].shortcuts.some((s) => s.keys.includes('Ctrl+K')),
  'bantuan: grup Umum memuat Ctrl+K');

// ── 4. Kontrak statis wiring ─────────────────────────────────────────────────
const layout = read('src/components/layout/AppLayout.jsx');
const mail = read('src/pages/MailPage.jsx');
const palette = read('src/components/CommandPalette.jsx');

// AppLayout: mount + capture + cache peek + navigate-then-dispatch
ok(layout.includes('<CommandPalette'), 'AppLayout me-mount CommandPalette (global)');
ok(layout.includes("window.addEventListener('keydown', onPaletteKey, true)"), 'AppLayout menangkap Ctrl/Cmd+K di fase CAPTURE (sebelum MailPage)');
ok(layout.includes('e.stopPropagation();'), 'AppLayout stopPropagation agar keymap MailPage tidak konflik');
ok(layout.includes("queryClient.getQueryData(['folders', user?.sogoToken])"), 'daftar folder dibaca dari cache React Query (read-only peek, tanpa store baru)');
ok(layout.includes("new CustomEvent('pcp:palette'"), 'aksi mail dikirim via CustomEvent pcp:palette');
ok(layout.includes("navigate('/mail')"), 'di luar rute mail → pindah dulu baru dispatch');

// CommandPalette: kontrak desain + a11y + Esc capture
ok(palette.includes('rounded-xl shadow-lg') && palette.includes('mt-[15vh]'), 'modal: rounded-xl shadow-lg, centered top 15vh');
ok(palette.includes('role="combobox"') && palette.includes('role="listbox"') && palette.includes('role="option"'), 'semantik combobox/listbox/option');
ok(palette.includes('aria-activedescendant'), 'aria-activedescendant mengikuti baris aktif');
ok(palette.includes('Tidak ada hasil'), 'empty state "Tidak ada hasil"');
ok(palette.includes("document.addEventListener('keydown', onEsc, true)"), 'Esc ditangkap fase capture (pola MoveToPicker)');
ok(palette.includes('text-[13px]'), 'baris menu 13px');
ok(palette.includes('onMouseEnter={() => setActiveIdx(flatIdx)}'), 'hover mouse memindahkan baris aktif');
ok(palette.includes('min-h-11 sm:min-h-9'), 'target sentuh 44px di layar kecil');

// MailPage: satu listener pcp:palette → handler yang sudah ada
ok(mail.includes("window.addEventListener('pcp:palette', onPalette)"), 'MailPage: listener pcp:palette terpasang');
ok(mail.includes("case 'goto-folder': if (detail.folderId) selectFolder(detail.folderId); break;"), 'goto-folder → selectFolder yang ada');
ok(mail.includes("case 'mark-all-read':") && mail.includes('markAllReadMutation.mutate({ folderId: selectedFolder })'), 'mark-all-read → markAllReadMutation yang ada');
ok(mail.includes("case 'compose': setComposeData(null); setComposeOpen(true); break;"), 'compose → alur compose yang ada');
ok(mail.includes("case A.OPEN_PALETTE: window.dispatchEvent(new CustomEvent('pcp:open-palette')); break;"), 'keymap OPEN_PALETTE → event pcp:open-palette (fallback)');
ok(layout.includes("window.addEventListener('pcp:open-palette', onOpen)"), 'AppLayout mendengarkan pcp:open-palette');

// Hover prefetch: pointer presisi, hover-intent 120ms, maks 1 in-flight, side-effect-free
ok(mail.includes("window.matchMedia('(pointer: fine)')"), 'prefetch hanya utk pointer: fine (desktop)');
ok(mail.includes('setTimeout(() => {') && mail.includes('}, 120);'), 'hover-intent 120ms sebelum prefetch');
ok(mail.includes('queryClient') && mail.includes('.prefetchQuery({ queryKey: key, queryFn: () => fetchMessage(token, folder, uid), staleTime: 30_000 })'), 'prefetchQuery key ["message", token, folder, uid] + staleTime 30 dtk');
ok(mail.includes('if (prefetchInFlight.current) return;'), 'maks 1 prefetch in-flight');
ok(mail.includes('onMouseEnter={() => schedulePrefetchMessage(msg.uid, rowFolder)}')
  && mail.includes('onMouseLeave={cancelPrefetchMessage}'), 'baris pesan: enter jadwalkan, leave batalkan');
const reader = read('src/components/mailer/MessageReader.jsx');
ok(reader.includes('queryFn: () => fetchMessage(token, folder, msgId)'), 'queryFn reader side-effect-free (markRead TIDAK di queryFn) — prefetch aman');

// Toast email baru: hanya tab terlihat + throttle + aksi Buka
ok(mail.includes("document.visibilityState === 'visible'"), 'toast email baru hanya saat tab terlihat');
ok(mail.includes('newMailToastAtRef.current > 30_000') || mail.includes('now - newMailToastAtRef.current > 30_000'), 'throttle maks 1 toast per burst');
ok(mail.includes('`Email baru dari ${sender}: ${subj}`'), 'pesan toast "Email baru dari <sender>: <subject>"');
ok(mail.includes("label: 'Buka', kind: 'open'") && mail.includes("selectFolder('folderINBOX'); openMessage(latest.uid);"), 'aksi Buka membuka uid di INBOX');
ok(mail.includes('duration: 8000'), 'durasi toast 8 dtk');

// Discoverability: chip Ctrl+K di input pencarian (desktop saja)
ok(mail.includes('PALETTE_HINT') && mail.includes('hidden md:inline-flex'), 'chip hint Ctrl+K di input pencarian, tersembunyi di mobile');

console.log(`command-palette: ${pass} assertions PASS`);
