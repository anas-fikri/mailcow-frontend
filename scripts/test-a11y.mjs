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
assert.ok(mail.includes('aria-label="Hapus flag"'), 'Flag remove aria hilang');
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

console.log(`\nA11y audit: ${passCount} assertions PASS ✅`);
