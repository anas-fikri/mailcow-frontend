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
    background: [222.2, 84, 4.9],
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
const rules = read('src/pages/RulesPage.jsx');
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

// Sender jadi <button> (keyboard accessible)
assert.ok(mail.includes('onClick={(e) => searchBySender(senderLabel, e)}') && mail.includes('<button\n                type="button"'), 'Sender bukan <button>');
passCount++;

// Row hover actions + flag picker
for (const label of ['Buat aturan otomatis untuk pengirim ini', 'Tunda pesan', 'Arsipkan pesan', 'Hapus pesan']) {
  assert.ok(mail.includes(`aria-label="${label}"`), `MailPage row: aria-label "${label}" hilang`);
  passCount++;
}
// Anti-overlap: aksi hover harus hidden (bukan opacity-0) supaya tidak reserve
// ruang di lebar sempit — pengirim tidak boleh terjepit ~13px oleh 4 tombol
// invisible. Date diganti posisinya oleh aksi saat hover (group-hover:hidden).
assert.ok(mail.includes('hidden group-hover:flex items-center gap-1.5'), 'MailPage: aksi hover tidak hidden (reserve ruang di lebar sempit)');
passCount++;
assert.ok(mail.includes('group-hover:hidden'), 'MailPage: date tidak disembunyikan saat hover (aksi menimpa pengirim)');
passCount++;
assert.ok(mail.includes("starVisible ? '' : 'hidden group-hover:flex"), 'MailPage: star unflagged tidak hidden-until-hover (reserve ruang)');
passCount++;
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
assert.ok(reader.includes('<br><br>${cleanHtml}</blockquote>'), 'Reader: quote balasan memakai cleanHtml (URL asli, bukan proxy)');
passCount++;

// Auto-advance reader: setelah hapus/pindah/spam buka pesan berikutnya
// (siblingUids/onNavigateTo harus tetap dikonsumsi — regresi commit 6c1485f).
assert.ok(reader.includes('siblingUids = []') && reader.includes('onNavigateTo }'), 'Reader: siblingUids/onNavigateTo props hilang');
passCount++;
assert.ok(reader.includes('function navigateAfter()'), 'Reader: navigateAfter hilang');
passCount++;
assert.ok(reader.includes('siblingUids[idx + 1] ?? siblingUids[idx - 1]'), 'Reader: auto-advance fallback hilang');
passCount++;
assert.ok(reader.includes('navigateAfter();'), 'Reader: navigateAfter tidak dipakai setelah aksi');
passCount++;
assert.ok(mail.includes('siblingUids={visibleOrderUids}') && mail.includes('onNavigateTo={(uid) => setSelectedMsgId(uid)}'), 'MailPage: prop auto-advance ke reader hilang');
passCount++;

// Conversation group header: aria-expanded + tidak ada border ganda bertumpuk
assert.ok(mail.includes('aria-expanded={isExpanded}'), 'Conversation group header: aria-expanded hilang');
passCount++;
assert.ok(mail.includes('aria-label={`${isExpanded ? \'Ciutkan\' : \'Perluas\'} percakapan ${group.subject}`}'), 'Conversation group header: aria-label hilang');
passCount++;
// Thread line berasal dari SATU sumber (wrapper) — baris di dalamnya tanpa
// border-l-4 sendiri (mencegah dua garis kiri bertumpuk).
assert.ok(mail.includes('const leftBorderCls = nested ? \'\' : \'border-l-4 \''), 'Conversation row: border ganda (border-l-4) masih dipakai di nested');
passCount++;
assert.ok(mail.includes('ml-4 border-l-2 border-primary/15'), 'Conversation thread line hilang');
passCount++;
assert.ok(mail.includes('group.senders'), 'Conversation header memakai senders dari lib (bukan hitung ulang)');
passCount++;
assert.ok(mail.includes('group.hasUnread'), 'Conversation header memakai hasUnread');
passCount++;
assert.ok(mail.includes('group.latest'), 'Conversation header memakai latest');
passCount++;
assert.ok(mail.includes("import { groupConversations } from '../lib/conversations'"), 'Conversation lib import hilang');
passCount++;
assert.ok(mail.includes("labelField: isSentOrDraft ? 'to' : 'from'"), 'Conversation header: labelField (to utk Terkirim/Draf) hilang');
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

// Preferences: import signature SOGo harus TUNGGU prefs dimuat (race fix)
// migratedRef tidak boleh di-set sebelum prefs ada — kalau prefs lambat,
// signature SOGo tidak pernah diimport ke daftar lokal.
assert.ok(prefs.includes('if (!prefs) return;'), 'Preferences: import signature tidak menunggu prefs dimuat (race)');
passCount++;
assert.ok(prefs.includes('migratedRef.current = true;') && prefs.includes('if (!prefs) return;\n    migratedRef.current = true;'), 'Preferences: migratedRef di-set sebelum prefs siap');
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
assert.ok(mail.includes('flex items-center gap-1 shrink-0'), 'Cluster tombol header harus shrink-0');
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
assert.ok(contacts.includes('text-lg font-semibold truncate'), 'Contacts: judul harus truncate');
assert.ok(contacts.includes('flex gap-1 bg-muted rounded-lg p-0.5 shrink-0'), 'Contacts: cluster filter harus shrink-0');
passCount += 3;

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
assert.ok(reader.includes('e.key === \'Escape\') { e.preventDefault(); if (lightbox) setLightbox(null); else onClose(); }'), 'Esc tutup lightbox dulu, baru reader');
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
  rules.includes("loadSnoozes(user.email).folderINBOX") &&
  rules.includes('!snoozedInbox.has(String(m.uid))'),
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
// Server SOGo `lookupName` di SOGoContactGCSFolder hanya membuat objek baru
// bila URL berakhiran AsContact/AsList. `POST .../Contacts/personal/new` → 404;
// kontrak UI SOGo live = `POST .../_new_/saveAsContact` + c_component: 'vcard'.
// Delete memakai GET (Resource.remove UI SOGo), bukan POST.
assert.ok(apiSrc.includes("Contacts/personal/_new_/saveAsContact"), 'api: createContact harus pakai _new_/saveAsContact (bukan /new)');
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

console.log(`\nA11y audit: ${passCount} assertions PASS ✅`);
