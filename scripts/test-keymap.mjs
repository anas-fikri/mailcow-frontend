// Unit test: src/lib/keymap.js — resolusi pintasan keyboard daftar pesan.
// Jalankan: node scripts/test-keymap.mjs
import assert from 'node:assert/strict';
import { resolveMailShortcut, MAIL_ACTIONS as A, READER_PLAIN_KEYS, SHORTCUT_GROUPS } from '../src/lib/keymap.js';

let pass = 0;
const ev = (key, mods = {}) => ({ key, ctrlKey: !!mods.ctrl, metaKey: !!mods.meta, shiftKey: !!mods.shift, altKey: !!mods.alt });
const base = { inInput: false, modalOpen: false, readerOpen: false, hasSelection: false, hasTarget: true, listLength: 10 };
const r = (key, mods, ctx) => resolveMailShortcut(ev(key, mods), { ...base, ...ctx });
const is = (res, action, msg) => { assert.equal(res?.action, action, msg); pass++; };
const none = (res, msg) => { assert.equal(res, null, msg); pass++; };

// ── Input aktif ─────────────────────────────────────────────────────────────
none(r('j', {}, { inInput: true }), 'mengetik j di input tidak navigasi');
is(r('/', { ctrl: true }, { inInput: true }), A.FOCUS_SEARCH, 'ctrl+/ di input → fokus search');
is(r('e', { meta: true }, { inInput: true }), A.FOCUS_SEARCH, 'cmd+e di input → fokus search');
is(r('Escape', {}, { inInput: true }), A.BLUR_INPUT, 'esc di input → blur');
none(r('a', { ctrl: true }, { inInput: true }), 'ctrl+a di input = select text (browser)');

// ── Modal terbuka ───────────────────────────────────────────────────────────
none(r('d', {}, { modalOpen: true }), 'd di belakang modal dibungkam');
is(r('Escape', {}, { modalOpen: true }), A.CLOSE_MODAL, 'esc saat modal → closeModal');
none(r('n', { ctrl: true }, { modalOpen: true }), 'ctrl+n di belakang modal dibungkam');

// ── Kombinasi Ctrl/Cmd eksplisit ────────────────────────────────────────────
is(r('a', { ctrl: true }), A.SELECT_ALL, 'ctrl+a');
is(r('q', { meta: true }), A.MARK_READ, 'cmd+q → dibaca');
is(r('u', { ctrl: true }), A.MARK_UNREAD, 'ctrl+u → belum dibaca');
is(r('e', { ctrl: true }), A.FOCUS_SEARCH, 'ctrl+e → search');
is(r('n', { ctrl: true }), A.COMPOSE, 'ctrl+n → tulis');
is(r('z', { meta: true }), A.UNDO, 'cmd+z → undo');
none(r('z', { meta: true, shift: true }), 'cmd+shift+z (redo) tidak dicuri');
is(r('r', { ctrl: true }), A.REPLY, 'ctrl+r dgn target → balas');
is(r('R', { ctrl: true, shift: true }), A.REPLY_ALL, 'ctrl+shift+r → balas semua (key huruf besar dinormalisasi)');
is(r('f', { ctrl: true }), A.FORWARD, 'ctrl+f dgn target → teruskan');
none(r('r', { ctrl: true }, { hasTarget: false }), 'ctrl+r tanpa target → browser reload');
none(r('f', { meta: true }, { hasTarget: false }), 'cmd+f tanpa target → find browser');
none(r('F', { ctrl: true, shift: true }), 'ctrl+shift+f tidak dicuri');
is(r('V', { ctrl: true, shift: true }), A.MOVE_PICKER, 'ctrl+shift+v → pindahkan');
none(r('v', { ctrl: true }), 'ctrl+v (paste) tidak dicuri');
is(r('G', { meta: true, shift: true }), A.TOGGLE_FLAG, 'cmd+shift+g → bendera');
none(r('g', { ctrl: true }), 'ctrl+g tidak dicuri');
none(r('c', { ctrl: true }), 'ctrl+c (copy) tidak dicuri');
none(r(',', { ctrl: true }), 'ctrl+, milik reader');
none(r('.', { meta: true }), 'cmd+. milik reader');
none(r('j', { alt: true }), 'alt+j tidak dicuri');
none(r('r', { alt: true }), 'alt+r tidak dicuri');
is(r('r', { ctrl: true }, { readerOpen: true }), A.REPLY, 'ctrl+r tetap milik MailPage walau reader terbuka');

