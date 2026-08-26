/**
 * test-contact-signature-edge.mjs — Edge case:
 *  1. Duplikat kontak GAL vs personal (findDuplicateKind + guard UI)
 *  2. Reconcile signature multi-device (shouldImportSogoSignature + PreferencesPage)
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findDuplicateKind } from '../src/lib/contactUtils.js';
import { shouldImportSogoSignature } from '../src/lib/signatures.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let pass = 0;
const ok = (cond, name) => { assert.ok(cond, name); pass++; console.log(`  ✓ ${name}`); };

// ── 1. findDuplicateKind ─────────────────────────────────────────────────────
const list = [
  { email: 'A@X.com', isGAL: true },
  { email: 'b@x.com', isGAL: false },
  { email: 'c@x.com', isGAL: false },
];

assert.equal(findDuplicateKind(list, 'a@x.com'), 'gal', 'duplikat di GAL → gal');
pass++;
assert.equal(findDuplicateKind(list, 'B@X.com'), 'personal', 'duplikat di personal (case-insensitive) → personal');
pass++;
assert.equal(findDuplicateKind(list, 'none@x.com'), null, 'email baru → null');
pass++;
assert.equal(findDuplicateKind(list, ''), null, 'email kosong → null');
pass++;
assert.equal(findDuplicateKind(null, 'a@x.com'), null, 'list null → null');
pass++;

// Prioritas: email ada di GAL DAN personal → personal (duplikat nyata)
assert.equal(findDuplicateKind([{ email: 'd@x.com', isGAL: true }, { email: 'D@X.com', isGAL: false }], 'd@x.com'), 'personal', 'GAL+personal → personal lebih prioritas');
pass++;

// ── 2. shouldImportSogoSignature ─────────────────────────────────────────────
const sigs = [{ id: 's1', name: 'Sig', html: '  <p>Halo</p>  ' }];

assert.equal(shouldImportSogoSignature(sigs, '<p>Halo</p>'), false, 'html yang sama (trim) → jangan impor (idempotent)');
pass++;
assert.equal(shouldImportSogoSignature(sigs, ''), false, 'SOGo kosong → jangan impor');
pass++;
assert.equal(shouldImportSogoSignature(sigs, null), false, 'SOGo null → jangan impor');
pass++;
assert.equal(shouldImportSogoSignature(sigs, '<p>Versi Baru</p>'), true, 'html beda (sync perangkat lain) → impor');
pass++;
assert.equal(shouldImportSogoSignature([], '<p>X</p>'), true, 'list kosong + SOGo ada → impor');
pass++;
assert.equal(shouldImportSogoSignature(undefined, '<p>X</p>'), true, 'list undefined → impor');
pass++;

// ── 3. Static source checks ──────────────────────────────────────────────────
const prefs = fs.readFileSync(path.join(ROOT, 'src/pages/PreferencesPage.jsx'), 'utf8');
ok(prefs.includes('shouldImportSogoSignature'), 'PreferencesPage mengimpor shouldImportSogoSignature');
ok(prefs.includes("addSignature(email, 'Signature SOGo', savedSogo)"), 'PreferencesPage menarik signature SOGo antar perangkat');
ok(prefs.includes("if (local.list.length === 0)"), 'migrasi signature pertama dipertahankan');

const contacts = fs.readFileSync(path.join(ROOT, 'src/pages/ContactsPage.jsx'), 'utf8');
ok(contacts.includes('findDuplicateKind'), 'ContactsPage memakai findDuplicateKind');
ok(contacts.includes("Kontak dengan email ini sudah ada di kontak pribadi."), 'duplikat personal diblokir dgn pesan jelas');
ok(contacts.includes('contact.uid ? contact.uid === selected.uid : contact === selected'), 'highlight seleksi aman utk uid kosong');

console.log(`\nContact-signature-edge: ${pass} assertions PASS ✅`);
