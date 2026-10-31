/**
 * test-state-combination.mjs — Regresi bug kombinasi (pass 6+ rotasi fokus):
 *
 * 1. Multi-akun: query key React Query tanpa identitas user → cache global di
 *    tab bisa menampilkan data akun SEBELUMNYA (mis. countdown sesi SMTP).
 *    Assert: Sidebar memakai queryKey yang di-scope per user.
 *
 * 2. Konflik state antar UI: MessageReader tetap ter-mount di belakang
 *    ComposeModal (flow reply) — shortcut keyboard reader ('r'/'f'/'s'/
 *    Delete/Escape) tidak boleh aktif saat compose terbuka.
 *    Assert: prop `shortcutsEnabled` ada di komponen + di-pass dari MailPage
 *    dengan nilai `!composeOpen` + guard di dalam handler.
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

// ── 1. Scoping query key per akun (multi-account) ────────────────────────────
const sidebar = read('src/components/layout/Sidebar.jsx');

ok(sidebar.includes("queryKey: ['smtp-session-status', user?.sogoToken]"),
  'Sidebar: queryKey smtp-session-status di-scope per sogoToken (tidak ada cache antar akun)');

// Pastikan tidak ada query lain di Sidebar yang tanpa scope user
const smtpQuery = sidebar.match(/queryKey: \[[^\]]+\]/g) || [];
for (const q of smtpQuery) {
  ok(q.includes('user') || q.includes('sogoToken') || q.includes('email'),
    `Sidebar: query key ${q} memuat identitas user`);
}

// ── 2. Konflik shortcut reader vs compose modal ──────────────────────────────
const reader = read('src/components/mailer/MessageReader.jsx');
const mail = read('src/pages/MailPage.jsx');

ok(reader.includes('shortcutsEnabled = true'),
  'MessageReader: prop shortcutsEnabled dengan default true');
ok(reader.includes('if (!shortcutsEnabled) return;'),
  'MessageReader: handler shortcut skip saat shortcutsEnabled=false');
ok(reader.includes('[msg, deleteMutation.isPending, shortcutsEnabled, lightbox]'),
  'MessageReader: shortcutsEnabled + lightbox ada di dependency array handler (Esc tutup lightbox dulu)');
ok(mail.includes('shortcutsEnabled={!composeOpen}'),
  'MailPage: reader menerima shortcutsEnabled={!composeOpen} (matikan di belakang modal)');

// Sanity: ComposeModal memang dirender bersama reader di MailPage (alur reply)
ok(mail.includes('<ComposeModal') && mail.includes('<MessageReader'),
  'MailPage: ComposeModal & MessageReader bisa ter-mount bersamaan (konteks bug)');

console.log(`\nState-combination: ${pass} assertions PASS ✅`);
