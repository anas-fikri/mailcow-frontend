// ── Unit test: src/lib/constants.js (isReaderOwnedShortcut) ─────────────────
// Regresi: saat MessageReader terbuka, MailPage DAN MessageReader sama-sama
// listen keydown global → tekan 's' toggle flag DUA kali (net nol + 2 request),
// 'r'/'f' membuka compose dua kali. Guard ini menyerahkan key ke reader.
import assert from 'node:assert';
import { isReaderOwnedShortcut, READER_OWNED_KEYS } from '../src/lib/constants.js';

// Saat reader terbuka → s/r/f diserahkan ke MessageReader (skip di MailPage)
assert.equal(isReaderOwnedShortcut(123, 's'), true, 'reader terbuka + s → skip MailPage'); 
assert.equal(isReaderOwnedShortcut(123, 'r'), true, 'reader terbuka + r → skip MailPage'); 
assert.equal(isReaderOwnedShortcut(123, 'f'), true, 'reader terbuka + f → skip MailPage'); 
assert.equal(isReaderOwnedShortcut(123, 'S'), true, 'huruf besar dinormalisasi'); 

// Saat reader TIDAK terbuka → MailPage tetap menangani (j/k di daftar, dll)
assert.equal(isReaderOwnedShortcut(null, 's'), false, 'tanpa reader + s → MailPage handle'); 
assert.equal(isReaderOwnedShortcut(undefined, 'r'), false, 'tanpa reader + r → MailPage handle'); 
assert.equal(isReaderOwnedShortcut(0, 's'), false, 'reader id 0 dianggap tertutup'); 

// 'u' (tandai belum dibaca pesan terbuka) juga milik reader sejak Outlook-UX
assert.equal(isReaderOwnedShortcut(123, 'u'), true, 'reader terbuka + u → skip MailPage');

// Key lain tidak terpengaruh saat reader terbuka
assert.equal(isReaderOwnedShortcut(123, 'j'), false, 'j tetap MailPage (navigasi)');
assert.equal(isReaderOwnedShortcut(123, 'k'), false, 'k tetap MailPage');
assert.equal(isReaderOwnedShortcut(123, 'x'), false, 'x tetap MailPage (tandai baca)');
assert.equal(isReaderOwnedShortcut(123, ''), false, 'key kosong → false');
assert.equal(isReaderOwnedShortcut(123, null), false, 'key null → false');

// Kontrak: konstanta berisi tepat s/r/f/u
assert.deepEqual([...READER_OWNED_KEYS].sort(), ['f', 'r', 's', 'u'], 'READER_OWNED_KEYS = [s,r,f,u]');

console.log('keyboard-ownership assertions passed');
