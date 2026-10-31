/**
 * test-a11y.mjs — Regression untuk audit aksesibilitas:
 *  1. Kontras warna (WCAG 2.1 AA) — token desain & kombinasi khusus
 *  2. Target sentuh minimal 44px di toolbar MailPage / MessageReader / Sidebar
 *  3. aria-label pada tombol icon-only + state (aria-pressed/expanded)
 *
 * Bagian kontras memakai matematika murni (WCAG relative luminance) terhadap
 * nilai token yang DICONTOHKAN dari src/index.css — jika token berubah, test
 * ini harus diperbarui (nilai referensi ada di sini).
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── WCAG math ────────────────────────────────────────────────────────────────
function srgb(c) {
  c /= 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function luminance(h, s, l) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return srgb((r + m) * 255) * 0.2126 + srgb((g + m) * 255) * 0.7152 + srgb((b + m) * 255) * 0.0722;
}
function ratio(fg, bg) {
  const a = luminance(...fg), b = luminance(...bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}
function parseHsl(str) {
  const m = String(str).trim().match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  assert.ok(m, `format HSL tidak dikenal: ${str}`);
  return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
}

// ── 1. Kontras token (salinan nilai dari src/index.css) ─────────────────────
const TOKENS = {
  light: {
    background: [0, 0, 100],
    muted: [210, 40, 96.1],
    mutedForeground: parseHsl('215.4 16.3% 45%'),     // diubah 46.9 → 45
    foreground: [222.2, 84, 4.9],
    primary: [221, 83.2, 53.3],
    destructive: parseHsl('0 72% 46%'),               // diubah 84.2/60.2 → 72/46
  },
  dark: {
    background: [222, 32, 7],   // dipin ulang: dark bg modern-clean (index.css .dark --background)
    muted: [217.2, 32.6, 17.5],
    mutedForeground: [215, 20.2, 65.1],
    foreground: [210, 40, 98],
    primary: [217, 91.2, 59.8],
    destructive: parseHsl('0 84% 58%'),               // diubah 62.8/30.6 → 84/58
  },
};

const checks = [
  // [nama, fg, bg, minimal]
  ['light muted-foreground on background', TOKENS.light.mutedForeground, TOKENS.light.background, 4.5],
  ['light muted-foreground on muted',      TOKENS.light.mutedForeground, TOKENS.light.muted, 4.5],
  ['light destructive on background',      TOKENS.light.destructive, TOKENS.light.background, 4.5],
  ['light foreground on background',       TOKENS.light.foreground, TOKENS.light.background, 4.5],
  ['light primary on background (UI)',     TOKENS.light.primary, TOKENS.light.background, 3.0],
  ['dark muted-foreground on background',  TOKENS.dark.mutedForeground, TOKENS.dark.background, 4.5],
  ['dark muted-foreground on muted',       TOKENS.dark.mutedForeground, TOKENS.dark.muted, 4.5],
  ['dark destructive on background',       TOKENS.dark.destructive, TOKENS.dark.background, 4.5],
  ['dark foreground on background',        TOKENS.dark.foreground, TOKENS.dark.background, 4.5],
  ['dark primary on background (UI)',      TOKENS.dark.primary, TOKENS.dark.background, 3.0],
  // Kombinasi khusus yang dipakai di UI (bukan token)
  ['light amber-900 on white (session warn)', [38, 92, 31], [0, 0, 100], 4.5],
  ['dark amber-400 on dark bg (session warn)', [48, 96, 53], TOKENS.dark.background, 4.5],
  ['light amber-600 star on white',           [32, 95, 44], [0, 0, 100], 3.0],
  ['dark amber-400 star on dark bg',          [48, 96, 53], TOKENS.dark.background, 3.0],
  ['light orange-600 spam icon on white',     [25, 95, 45], [0, 0, 100], 3.0],
  ['dark orange-500 spam icon on dark bg',    [25, 95, 53], TOKENS.dark.background, 3.0],
  ['light destructive fg (white) on destructive bg', [210, 40, 98], TOKENS.light.destructive, 4.5],
  ['dark swipe red-700 + white fg',           [210, 40, 98], [0, 72, 42], 4.5],
];

let passCount = 0;
for (const [name, fg, bg, min] of checks) {
  const r = ratio(fg, bg);
  assert.ok(r >= min, `Kontras GAGAL: ${name} = ${r.toFixed(2)} (butuh ≥ ${min})`);
  passCount++;
  console.log(`  ✓ ${name}: ${r.toFixed(2)}:1`);
}

// ── 2. Static source assertions ──────────────────────────────────────────────
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const mail = read('src/pages/MailPage.jsx');
const compose = read('src/components/mailer/ComposeModal.jsx');
const reader = read('src/components/mailer/MessageReader.jsx');
const sidebar = read('src/components/layout/Sidebar.jsx');
const css = read('src/index.css');
const swipe = read('src/components/SwipeableRow.jsx');
const calendar = read('src/pages/CalendarPage.jsx');
const contacts = read('src/pages/ContactsPage.jsx');
const stats = read('src/pages/StatsPage.jsx');
const prefs = read('src/pages/PreferencesPage.jsx');
const app = read('src/App.jsx');
const login = read('src/pages/LoginPage.jsx');
const modal = read('src/components/EventModal.jsx');
const drop = read('src/lib/calendarDrop.js');
// RunNowDialog diekstrak dari RulesPage → kontrak run-manual dicek di gabungan keduanya.
const rules = read('src/pages/RulesPage.jsx') + '\n' + read('src/components/rules/RunNowDialog.jsx');
const autoArchive = read('src/lib/autoArchive.js');

console.log('\n— Target sentuh 44px (min-w-11/min-h-11) —');
const countOcc = (hay, needle) => hay.split(needle).length - 1;

// Toolbar MailPage: 5 toggle/aksi + filter = 6 tombol icon
for (const [label, marker] of [
  ['Tampilan percakapan', 'aria-label={conversationView ? \'Tampilan biasa\' : \'Tampilan percakapan\'}'],
  ['Urutkan', 'aria-label={sortAsc ? \'Urutkan terlama dulu\' : \'Urutkan terbaru dulu\'}'],
  ['Belum dibaca', 'aria-label={unreadOnly ? \'Tampilkan semua pesan\' : \'Hanya pesan belum dibaca\'}'],
  ['Berlampiran', 'aria-label={hasAttachmentOnly ? \'Tampilkan semua email\' : \'Hanya email berlampiran\'}'],
  ['Muat ulang', 'aria-label="Muat ulang pesan"'],
  ['Filter pencarian', 'aria-label="Filter pencarian"'],
]) {
  assert.ok(mail.includes(marker), `MailPage toolbar: aria-label "${label}" tidak ditemukan`);
  passCount++;
}
// aria-pressed/expanded pada toggle
for (const m of ['aria-pressed={conversationView}', 'aria-pressed={sortAsc}',
  'aria-pressed={unreadOnly}', 'aria-pressed={hasAttachmentOnly}', 'aria-expanded={showSearchFilter}']) {
  assert.ok(mail.includes(m), `MailPage toolbar: ${m} tidak ditemukan`);
  passCount++;
}

// Bulk toolbar icon buttons: 44px + label
for (const label of ['Keluar dari mode seleksi', 'Pilih semua pesan', 'Tandai berbintang',
  'Tandai pesan terpilih sebagai dibaca', 'Tandai pesan terpilih sebagai belum dibaca',
  'Laporkan pesan terpilih sebagai spam', 'Hapus pesan terpilih']) {
  assert.ok(mail.includes(`aria-label="${label}"`), `MailPage bulk: aria-label "${label}" hilang`);
  passCount++;
}

// MessageReader toolbar: 44px + label
for (const label of ['Kembali', 'Tandai belum dibaca', 'Tandai berbintang', 'Hapus pesan',
  'Laporkan spam', 'Pindahkan ke folder lain', 'Cetak']) {
  assert.ok(reader.includes(`aria-label="${label}"`), `MessageReader: aria-label "${label}" hilang`);
  passCount++;
}
assert.ok(reader.includes('aria-pressed={!!msg.isFlagged}'), 'MessageReader star aria-pressed hilang');
passCount++;

// Sidebar: toggle 44px + aria
assert.ok(sidebar.includes('aria-label="Tutup menu"'), 'Sidebar close aria hilang');
assert.ok(sidebar.includes("aria-label={collapsed ? 'Buka sidebar' : 'Ciutkan sidebar'}"), 'Sidebar collapse aria hilang');
assert.ok(sidebar.includes('aria-label="Ganti tema"'), 'Sidebar theme aria hilang');
assert.ok(sidebar.includes('aria-label="Keluar"'), 'Sidebar logout aria hilang');
assert.ok(sidebar.includes('text-amber-900 dark:text-amber-400'), 'SessionCountdown amber-900 hilang');
passCount += 5;

// Nama pengirim = teks biasa (klik baris = buka pesan, QA 2026-10-11);
// cari per pengirim pindah ke menu konteks. Baris punya nama aksesibel.
assert.ok(!mail.includes('onClick={(e) => searchBySender(senderLabel, e)}'), 'Klik nama pengirim tidak boleh menjalankan pencarian');
assert.ok(mail.includes("label: 'Cari email dari pengirim ini'"), 'Menu konteks: "Cari email dari pengirim ini" hilang');
assert.ok(mail.includes('aria-label={rowAriaLabel}') && mail.includes('role="button"'), 'Baris pesan: nama aksesibel (pengirim, subjek, waktu) hilang');
passCount += 3;

// Row hover actions + flag picker
for (const label of ['Buat aturan dari pesan ini', 'Tunda pesan', 'Arsipkan pesan', 'Hapus pesan']) {
  assert.ok(mail.includes(`aria-label="${label}"`), `MailPage row: aria-label "${label}" hilang`);
  passCount++;
}
// Anti-overlap: aksi hover = overlay absolut (tidak reserve ruang pengirim di
// lebar sempit). Reveal diatur .row-quick-actions di index.css: hanya
// pointer presisi, delay hover-intent 250ms, fokus keyboard seketika.
// (QA 2026-10-11: dobel-klik baris mendarat di "Balas cepat".)
assert.ok(mail.includes('className="row-quick-actions absolute right-0'), 'MailPage: aksi hover harus overlay row-quick-actions');
assert.ok(/\.row-quick-actions \{ display: none; \}/.test(css), 'CSS: aksi hover default display:none (tidak reserve ruang)');
assert.ok(css.includes('@media (hover: hover) and (pointer: fine)') && /row-quick-reveal [^;]*250ms/.test(css), 'CSS: aksi hover hanya pointer presisi + delay 250ms');
assert.ok(mail.includes('{starVisible && renderStarButton(0)}') && mail.includes('{!starVisible && !isTouch && renderStarButton(actionTab)}'), 'MailPage: star unflagged harus di overlay (tidak reserve ruang)');
assert.ok(mail.includes('const isDeliberateClick = (e) => e.detail <= 1;') && mail.includes('if (!isDeliberateClick(e)) return;\n                        quickReply(msg.uid, rowFolder);'), 'MailPage: Balas cepat harus abaikan klik ganda');
assert.ok(mail.includes('onDoubleClick={stopDbl}'), 'MailPage: aksi hover harus menelan dblclick');
passCount += 6;
assert.ok(mail.includes('aria-label="Hapus flag"'), 'Flag remove aria hilang');
passCount++;

// Anti tracking-pixel: proxyExternalImages ter-wire di path RENDER reader
// (bukan hanya ada di lib). Quote balasan/forward tetap URL asli.
assert.ok(reader.includes("import { proxyExternalImages } from '../../lib/imageProxy'"), 'Reader: proxyExternalImages tidak di-import');
passCount++;
assert.ok(reader.includes('const renderHtml = rawHtml ? proxyExternalImages(cleanHtml) : cleanHtml;'), 'Reader: renderHtml tanpa proxyExternalImages (IP bocor via tracking pixel)');
passCount++;
assert.ok(reader.includes('dangerouslySetInnerHTML={{ __html: renderHtml }}'), 'Reader: body render tidak memakai renderHtml (proxy)');
passCount++;
assert.ok(reader.includes('${renderHtml}') && reader.includes('win.print()'), 'Reader: print tidak memakai renderHtml (proxy)');
passCount++;
// Quote balasan kini disusun replyBuilder; reader harus mengoper cleanHtml
// (URL asli) — bukan renderHtml yang sudah di-proxy — sebagai bodyHtml.
assert.ok(reader.includes('bodyHtml: cleanHtml'), 'Reader: quote balasan memakai cleanHtml (URL asli, bukan proxy)');
assert.ok(!reader.includes('bodyHtml: renderHtml'), 'Reader: bodyHtml tidak boleh memakai renderHtml (proxy)');
passCount++;

// Auto-advance reader: setelah hapus/pindah/spam buka pesan berikutnya
// (siblingUids/onNavigateTo harus tetap dikonsumsi — regresi commit 6c1485f).
assert.ok(reader.includes('siblingUids = []') && reader.includes('onNavigateTo })'), 'Reader: siblingUids/onNavigateTo props hilang');
passCount++;
assert.ok(reader.includes('function navigateAfter()'), 'Reader: navigateAfter hilang');
passCount++;
assert.ok(reader.includes('siblingUids[idx + 1] ?? siblingUids[idx - 1]'), 'Reader: auto-advance fallback hilang');
passCount++;
assert.ok(reader.includes('navigateAfter();'), 'Reader: navigateAfter tidak dipakai setelah aksi');
passCount++;
assert.ok(mail.includes('siblingUids={readerOrderUids}') && mail.includes('onNavigateTo={(uid) => setSelectedMsgId(uid)}'), 'MailPage: prop auto-advance ke reader hilang');
passCount++;
// Posisi "N dari M" = seluruh baris TERMUAT, bukan irisan render visibleCount.
assert.ok(/const loadedFlatOrder = useMemo\([\s\S]*?filteredLoadedMessages/.test(mail), 'MailPage: urutan reader harus dari filteredLoadedMessages (bukan displayMessages)');
passCount++;

// Conversation group header: aria-expanded + tidak ada border ganda bertumpuk
assert.ok(mail.includes('aria-expanded={isExpanded}'), 'Conversation group header: aria-expanded hilang');
passCount++;
assert.ok(mail.includes('aria-label={`${isExpanded ? \'Ciutkan\' : \'Perluas\'} percakapan ${group.subject}`}'), 'Conversation group header: aria-label hilang');
passCount++;
// Thread line berasal dari SATU sumber (wrapper) — baris di dalamnya tanpa
// border kiri sendiri (mencegah dua garis kiri bertumpuk). Lebar bar = 2px
// (kontrak desain "modern clean": selected row = 2px accent left bar).
assert.ok(mail.includes('const leftBorderCls = nested ? \'\' : \'border-l-2 \''), 'Conversation row: border ganda (border kiri) masih dipakai di nested');
passCount++;
assert.ok(mail.includes('ml-4 border-l-2 border-primary/15'), 'Conversation thread line hilang');
passCount++;
assert.ok(mail.includes('group.senders'), 'Conversation header memakai senders dari lib (bukan hitung ulang)');
passCount++;
assert.ok(mail.includes('group.hasUnread'), 'Conversation header memakai hasUnread');
passCount++;
assert.ok(mail.includes('group.latest'), 'Conversation header memakai latest');
passCount++;
assert.ok(mail.includes("groupConversations, normalizeSubject as normalizeConversationSubject } from '../lib/conversations'"), 'Conversation lib import hilang');
passCount++;
assert.ok(mail.includes("labelField: isSentOrDraft ? 'to' : 'from'"), 'Conversation header: labelField (to utk Terkirim/Draf) hilang');
passCount++;
// Email tunggal (1 pesan) tidak boleh dirender sebagai header percakapan
// (thread palsu) — baris biasa, hanya grup >=2 pesan yang dapat header.
assert.ok(mail.includes('if (group.messages.length === 1)'), 'Conversation: email tunggal harus baris biasa (bukan header percakapan)');
passCount++;
assert.ok(mail.includes('return renderMessageRow(group.messages[0], -1, false);'), 'Conversation: email tunggal tidak dirender via renderMessageRow');
passCount++;

// Calendar: event overlap di slot jam sama harus side-by-side (bukan timpa)
assert.ok(calendar.includes("layoutOverlappingEvents"), 'Calendar: layoutOverlappingEvents tidak dipakai');
passCount++;
assert.ok(calendar.includes('const slotLayouts = layoutOverlappingEvents(hourEvents)'), 'Calendar: slotLayouts tidak dihitung per jam');
passCount++;
assert.ok(calendar.includes('left: `calc(${layout.leftPct}% + 2px)`'), 'Calendar: event overlap pakai left % (side-by-side)');
passCount++;
assert.ok(calendar.includes('width: `calc(${layout.widthPct}% - 4px)`'), 'Calendar: event overlap pakai width % (side-by-side)');
passCount++;
assert.ok(!calendar.includes('absolute left-1 right-1 rounded-lg'), 'Calendar: full-width event overlap masih ada (menimpa)');
passCount++;

// StatsPage user badge: email panjang harus truncate (tidak mendorong error)
assert.ok(stats.includes('min-w-0"') && stats.includes('truncate min-w-0'), 'StatsPage: badge user tidak truncate (bisa timpa error)');
passCount++;
assert.ok(stats.includes('ml-auto shrink-0 text-destructive/70'), 'StatsPage: error badge harus shrink-0 (tidak terjepit)');
passCount++;

// Signature kini tersimpan di server: impor SOGoMailSignature lama pindah ke
// lapisan sinkron (signatures.js → planSignatureRefresh) yang berjalan SETELAH
// baca server sukses; flag migrasi diset hanya setelah keputusan dibuat
// (gagal baca → tidak terkunci, dicoba lagi). Intent race-fix lama dipertahankan.
const sigLib = fs.readFileSync(path.join(ROOT, 'src/lib/signatures.js'), 'utf8');
assert.ok(sigLib.includes('const res = await fetchServerSignatures(e, { withDefaults: true });') && sigLib.indexOf('fetchServerSignatures(e, { withDefaults: true })') < sigLib.indexOf('const decision = planSignatureRefresh('), 'signatures: impor signature SOGo menunggu baca server');
passCount++;
assert.ok(!prefs.includes('migratedRef') && prefs.includes('refreshSignaturesFromServer(email, token)'), 'Preferences: tab Signature memuat dari server (tanpa migrasi lokal sendiri)');
passCount++;
// Regresi: daftar signature LOKAL harus dimuat INDEPENDEN dari prefs (effect
// dengan deps [email]) — kalau fetchPreferences gagal, list lokal tetap tampil.
assert.ok(prefs.includes('}, [email]);') && prefs.includes('const fresh = loadSignatures(email);\n    setSigList(fresh.list);'), 'Preferences: list lokal tidak bergantung pada query prefs');
passCount++;

// Star/spam kontras perbaikan
assert.ok(mail.includes('text-amber-600 fill-amber-600 dark:text-amber-400 dark:fill-amber-400'), 'Star amber-600 dark split hilang');
assert.ok(mail.includes('text-orange-600 dark:text-orange-500'), 'Spam orange-600 hilang');
assert.ok(reader.includes('text-amber-600 dark:text-amber-400'), 'Reader star amber-600 hilang');
passCount += 3;

// CSS tokens + focus-visible
assert.ok(css.includes('--muted-foreground: 215.4 16.3% 45%'), 'CSS muted-foreground 45% hilang');
assert.ok(css.includes('--destructive: 0 72% 46%'), 'CSS destructive light hilang');
assert.ok(css.includes('--destructive: 0 84% 58%'), 'CSS destructive dark hilang');
assert.ok(css.includes(':focus-visible'), 'CSS focus-visible hilang');
passCount += 4;

// SwipeableRow dark red-700 (white fg ≥ 4.5 di dark)
assert.ok(swipe.includes('bg-destructive dark:bg-red-700'), 'SwipeableRow dark:bg-red-700 hilang');
passCount++;

// Mobile: swipe TIDAK boleh ikut membuka pesan — onSwipe menekan synthetic
// click via suppressClick (lihat handleRowClick). Tanpa ini, swipe-to-delete
// di HP membuka pesan sekaligus menjadwalkan hapus.
assert.ok(swipe.includes('onSwipe'), 'SwipeableRow harus punya prop onSwipe');
assert.ok(swipe.includes("onSwipe?.('left')"), 'SwipeableRow harus panggil onSwipe left sebelum aksi');
assert.ok(swipe.includes("onSwipe?.('right')"), 'SwipeableRow harus panggil onSwipe right sebelum aksi');
assert.ok(mail.includes('onSwipe={() => suppressClick.current.add(msg.uid)}'), 'MailPage harus tekan synthetic click setelah swipe');
passCount += 4;

// ── Posisi ikon saat dynamic sizing (lebar panel berubah) ─────────────────────
// 1) Search: tombol bersihkan (✕) tidak boleh menimpa teks yang diketik —
//    input butuh pr-10 (bukan pr-4) agar teks berhenti sebelum tombol 36px.
assert.ok(mail.includes('pl-9 pr-10 py-2'), 'Input search harus pr-10 agar ✕ tidak nimpa teks');
passCount++;
// 2) Header list: judul folder truncate + badge/ikon shrink-0 — saat panel
//    list menyempit, judul menyusut duluan, tombol aksi tidak terpotong.
assert.ok(mail.includes('className="flex items-center gap-2 min-w-0 flex-1"'), 'Header harus min-w-0 flex-1 utk dynamic sizing');
assert.ok(mail.includes('<span className="truncate">{selectedFolderMeta.label}</span>'), 'Judul folder harus truncate');
assert.ok(mail.includes('gap-1.5 tabular-nums shrink-0'), 'Badge hitung harus shrink-0');
assert.ok(mail.includes('flex items-center gap-1 flex-wrap') || mail.includes('overflow-x-auto'), 'Cluster tombol header harus wrap/overflow-safe');
passCount += 4;
// 3) Baris pesan: cluster ikon (snooze/arsip/star/date) sejajar vertikal dgn
//    baris pengirim (items-center, bukan items-baseline) di semua lebar list.
assert.ok(mail.includes('flex justify-between items-center mb-1 gap-2'), 'Header baris harus items-center (bukan items-baseline)');
passCount++;

// ── Header Kalender & Kontak: pola min-w-0/truncate/shrink-0 ──────────────────
// Judul menyusut duluan (min-w-0 flex-1 + truncate), cluster aksi shrink-0.
assert.ok(calendar.includes('flex items-center gap-2 min-w-0 flex-1'), 'Calendar: wrapper judul harus min-w-0 flex-1');
assert.ok(calendar.includes('text-base font-semibold truncate'), 'Calendar: judul harus truncate');
assert.ok(calendar.includes('flex items-center gap-2 shrink-0'), 'Calendar: cluster aksi harus shrink-0');
assert.ok(calendar.includes('hidden sm:block shrink-0 whitespace-nowrap'), 'Calendar: judul periode harus shrink-0 whitespace-nowrap');
assert.ok(contacts.includes('flex items-center gap-2 min-w-0 flex-1'), 'Contacts: wrapper judul harus min-w-0 flex-1');
assert.ok(contacts.includes('text-base font-semibold truncate'), 'Contacts: judul harus truncate');
assert.ok(contacts.includes('flex gap-1 bg-muted rounded-lg p-0.5 shrink-0'), 'Contacts: cluster filter harus shrink-0');
passCount += 3;

// ── Preferensi tampilan benar-benar dipakai webmail (2026-08-26) ─────────────
// Sebelumnya: DisplaySection menyimpan SOGoMailComposeMessageType,
// SOGoMailReplyPlacement, SOGoFirstDayOfWeek, SOGoConfirmDelete — tapi tidak
// ada satu pun yang dikonsumsi app (setting diam-diam tidak berefek).
// composeMode: preferensi 'text' → buka compose Plain Text (sekali per bukaan,
// tanpa menimpa mode yang sudah diubah user manual).
assert.ok(compose.includes("SOGoMailComposeMessageType === 'text'"), 'compose: pref mode tulis text dibaca');
assert.ok(compose.includes('modeTouchedRef.current = true'), 'compose: perubahan mode manual dihormati (tidak ditimpa pref)');
assert.ok(compose.includes('initialCaret='), 'compose: posisi balasan memakai initialCaret');
assert.ok(compose.includes("SOGoMailReplyPlacement === 'below'"), 'compose: pref posisi balasan dibaca');
assert.ok(compose.includes("editorMode === 'plain'") && compose.includes('.replace(/<br\\s*[\\/]?>/gi'), 'compose: signature di-strip saat mode plain');
// confirmDelete: '0' → hapus langsung tanpa undo toast; '1' → konfirmasi undo.
assert.ok(mail.includes('SOGoConfirmDelete'), 'mail: pref SOGoConfirmDelete dibaca');
assert.ok(mail.includes('moveMutation.mutate({ uids, sourceFolder, targetFolder: trashFolder })') && mail.includes('!confirmDeleteEnabled'), 'mail: pref 0 = hapus langsung (tanpa undo)');
// weekStart: getWeekDays menerima weekStartsOn + rotasi label hari + startPad.
assert.ok(calendar.includes('function getWeekDays(date, weekStartsOn = 0)'), 'calendar: getWeekDays menerima weekStartsOn');
assert.ok(calendar.includes('(start.getDay() - weekStartsOn + 7) % 7'), 'calendar: offset awal minggu benar');
assert.ok(calendar.includes('function dayLabelsFor(weekStartsOn)'), 'calendar: label hari dirotasi sesuai awal minggu');
assert.ok(calendar.includes('(firstDay.getDay() - weekStartsOn + 7) % 7'), 'calendar: startPad bulan mengikuti awal minggu');
assert.ok(calendar.includes("String(prefs?.defaults?.SOGoFirstDayOfWeek ?? '0') === '1'"), 'calendar: pref SOGoFirstDayOfWeek dibaca');
passCount += 11;

// ── Riwayat alamat terkirim + mark-all-read robust (2026-08-26) ──────────────
// ComposeModal merekam penerima SETELAH kirim sukses + saran menggabung
// riwayat (getEmailSuggestions) — bukan hanya kontak.
assert.ok(compose.includes("recordSentRecipients(user?.email, to, cc, bcc)"), 'compose: alamat penerima direkam setelah kirim sukses');
assert.ok(compose.includes("getEmailSuggestions(user?.email, contacts, lastWord)"), 'compose: saran = kontak + riwayat terkirim');
assert.ok(compose.includes("import { recordSentRecipients, getEmailSuggestions } from '../../lib/emailHistory'"), 'compose: import emailHistory');
// MailPage: mark-all-read tidak lagi Promise.all massal — skip sudah-dibaca,
// concurrency dibatasi (batchWithLimit), toleran kegagalan parsial (allSettled).
assert.ok(mail.includes('function batchWithLimit'), 'mail: helper batchWithLimit tersedia');
assert.ok(mail.includes('batchWithLimit(\n        unread.map'), 'mail: mark-all-read memakai batchWithLimit');
assert.ok(mail.includes('messages.filter((m) => !m.isRead)'), 'mail: skip pesan yang sudah dibaca');
assert.ok(mail.includes("results.filter((r) => r.status === 'rejected')"), 'mail: kegagalan parsial dihitung (allSettled)');
assert.ok(mail.includes('dari ${total} pesan ditandai dibaca'), 'mail: pesan kegagalan parsial jujur');
passCount += 8;

// ── Kontrak API kontak SOGo (audit 2026-08-26) ──────────────────────────────
// (assertions runtime di bawah, dekat deklarasi apiSrc)

// ── Fitur MessageReader yang TIDAK BOLEH hilang (regresi 6c1485f) ────────────
// Commit fix(nginx) menimpa MessageReader dengan versi lama → lightbox preview,
// tambah-ke-kontak, markMessagesAsJunk, unduh-semua hilang diam-diam.
assert.ok(reader.includes('setLightbox'), 'Lightbox preview lampiran harus ada');
assert.ok(reader.includes('function openPreview(att)'), 'openPreview harus ada');
assert.ok(reader.includes("kind === 'image' || kind === 'pdf'"), 'Preview utk gambar + PDF');
assert.ok(reader.includes('markMessagesAsJunk(user.sogoToken, folder, [msgId])'), 'Lapor spam pakai endpoint native');
assert.ok(reader.includes('async function handleSaveContact(e)'), 'Tambah ke kontak harus ada');
assert.ok(reader.includes('async function handleDownloadAll()'), 'Unduh semua lampiran harus ada');
assert.ok(reader.includes('totalAttachmentSize(attachments)'), 'Total ukuran lampiran ditampilkan');
assert.ok(reader.includes('e.key === \'Escape\') { e.preventDefault(); if (lightbox) setLightbox(null); else if (docPreview) setDocPreview(null); else if (packPreview) setPackPreview(null); else onClose(); }'), 'Esc tutup lightbox → docx → paket → reader');
passCount += 8;

// ── Keamanan: 429 tidak boleh di-retry + cache bersih saat logout ────────────
// OWASP rate-limit: react-query me-retry 429 = memperparah beban server yang
// sedang minta pelan-pelan. Harus masuk daftar no-retry seperti 401/403/404.
assert.ok(app.includes('status === 429') && app.includes('status === 401 || status === 403 || status === 404 || status === 429'), 'App: 429 harus masuk daftar no-retry react-query');
passCount++;
// Data leak antar role di memori: logout manual (Sidebar) & sebelum login baru
// (LoginPage) wajib queryClient.clear() — cache akun A tidak boleh tersisa
// saat akun B login di perangkat yang sama (jalur session-expired sudah benar).
assert.ok(sidebar.includes('queryClient.clear()') && sidebar.includes('useQueryClient'), 'Sidebar: logout manual harus membersihkan queryClient');
passCount++;
assert.ok(login.includes('queryClient.clear()') && login.includes('useQueryClient'), 'LoginPage: sebelum login baru harus membersihkan queryClient');
passCount++;

// ── Recurring event: proteksi pola recurrence + konfirmasi hapus seri ───────
// SOGo menimpa recurrence saat save tanpa repeat — edit/drag event berulang
// wajib me-resolve repeat asli sebelum save (semua jalur), bukan diam-diam
// menyimpan tanpa pola.
assert.ok(calendar.includes("!eventData.repeat && !eventData.repeatTouched") && calendar.includes('fetchCalendarEventDetail'), 'Calendar: save-time safety net recurrence (resolve repeat via /view)');
passCount++;
assert.ok(calendar.includes("if (ev.isRecurring && !ev.occurrenceId)") && calendar.includes('Edit dibatalkan agar pola pengulangan tidak rusak'), 'Calendar: edit master berulang diblokir bila detail gagal (occurrence fallback aman)');
passCount++;
assert.ok(calendar.includes('setDeleteTarget(detailEv)'), 'Calendar: konfirmasi hapus jujur soal scope (scope chooser, bukan confirm generik)');
passCount++;
assert.ok(modal.includes('Hapus SELURUH rangkaian event berulang ini? Semua kejadian (berulang) akan dihapus.'), 'EventModal: konfirmasi hapus event berulang jujur soal scope');
passCount++;
assert.ok(modal.includes('repeatTouched: scopeSingle ? false : repeatTouchedRef.current') && modal.includes('isRecurring: !!event?.isRecurring'), 'EventModal: payload membawa repeatTouched (disabled di scope single) + isRecurring utk safety net');
passCount++;
assert.ok(drop.includes('isRecurring: ev.isRecurring || false'), 'calendarDrop: isRecurring diteruskan utk safety net drag');
passCount++;

// ── Interaksi auto-archive vs snooze vs filter kategori ─────────────────────
// (1) Klaim multi-tab HARUS di localStorage (di-share antar tab) — sessionStorage
// adalah per-tab, jadi klaim tab A tak terlihat tab B → double-move tetap
// terjadi (bug yang ditemukan audit: fix lama tidak benar-benar bekerja).
assert.ok(
  autoArchive.includes("localStorage.getItem(claimsKey(email))") &&
  !autoArchive.includes("sessionStorage.getItem(claimsKey(email))"),
  'autoArchive: klaim multi-tab harus pakai localStorage (di-share antar tab)'
);
passCount++;
// Release hanya menghapus klaim MILIK instance sendiri (ownership) — melepas
// klaim tab lain membuatnya kehilangan proteksi saat move masih berjalan.
assert.ok(
  autoArchive.includes('.owner === claimOwnerId') && autoArchive.includes('claimOwnerId'),
  'autoArchive: release harus ownership-based (hanya klaim sendiri)'
);
passCount++;
// MailPage: listener storage utk key klaim → re-run engine saat tab lain
// claim/release (menutup race klaim berbarengan).
assert.ok(
  mail.includes('autoArchiveClaimsKey(user.email)') && mail.includes('setClaimsTick'),
  'MailPage: listener storage klaim lintas-tab + bump claimsTick'
);
passCount++;
// MailPage: release hanya uid yang DIKLAIM tab ini (bukan semua unprocessed) —
// dengan ownership di lib, passing semua unprocessed tetap aman, tapi release
// yang presisi mencegah kebingungan dan kerja ekstra.
assert.ok(
  mail.includes('claimed.filter((uid) => !movedUids.has(String(uid)))'),
  'MailPage: release hanya klaim milik tab ini yang tidak jadi dipindah'
);
passCount++;
// Pesan yang di-snooze ditandai processed → saat bangun TIDAK di-arsip ulang
// oleh rule (pola Gmail: filter tidak jalan ulang saat snooze bangun; user
// minta tunda utk DILIHAT, bukan untuk langsung disembunyikan).
assert.ok(
  mail.includes("movedUids.has(String(m.uid)) || snoozedUids.has(String(m.uid))"),
  'MailPage: pesan di-snooze ditandai processed (tidak di-arsip saat bangun)'
);
passCount++;
// Hitung kategori (tab Utama/Promosi/Sosial/Update) hanya pesan yang terlihat
// — pesan di-snooze disembunyikan dari daftar, tidak boleh ikut dihitung.
assert.ok(
  mail.includes('categorySource') && mail.includes('messages={categorySource}'),
  'MailPage: hitung kategori tidak termasuk pesan yang di-snooze'
);
passCount++;
// RulesPage handleRunNow: (a) exclude pesan yang di-snooze (konsisten dengan
// engine otomatis), (b) koordinasi klaim multi-tab, (c) lepas klaim miliknya.
assert.ok(
  // "Jalankan sekarang" kini bisa memilih folder → snooze folder TERPILIH.
  rules.includes('loadSnoozes(user.email)[folderId]') &&
  rules.includes('isExcluded: (m) => snoozed.has(String(m.uid))'),
  'RulesPage: run-manual tidak memindahkan pesan yang sedang di-snooze'
);
passCount++;
assert.ok(
  rules.includes('claimAutoArchiveUids(user.email, matchedUids)') &&
  rules.includes('releaseAutoArchiveClaims(user.email, claimed)'),
  'RulesPage: run-manual memakai klaim multi-tab + lepas klaim milik sendiri'
);
passCount++;

// ── Edit/hapus SATU occurrence event berulang (recurrence_id SOGo 5) ────────
// Kontrak terverifikasi dari UI SOGo 5.12.10: segmen path `occurence{unixSec}`
// (SOGoCalendarComponent.lookupName: hasPrefix "occurence" + substring 9 =
// intValue). c_recurrence_id dari eventsblocks = unix detik start occurrence.
const apiSrc = read('src/lib/api.js');
// ── Kontrak API kontak SOGo (audit 2026-08-26) ──────────────────────────────
// Direvisi golden-sample produksi 2026-09-04: `_new_/saveAsContact` → 200
// tapi kartu TIDAK PERNAH tersimpan (phantom draft — data loss diam-diam).
// Kontrak UI SOGo asli (Card.service.js $save): GET newguid → POST
// {pid}/{guid}/saveAsContact dgn emails/phones ARRAY [{type,value}].
// Delete memakai GET (Resource.remove UI SOGo), bukan POST.
assert.ok(apiSrc.includes("Contacts/personal/newguid"), 'api: createContact harus GET newguid dulu (flow UI SOGo)');
// Cek kode (bukan komentar): URL create harus memakai pathSegment(guid),
// BUKAN literal _new_ (baris komentar yang menjelaskan bug boleh ada).
assert.ok(apiSrc.includes("${pathSegment(guid, 'guid')}/saveAsContact"), 'api: createContact harus POST ke {guid}/saveAsContact');
assert.ok(!/['"`]Contacts\/personal\/_new_\/saveAsContact/.test(apiSrc), 'api: createContact TIDAK BOLEH pakai URL literal _new_/saveAsContact (data loss terbukti golden-sample)');
assert.ok(apiSrc.includes("c_component: 'vcard'"), 'api: createContact harus sertakan c_component vcard');
assert.ok(apiSrc.includes("method: 'GET'" ) && apiSrc.includes("/Contacts/personal/${pathSegment(cardId, 'cardId')}/delete"), 'api: deleteContact harus GET {pid}/{uid}/delete (kontrak UI SOGo)');
passCount += 3;
const calendarEventsSrc = read('src/lib/calendarEvents.js');
// Parser memetakan c_recurrence_id → occurrenceId (identitas occurrence).
assert.ok(
  calendarEventsSrc.includes("ev.c_recurrence_id") && calendarEventsSrc.includes('occurrenceId'),
  'calendarEvents: c_recurrence_id harus dipetakan ke occurrenceId'
);
passCount++;
// API: helper occurence{ts} + dipakai di save/delete/detail occurrence.
assert.ok(
  apiSrc.includes("`occurence${n}`") && apiSrc.includes('function occurrenceSegment'),
  'api: helper occurrenceSegment membangun segmen occurence{ts}'
);
passCount++;
assert.ok(
  apiSrc.includes("${occ ? '/' + occ : ''}/save") &&
  apiSrc.includes("${occ ? '/' + occ : ''}/delete") &&
  apiSrc.includes("${occ ? '/' + occ : ''}/view"),
  'api: segmen occurence{ts} dipakai di save/delete/view'
);
passCount++;
// EventModal: scope selector "kejadian ini saja" vs "semua kejadian"; scope
// single memaksa repeat null (mengirim repeat mengubah pola SERI).
assert.ok(
  modal.includes("editScope === 'single'") && modal.includes('Kejadian ini saja'),
  'EventModal: scope selector kejadian ini saja / semua kejadian'
);
passCount++;
assert.ok(
  modal.includes('repeat: scopeSingle ? null : repeat') &&
  modal.includes('editScope: scopeSingle ? \'single\' : \'all\''),
  'EventModal: scope single memaksa repeat null + mengirim editScope'
);
passCount++;
// CalendarPage: route save/hapus occurrence via occurrenceId + scope chooser
// hapus (bukan window.confirm generik).
assert.ok(
  calendar.includes("eventData?.editScope === 'single' && eventData?.occurrenceId") &&
  calendar.includes("'personal', eventData.occurrenceId"),
  'CalendarPage: save scope single → updateCalendarEvent dgn occurrenceId'
);
passCount++;
assert.ok(
  calendar.includes('handleDeleteEvent(eventId, opts = {})') &&
  calendar.includes("'personal', scopeSingle ? opts.occurrenceId : null"),
  'CalendarPage: hapus occurrence → deleteCalendarEvent dgn occurrenceId'
);
passCount++;
assert.ok(
  calendar.includes('setDeleteTarget(detailEv)') &&
  calendar.includes('Hapus kejadian ini saja') &&
  calendar.includes('Hapus semua kejadian'),
  'CalendarPage: scope chooser hapus (kejadian ini / semua) di popup detail'
);
passCount++;
assert.ok(
  calendar.includes("fetchCalendarEventDetail(user?.sogoToken, ev.id, 'personal', ev?.occurrenceId || null)"),
  'CalendarPage: detail /view occurrence memakai segmen occurence{ts}'
);
passCount++;

// ── Drag scope occurrence: drag SATU kejadian = pindahkan kejadian itu ─────
// (exception RECURRENCE-ID via occurence{ts}), bukan seluruh seri. Shift+drag
// tetap = pindahkan seluruh seri (jalur lama dipertahankan).
assert.ok(
  calendar.includes('dragEvRef.current = { ev, series: !!(e?.shiftKey) }'),
  'CalendarPage: drag menyimpan scope (series hanya saat Shift)'
);
passCount++;
assert.ok(
  calendar.includes("isOccurrence && !series") &&
  calendar.includes("editScope: 'single'") &&
  calendar.includes('occurrenceId: ev.occurrenceId'),
  'CalendarPage: drag occurrence default → scope single (occurence{ts}, repeat null)'
);
passCount++;
assert.ok(
  calendar.includes('onDragStart={(e) => onDragStart(ev, e)}'),
  'CalendarPage: view meneruskan native event drag (Shift = pindah seri)'
);
passCount++;

// ── QA 2026-10-11 (a11y + friksi) ────────────────────────────────────────────
// Password: tiap input punya <label htmlFor> terasosiasi.
for (const id of ['pw-${f.key}', 'pw-new', 'pw-confirm']) {
  const isTpl = id.includes('${');
  const forAttr = isTpl ? 'htmlFor={`' + id + '`}' : `htmlFor="${id}"`;
  const idAttr = isTpl ? 'id={`' + id + '`}' : `id="${id}"`;
  assert.ok(prefs.includes(forAttr) && prefs.includes(idAttr), `Preferences: label password "${id}" tidak terasosiasi`);
  passCount++;
}
// Signature: hanya SATU tombol berlabel "Tambah Signature" (tombol simpan editor
// berlabel beda) + editor terbuka saat mode tambah.
assert.equal((prefs.match(/^\s*Tambah Signature\s*$/gm) || []).length, 1, 'Preferences: tombol "Tambah Signature" ganda');
assert.ok(prefs.includes("{editingId ? 'Simpan Perubahan' : 'Simpan Signature'}"), 'Preferences: tombol simpan editor harus "Simpan Signature"');
assert.ok(prefs.includes('(editingId || adding || !sigList.length)'), 'Preferences: editor harus terbuka saat mode tambah');
passCount += 3;
// Kalender: tombol "+" hari punya aria-label "Tambah acara <tanggal>".
assert.ok(calendar.includes('aria-label={`Tambah acara ${date.toLocaleDateString('), 'Calendar: tombol + hari tanpa aria-label "Tambah acara <tanggal>"');
passCount++;
// Statistik: kartu Penyimpanan punya empty state (bukan nol palsu).
assert.ok(stats.includes('Data penyimpanan tidak tersedia') && stats.includes('storageAvailable ?'), 'Stats: empty state penyimpanan hilang');
passCount++;
// Header thread: klik header SELALU expand (idempoten) + buka terbaru; hanya
// chevron yang toggle. Dua baris (subjek + waktu / peserta + badge).
assert.ok(mail.includes('const expandConversation = useCallback((key) => {'), 'MailPage: expandConversation (idempoten) hilang');
assert.ok(mail.includes('expandConversation(group.key);\n                              if (selectionMode) return;'), 'MailPage: klik header thread harus expandConversation, bukan toggle');
assert.ok(!mail.includes('if (!isExpanded) toggleConversation(group.key);'), 'MailPage: klik header tidak boleh toggle');
assert.ok(mail.includes("onClick={() => toggleConversation(group.key)}"), 'MailPage: chevron tetap toggle');
assert.ok(mail.includes("${i === 2 ? 'hidden! @md:flex!' : ''}"), 'MailPage: avatar stack maks 2 di daftar sempit');
passCount += 5;
// Tab kategori: tanpa scrollbar native, gradien tepi + scroll-snap.
assert.ok(mail.includes('overflow-x-auto scrollbar-none snap-x'), 'MailPage: tab kategori masih menampilkan scrollbar native');
assert.ok(css.includes('@utility scrollbar-none') && css.includes('&::-webkit-scrollbar { display: none; }'), 'CSS: utilitas scrollbar-none hilang');
assert.ok(mail.includes('data-overflow-end={edges.end || undefined}'), 'MailPage: indikator overflow tab kategori hilang');
passCount += 3;
// Zoom reader: chip disorot saat ≠100%, klik = reset.
assert.ok(reader.includes('data-zoom-active={zoom !== 1 || undefined}') && reader.includes('onClick={() => setZoom(1)}'), 'Reader: chip zoom tidak disorot/ reset');
passCount++;

console.log(`\nA11y audit: ${passCount} assertions PASS ✅`);
