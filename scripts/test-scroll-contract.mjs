#!/usr/bin/env node
/**
 * Test gating kontrak layout scroll seluruh halaman utama webmail.
 *
 * Mencegah regresi "container scroll kehilangan definite height" yang sempat
 * mematikan scroll inbox (PullToRefresh 'relative h-full' breaking flex-child).
 *
 * Kontrak yang diperiksa:
 *   ROOT layout harus "flex h-full overflow-hidden" (dengan h-full + overflow
 *   utk mengurung). Scroll-container utama harus AKHIRNYA berujung pada kontrak
 *   tinggi yang terbukti berfungsi: parent flex-col + anak flex-1 overflow +
 *   (min-h-0/min-w-0 :: penting utk NON-scroll flex child yg menampung anak
 *   scroll) ATAU absolute-inset + overflow.
 */

import fs from 'node:fs';
import path from 'node:path';

const read = (p) => fs.readFileSync(path.resolve(p), 'utf8');

const FILES = {
  'MailPage':        'src/pages/MailPage.jsx',
  'CalendarPage':    'src/pages/CalendarPage.jsx',
  'ContactsPage':    'src/pages/ContactsPage.jsx',
  'MessageReader':   'src/components/mailer/MessageReader.jsx',
};

let ok = true;

// Kontrak inti yang harus ADA di setiap halaman (bebas urutan):
//  - baik "absolute inset-0 overflow-y-auto" (scroll harus jalan walau struktur
//    berubah)
//  - ATAU pola flex-col + min-h-0 di parent pembungkus scroll-container.
function assertScrollOk(file, src, label) {
  const sub1 = /absolute\s+inset-0\s+overflow-y-auto/.test(src);
  const sub2 = /flex-1\s+overflow-y-auto/.test(src) && /min-h-0/.test(src);
  if (!sub1 && !sub2) {
    console.error(`✗ ${label}: tidak ada kontrak scroll tinggi terbukti utk daftar utama.`);
    ok = false;
  } else {
    console.log(`✓ ${label}: scroll kontrak OK`);
  }
}

for (const [label, p] of Object.entries(FILES)) {
  const src = read(p);
  assertScrollOk(p, src, label);
}

// MailPage spesifik: pastikan wrapper PullToRefresh memakai flex-1 min-h-0
const mp = read(FILES['MailPage']);
if (!/relative\s+flex-1\s+min-h-0/.test(mp)) {
  console.error('✗ MailPage: PullToRefresh wrapper harus "relative flex-1 min-h-0".');
  ok = false;
} else {
  console.log('✓ MailPage: PullToRefresh wrapper OK (relative flex-1 min-h-0)');
}

// Larangan regresi: "relative h-full" sebagai flex wrapper (yang memecah scroll)
for (const [label, p] of Object.entries(FILES)) {
  const src = read(p);
  if (/className={`?"relative\s+h-full/.test(src)) {
    console.error(`✗ ${label}: larangan "relative h-full" sebagai flex wrapper terlanggar.`);
    ok = false;
  }
}

process.exit(ok ? 0 : 1);