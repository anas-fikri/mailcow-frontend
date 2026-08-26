/**
 * test-contact-signature-edge.mjs — Edge case:
 *  1. Duplikat kontak GAL vs personal (findDuplicateKind + guard UI)
 *  2. Reconcile signature multi-device (shouldImportSogoSignature + PreferencesPage)
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findDuplicateKind, parseContactRow } from '../src/lib/contactUtils.js';
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

// ── 1b. parseContactRow: normalisasi field object/non-string ────────────────
// SOGo kadang mengembalikan c_cn/c_mail/emails sebagai object → tanpa
// normalisasi, `.toLowerCase()` di search / render React crash.
const cols = ['c_cn', 'c_mail', 'emails', 'c_telephonenumber', 'c_o', 'id', 'containerName', 'sourceID'];

const normal = parseContactRow(cols, ['Budi', 'budi@x.com', ['budi@x.com'], '+62', 'PCP', 'card-1', 'personal', 'src-1']);
assert.equal(normal.name, 'Budi', 'c_cn string → name');
assert.equal(normal.email, 'budi@x.com', 'c_mail string → email');
assert.equal(normal.phone, '+62', 'telepon string');
assert.equal(normal.org, 'PCP', 'org string');
assert.equal(normal.uid, 'card-1', 'uid dari id');
assert.equal(normal.isGAL, false, 'personal → bukan GAL');
pass += 6;

// Object di c_cn/c_mail (bukan string) — tidak boleh crash/leak object.
const obj = parseContactRow(cols, [{ label: 'Ani' }, { value: 'ani@x.com' }, [{ value: 'ani@x.com' }], null, null, 'card-2', 'GAL directory', '']);
assert.equal(typeof obj.name, 'string', 'c_cn object → string (bukan object)');
assert.equal(typeof obj.email, 'string', 'c_mail object → string');
assert.equal(obj.isGAL, true, 'containerName GAL → isGAL');
pass += 3;

// emails array of object (tanpa c_mail) → ambil email pertama.
const multi = parseContactRow(['c_cn', 'emails', 'id', 'containerName'], ['Cici', [{ email: 'cici@x.com' }], 'card-3', 'personal']);
assert.equal(multi.email, 'cici@x.com', 'emails array-of-object → email pertama');
assert.equal(multi.phone, '', 'phone kosong → string kosong');
pass += 2;

// Baris rusak (non-array) → null.
assert.equal(parseContactRow(cols, null), null, 'baris null → null');
assert.equal(parseContactRow(cols, 'rusak'), null, 'baris string → null');
pass += 2;

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
ok(contacts.includes('const savingRef = useRef(false)'), 'ContactsPage punya savingRef (anti double-submit create)');
ok(contacts.includes('if (savingRef.current) return;'), 'handleAddContact guard re-entry');

const api = fs.readFileSync(path.join(ROOT, 'src/lib/api.js'), 'utf8');
ok(api.includes('parseContactRow'), 'api.js pakai parseContactRow utk kontak');

console.log(`\nContact-signature-edge: ${pass} assertions PASS ✅`);