// ── Tombol polos: navigasi ──────────────────────────────────────────────────
assert.deepEqual(r('ArrowDown'), { action: A.MOVE_FOCUS, step: 1 }, 'ArrowDown'); pass++;
assert.deepEqual(r('ArrowUp'), { action: A.MOVE_FOCUS, step: -1 }, 'ArrowUp'); pass++;
assert.deepEqual(r('j'), { action: A.MOVE_FOCUS, step: 1 }, 'j'); pass++;
assert.deepEqual(r('k'), { action: A.MOVE_FOCUS, step: -1 }, 'k'); pass++;
assert.deepEqual(r('Home'), { action: A.MOVE_FOCUS, step: 'home' }, 'Home'); pass++;
assert.deepEqual(r('End'), { action: A.MOVE_FOCUS, step: 'end' }, 'End'); pass++;
none(r('ArrowDown', {}, { listLength: 0 }), 'daftar kosong → tidak navigasi');
is(r('Enter'), A.OPEN, 'Enter buka');
is(r('o'), A.OPEN, 'o buka');
none(r('Enter', {}, { hasTarget: false }), 'Enter tanpa target → null');
is(r('?', { shift: true }), A.HELP, '? → bantuan');
is(r('Escape'), A.ESCAPE, 'esc');
is(r('/'), A.FOCUS_SEARCH, '/ → search');
is(r('c'), A.COMPOSE, 'c → tulis');
is(r('a'), A.SELECT_ALL, 'a → pilih semua');

// ── Tombol polos: aksi (fokus tanpa seleksi tetap bekerja — FIX s/u/x/d/e) ──
is(r('s'), A.TOGGLE_FLAG, 's');
is(r('e'), A.ARCHIVE, 'e');
is(r('u'), A.MARK_UNREAD, 'u');
is(r('x'), A.MARK_READ, 'x');
is(r('d'), A.DELETE, 'd');
is(r('#', { shift: true }), A.DELETE, '#');
is(r('Delete'), A.DELETE, 'Delete');
is(r('Backspace'), A.DELETE, 'Backspace');
is(r('!', { shift: true }), A.SPAM_TOGGLE, '!');
is(r('m'), A.MOVE_PICKER, 'm → picker');
is(r('r'), A.REPLY, 'r (reader tertutup) → balas');
is(r('R', { shift: true }), A.REPLY_ALL, 'shift+r → balas semua');
is(r('f'), A.FORWARD, 'f → teruskan');
none(r('s', {}, { hasTarget: false }), 's tanpa target → null');
none(r('d', {}, { hasTarget: false }), 'd tanpa target → null');
none(r('p'), 'tombol tak dikenal → null');

// ── Kepemilikan reader ──────────────────────────────────────────────────────
assert.deepEqual([...READER_PLAIN_KEYS].sort(), ['delete', 'f', 'r', 's', 'u'], 'reader memiliki r/f/s/u/Delete'); pass++;
none(r('s', {}, { readerOpen: true }), 'reader terbuka: s milik reader');
none(r('r', {}, { readerOpen: true }), 'reader terbuka: r milik reader');
none(r('R', { shift: true }, { readerOpen: true }), 'reader terbuka: shift+r milik reader');
none(r('f', {}, { readerOpen: true }), 'reader terbuka: f milik reader');
none(r('u', {}, { readerOpen: true }), 'reader terbuka: u milik reader');
none(r('Delete', {}, { readerOpen: true }), 'reader terbuka: Delete milik reader');
is(r('d', {}, { readerOpen: true }), A.DELETE, 'reader terbuka: d tetap MailPage');
is(r('x', {}, { readerOpen: true }), A.MARK_READ, 'reader terbuka: x tetap MailPage');
is(r('j', {}, { readerOpen: true }), A.MOVE_FOCUS, 'reader terbuka: j tetap MailPage');
is(r('Escape', {}, { readerOpen: true }), A.ESCAPE, 'esc tetap diproses MailPage (idempoten dgn reader)');
is(r('s', {}, { readerOpen: true, hasSelection: true }), A.TOGGLE_FLAG, 'seleksi multi + reader terbuka: MailPage ambil alih');
is(r('Delete', {}, { readerOpen: true, hasSelection: true }), A.DELETE, 'seleksi multi: Delete milik MailPage');

// ── Input aneh ──────────────────────────────────────────────────────────────
none(resolveMailShortcut(null, base), 'event null aman');
none(resolveMailShortcut({}, base), 'event tanpa key aman');
none(resolveMailShortcut(ev('j'), undefined), 'ctx undefined → listLength 0 → null (aman)');

// ── Bantuan: setiap grup punya judul & isi ──────────────────────────────────
assert.ok(SHORTCUT_GROUPS.length >= 5, 'minimal 5 grup bantuan'); pass++;
for (const g of SHORTCUT_GROUPS) {
  assert.ok(g.title && Array.isArray(g.shortcuts) && g.shortcuts.length > 0, `grup ${g.title} valid`);
  for (const s of g.shortcuts) assert.ok(Array.isArray(s.keys) && s.keys.length > 0 && s.desc, `pintasan ${s.desc} valid`);
}
pass++;

console.log(`keymap: ${pass} assertions PASS`);
