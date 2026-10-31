#!/usr/bin/env node
/**
 * Test gating layout scroll daftar pesan.
 *
 * Regresi yang dicegah:
 *   Wrapper <PullToRefresh> dipasang sebagai anak <div flex flex-col> dengan
 *   kelas "relative h-full", sementara inner list memakai "flex-1" —
 *   kombinasi ini membuat inner TIDAK lagi menjadi flex item → height auto →
 *   overflow-y-auto mati → INBOX TIDAK BISA DISCROLL.
 *
 * Kontrak layout yang harus terpenuhi:
 *   1. Wrapper PullToRefresh: "relative flex-1 min-h-0"
 *   2. Inner list (listRef)  : "absolute inset-0 overflow-y-auto"
 */

import fs from 'node:fs';
import path from 'node:path';

const mailPage = fs.readFileSync(
  path.resolve('src/pages/MailPage.jsx'),
  'utf8',
);

let ok = true;

// ── 1. Wrapper PullToRefresh ──────────────────────────────────────────────────
const ptrClass = /className=`?["`]relative\s+flex-1\s+min-h-0["`]/.test(mailPage);
if (!ptrClass) {
  console.error('❌ PullToRefresh wrapper harus "relative flex-1 min-h-0"');
  ok = false;
} else {
  console.log('✅ PullToRefresh wrapper = relative flex-1 min-h-0');
}

// Pastikan kelas lama yang merusak tidak kembali
if (/relative\s+h-full(?![^\n]*flex)/.test(mailPage)) {
  console.error('❌ Ditemukan wrapper "relative h-full" — pola yang memecah scroll!');
  ok = false;
}

// ── 2. Inner list absolute inset ──────────────────────────────────────────────
const absList =
  /ref=\{listRef\}\s*className=["`](absolute\s+inset-0\s+overflow-y-auto)["`]/.test(mailPage) ||
  /className=["`]absolute\s+inset-0\s+overflow-y-auto["`]\s*\n?\s*ref=\{listRef\}/.test(mailPage);
if (!absList) {
  console.error('❌ List utama harus "absolute inset-0 overflow-y-auto" (listRef)');
  ok = false;
} else {
  console.log('✅ Inner list = absolute inset-0 overflow-y-auto');
}

// ── 3. PullToRefresh hanya punya SATU pemakaian di MailPage (konsistensi) ────
const usages = (mailPage.match(/<PullToRefresh\b/g) || []).length;
if (usages !== 1) {
  console.error(`❌ Pemakaian <PullToRefresh> tidak sesuai harapan: ${usages}`);
  ok = false;
}

process.exit(ok ? 0 : 1);
