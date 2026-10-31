/**
 * test-outlook-shell.mjs — Regresi app shell & preferensi ala Outlook:
 *  1. PreferencesPage: saklar aksesibel (<button role="switch">), tidak ada
 *     lagi pola <div onClick> toggle; tab "Tata Letak & Baca" pertama + default.
 *  2. notifyPrefs: field `sound` default false + normalisasi data rusak.
 *  3. AVATAR_COLORS: teks putih di atas warna avatar ≥ 4.5:1 (WCAG AA) —
 *     dihitung dari nilai oklch Tailwind v4 yang terpasang.
 *  4. index.css: hsl modern syntax, link ikut hue tema, border dark ≠ muted,
 *     card dark ≠ background, hook data-density / data-reading-pane.
 *  5. AppLayout/themeInit menulis data-density & data-reading-pane.
 *  6. Sidebar: menu akun role="menu" + event pcp:open-shortcuts; BottomNav:
 *     ≤5 target terlihat + label 11px.
 *
 * Jalankan: node scripts/test-outlook-shell.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0;
const ok = (cond, name) => { assert.ok(cond, name); pass++; console.log(`  ✓ ${name}`); };

// ── 1. PreferencesPage: switch aksesibel + tab default ───────────────────────
console.log('\n— PreferencesPage —');
const prefs = read('src/pages/PreferencesPage.jsx');

ok(/<button\s[^>]*role="switch"[^>]*aria-checked=\{checked\}/s.test(prefs),
  'Switch = <button role="switch" aria-checked>');
ok(prefs.includes('function Switch('), 'komponen Switch reusable ada di PreferencesPage');
// Pola lama: <div onClick={...} className={`relative w-11 h-6 rounded-full ...
ok(!/<div\s*\n?\s*onClick=\{[^}]*\}\s*\n?\s*className=\{`relative w-11 h-6/s.test(prefs),
  'tidak ada lagi toggle <div onClick> (w-11 h-6) — semua lewat Switch');
ok(!/<div\s+onClick=/.test(prefs) && !/<div\s*\n\s*onClick=/.test(prefs),
  'tidak ada <div onClick> sama sekali (kontrol harus <button>)');
// Setiap pemakaian Switch (bukan definisi) ≥ 4: vacation, confirmDelete, rich, sound, conversationView
const switchUses = (prefs.match(/<Switch\s/g) || []).length;
ok(switchUses >= 5, `Switch dipakai ≥ 5 kali (ditemukan ${switchUses})`);
ok(prefs.includes("useState('layout')"), "tab default = 'layout' (bukan 'password')");
ok(/const tabs = \[\s*\{ id: 'layout'/.test(prefs), "tab 'layout' urutan pertama");
ok(prefs.includes('Tata Letak & Baca'), 'label tab "Tata Letak & Baca"');
ok(prefs.includes('function LayoutSection('), 'LayoutSection ada');
for (const key of ["set('readingPane'", "set('density'", "set('markReadMode'", "set('markReadDelaySec'"]) {
  ok(prefs.includes(key), `LayoutSection menulis ${key}) via setPref`);
}
ok(prefs.includes('setConversationView(v)') && prefs.includes("setSortAsc(v === 'asc')"),
  'LayoutSection memakai setConversationView + setSortAsc');
ok(prefs.includes('Tersimpan otomatis'), 'hint "Tersimpan otomatis" ada');
ok(prefs.includes('min={1}') && prefs.includes('max={60}'), 'input jeda tandai dibaca 1–60 dtk');
ok(prefs.includes('role="radiogroup"') && prefs.includes('role="radio"'), 'ChoiceGroup = radiogroup/radio');
// Tab bar mobile: scroll horizontal + pill 44px (bukan flex-1 text-xs)
ok(prefs.includes('overflow-x-auto') && /role="tablist"[\s\S]*min-h-11 rounded-full/.test(prefs),
  'tab bar mobile: pill scrollable dengan target 44px');
ok(!prefs.includes('flex-1 flex flex-col items-center gap-1 py-2.5 text-xs'),
  'pola lama tab mobile terjepit (flex-1 text-xs) hilang');
ok(prefs.includes('role="tab"') && prefs.includes('aria-selected={active}'), 'tab memakai role="tab" + aria-selected');
// Notifikasi: saklar suara
ok(prefs.includes('Suara notifikasi') && prefs.includes('persist({ sound: v })'),
  'tab Notifikasi punya saklar "Suara notifikasi" → saveNotifyPrefs({ sound })');

// ── 2. notifyPrefs: sound default + normalisasi ──────────────────────────────
console.log('\n— notifyPrefs —');
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => store.clear(),
};
const np = await import(path.join(ROOT, 'src/lib/notifyPrefs.js'));
const { loadNotifyPrefs, saveNotifyPrefs, getNotifyPrefs, normalizeNotifyPrefs, DEFAULT_NOTIFY_PREFS } = np;

assert.deepEqual(loadNotifyPrefs('a@b.c'), { rich: true, sound: false });
ok(true, 'default: { rich: true, sound: false }');
ok(getNotifyPrefs === loadNotifyPrefs, 'getNotifyPrefs alias loadNotifyPrefs (dipakai MailPage)');
ok(DEFAULT_NOTIFY_PREFS.sound === false && Object.isFrozen(DEFAULT_NOTIFY_PREFS), 'DEFAULT_NOTIFY_PREFS.sound=false (frozen)');

// Data lama tanpa field sound → sound=false (bukan undefined)
store.set('pcp_notify_v1_a@b.c', JSON.stringify({ rich: false }));
assert.deepEqual(loadNotifyPrefs('A@B.C '), { rich: false, sound: false });
ok(true, 'data lama tanpa sound → sound:false; email dinormalisasi');

// Nilai tak valid → default (tidak throw)
for (const bad of ['"x"', '[1]', 'null', '{bad json', JSON.stringify({ rich: 'yes', sound: 'true' })]) {
  store.set('pcp_notify_v1_a@b.c', bad);
  const r = loadNotifyPrefs('a@b.c');
  assert.equal(typeof r.rich, 'boolean');
  assert.equal(typeof r.sound, 'boolean');
  assert.equal(r.sound, false, `sound harus false utk ${bad}`);
}
ok(true, 'nilai rusak/tipe salah → boolean default, tidak pernah throw');
assert.deepEqual(normalizeNotifyPrefs({ sound: true }), { rich: true, sound: true });
assert.deepEqual(normalizeNotifyPrefs({ sound: 1 }), { rich: true, sound: false });
ok(true, 'normalizeNotifyPrefs: sound hanya true bila === true');

// Save merge partial: ubah sound tidak mereset rich
store.clear();
saveNotifyPrefs('a@b.c', { rich: false });
const merged = saveNotifyPrefs('a@b.c', { sound: true });
assert.deepEqual(merged, { rich: false, sound: true });
assert.deepEqual(loadNotifyPrefs('a@b.c'), { rich: false, sound: true });
ok(true, 'saveNotifyPrefs merge partial: sound & rich independen');

// ── 3. AVATAR_COLORS kontras (teks putih) ────────────────────────────────────
console.log('\n— Avatar palette (AA) —');
const consts = read('src/lib/constants.js');
const avatarBlock = consts.match(/export const AVATAR_COLORS = \[([\s\S]*?)\];/);
assert.ok(avatarBlock, 'AVATAR_COLORS ditemukan');
const avatarClasses = [...avatarBlock[1].matchAll(/'bg-([a-z]+-\d{3})'/g)].map((m) => m[1]);
ok(avatarClasses.length >= 6, `AVATAR_COLORS punya ≥ 6 warna (${avatarClasses.length})`);
const twTheme = read('node_modules/tailwindcss/theme.css');
function oklchLum(L, C, h) {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return Math.max(0, 0.2126 * r + 0.7152 * g + 0.0722 * bb);
}
for (const name of avatarClasses) {
  const m = twTheme.match(new RegExp(`--color-${name}: oklch\\(([\\d.]+)% ([\\d.]+) ([\\d.]+)\\)`));
  assert.ok(m, `token Tailwind --color-${name} ada`);
  const lum = oklchLum(parseFloat(m[1]) / 100, parseFloat(m[2]), parseFloat(m[3]));
  const ratio = 1.05 / (lum + 0.05);
  ok(ratio >= 4.5, `putih di atas ${name}: ${ratio.toFixed(2)}:1 ≥ 4.5`);
}
const avatar = read('src/components/Avatar.jsx');
ok(avatar.includes('text-white'), 'Avatar memakai teks putih (asumsi kontras di atas)');

// ── 4. index.css ─────────────────────────────────────────────────────────────
console.log('\n— index.css —');
const css = read('src/index.css');
ok(!css.includes('hsl(var(--primary), 0.4)'), 'sintaks hsl(var(--primary), 0.4) yang invalid hilang');
ok(css.includes('hsl(var(--primary) / 0.4)'), 'nested blockquote memakai hsl(var(--primary) / 0.4)');
ok(!css.includes('color: hsl(221.2, 83.2%, 53.3%)'), 'link email tidak lagi biru hard-coded');
ok(/\.email-body a \{\s*color: hsl\(var\(--primary\)\);/.test(css), 'link email mengikuti --primary (hue tema)');
const darkBlock = css.match(/\.dark \{([\s\S]*?)\n  \}/)[1];
const tok = (name) => darkBlock.match(new RegExp(`--${name}: ([^;]+);`))?.[1].trim();
ok(tok('border') !== tok('muted') && tok('border') !== tok('secondary'), 'dark: --border ≠ --muted/--secondary');
const lightnessOf = (v) => parseFloat(v.split(/\s+/)[2]);
ok(lightnessOf(tok('border')) > lightnessOf(tok('muted')), 'dark: --border lebih terang dari --muted');
ok(tok('card') !== tok('background') && lightnessOf(tok('card')) > lightnessOf(tok('background')),
  'dark: --card sedikit lebih terang dari --background');
ok(/body \{[^}]*background-color: hsl\(var\(--background\)\)/.test(css), 'body punya background eksplisit');
for (const cls of ['.density-row', '.density-row-x', '.density-avatar', '.density-gap', '.density-text', '.density-hide', '.density-skeleton']) {
  ok(css.includes(cls) && css.includes(`[data-density="compact"] ${cls}`) || (cls === '.density-skeleton' && css.includes(cls)),
    `utility ${cls} + varian [data-density="compact"]`);
}
ok(css.includes('[data-reading-pane="off"]'), 'hook [data-reading-pane] ada');
ok(css.includes('--row-min-h'), 'variabel --row-min-h utk skeleton/virtual list');

// ── 5. AppLayout + themeInit: hook di <html> ─────────────────────────────────
console.log('\n— AppLayout / themeInit —');
const layout = read('src/components/layout/AppLayout.jsx');
ok(layout.includes('root.dataset.density =') && layout.includes('root.dataset.readingPane ='),
  'AppLayout menulis dataset.density + dataset.readingPane dari store');
ok(layout.includes('}, [density, readingPane]);'), 'effect density/readingPane punya deps benar');
ok(layout.includes("classList.add('dark')") && layout.includes("setProperty('--theme-hue'"), 'logika tema & hue tetap ada');
ok(/<main className="[^"]*min-w-0[^"]*"/.test(layout) && /<main className="[^"]*overflow-x-hidden/.test(layout),
  'main: min-w-0 + overflow-x-hidden (tanpa scroll horizontal di 320px)');
const themeInit = read('src/themeInit.js');
ok(themeInit.includes("setAttribute('data-density'") && themeInit.includes("setAttribute('data-reading-pane'"),
  'themeInit menulis data-density/data-reading-pane sebelum paint pertama');
ok(themeInit.includes("root.setAttribute('data-theme'") && themeInit.includes('catch (_)'), 'themeInit kontrak lama tetap');

// ── 6. Sidebar menu akun + BottomNav ─────────────────────────────────────────
console.log('\n— Sidebar / BottomNav —');
const sidebar = read('src/components/layout/Sidebar.jsx');
ok(sidebar.includes("import Avatar from '../Avatar'") && sidebar.includes('<Avatar name={user?.cn} email={user?.email}'),
  'Sidebar memakai komponen Avatar');
ok(sidebar.includes('role="menu"') && sidebar.includes('role="menuitem"'), 'menu akun role="menu"/"menuitem"');
ok(sidebar.includes('aria-haspopup="menu"') && sidebar.includes('aria-expanded={open}'), 'tombol pemicu aria-haspopup/expanded');
ok(sidebar.includes("e.key === 'Escape'") && sidebar.includes("'mousedown'"), 'Esc + klik-luar menutup menu');
ok(sidebar.includes("e.key === 'ArrowDown'") && sidebar.includes("e.key === 'ArrowUp'"), 'panah atas/bawah navigasi item');
ok(sidebar.includes("'pcp:open-shortcuts'") && sidebar.includes('window.dispatchEvent(new CustomEvent('),
  'item "Pintasan keyboard" dispatch CustomEvent pcp:open-shortcuts');
for (const label of ['Pengaturan', 'Pintasan keyboard', 'Keluar']) {
  ok(sidebar.includes(`<span>${label}</span>`) || sidebar.includes(`<span className="flex-1">${label}</span>`), `item menu "${label}"`);
}
ok(sidebar.includes('<SessionCountdown remainingMs={remainingMs} />'), 'countdown SMTP tetap dirender');
ok(!/<div className="w-7 h-7 rounded-full bg-primary/.test(sidebar), 'blok inisial statis lama hilang');
ok(sidebar.includes('aria-label="Ganti tema"') && sidebar.includes('aria-label="Keluar"'), 'aria-label tema/keluar (kontrak test-a11y)');

const bottom = read('src/components/layout/BottomNav.jsx');
ok(bottom.includes("PRIMARY_PATHS = ['/mail', '/calendar', '/contacts', '/settings']"), 'BottomNav: 4 tujuan utama + Lainnya = 5 target');
ok(bottom.includes('text-[11px]') && !bottom.includes('text-[10px]'), 'BottomNav: label 11px (bukan 10px)');
ok(bottom.includes('min-h-11'), 'BottomNav: target 44px');
ok(bottom.includes('role="dialog"') && bottom.includes('aria-label="Menu lainnya"'), 'BottomNav: sheet "Lainnya" = dialog berlabel');
ok(bottom.includes("e.key === 'Escape'"), 'BottomNav: Esc menutup sheet');
ok(bottom.includes('max-w-[100vw]') && bottom.includes('overflow-hidden'), 'BottomNav: tidak melebar melebihi viewport');

// Skeleton ikut density
const skeleton = read('src/components/Skeleton.jsx');
ok(skeleton.includes('density-row') && skeleton.includes('density-avatar') && skeleton.includes('density-hide'),
  'MessageListSkeleton memakai kelas density-* (ikut [data-density="compact"])');

console.log(`\nOutlook shell: ${pass} assertions PASS ✅`);
