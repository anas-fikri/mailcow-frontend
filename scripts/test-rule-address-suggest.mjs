import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAddressSuggestions } from '../src/lib/ruleAddressSuggest.js';

const me = 'anas.fikri@pcpexpress.com';
const contacts = [{ name: 'Bayu Gunawan', email: 'Bayu.Gunawan@pcpexpress.com' }, { c_cn: 'Ine', c_mail: 'ine@pcpexpress.com' }];
const history = [{ name: 'Nadya', email: 'nadya.adriany@pcpexpress.com' }];
const seen = [
  { from: 'Linode Alerts <noreply@linode.com>', to: me, cc: '' },
  { from: 'Linode Alerts <noreply@linode.com>', to: me, cc: "'Eko Budi' <eko@pcpexpress.com>" },
  { from: 'Ine <ine@pcpexpress.com>', to: `'Anas Fikri' <${me}>, usep@pcpexpress.com`, cc: '' },
];
const base = { accountEmail: me, contacts, history, seen };

// Dari: pengirim yang sering muncul didahulukan; diri sendiri tidak di atas.
const from = buildAddressSuggestions({ ...base, field: 'from', query: '' });
assert.equal(from[0].email, 'noreply@linode.com', 'pengirim paling sering muncul pertama');
assert.ok(from.findIndex((s) => s.email === me) > 0, 'alamat sendiri tidak diprioritaskan utk Dari');

// Kepada/Cc: alamat sendiri + penerima riwayat didahulukan.
const to = buildAddressSuggestions({ ...base, field: 'to', query: '' });
assert.equal(to[0].email, me, 'alamat sendiri teratas utk Kepada');
assert.equal(to[0].hint, 'Saya');
assert.ok(to.slice(0, 3).some((s) => s.email === 'nadya.adriany@pcpexpress.com'), 'penerima riwayat di atas');

// Filter query: nama atau alamat, case-insensitive, tanpa duplikat, lowercase.
const q = buildAddressSuggestions({ ...base, field: 'cc', query: 'BAYU' });
assert.deepEqual(q.map((s) => s.email), ['bayu.gunawan@pcpexpress.com']);
assert.equal(q[0].name, 'Bayu Gunawan');
assert.equal(q[0].hint, 'Kontak');
const eko = buildAddressSuggestions({ ...base, field: 'to_or_cc', query: 'eko' });
assert.equal(eko[0].name, 'Eko Budi', 'kutip pembungkus nama dibuang (parseAddressList)');
const all = buildAddressSuggestions({ ...base, field: 'to', query: '', limit: 50 }).map((s) => s.email);
assert.equal(new Set(all).size, all.length, 'tanpa duplikat');
assert.ok(all.every((e) => e === e.toLowerCase()), 'alamat dinormalisasi lowercase');
assert.equal(buildAddressSuggestions({ ...base, field: 'from', query: 'zzz-tidak-ada' }).length, 0);
assert.equal(buildAddressSuggestions({ ...base, field: 'from', query: '', limit: 2 }).length, 2, 'limit dihormati');

// Kontrak: RuleEditor memakai AddressValueInput utk kolom alamat.
const editor = readFileSync(new URL('../src/components/rules/RuleEditor.jsx', import.meta.url), 'utf8');
assert.ok(editor.includes("fieldKind(c.field) === 'address' ? (") && editor.includes('<AddressValueInput'), 'kolom alamat memakai combobox saran');
const comp = readFileSync(new URL('../src/components/rules/AddressValueInput.jsx', import.meta.url), 'utf8');
assert.ok(comp.includes('role="combobox"') && comp.includes('role="listbox"') && comp.includes('aria-activedescendant'), 'combobox aksesibel');
assert.ok(comp.includes("queryKey: ['contacts', token]"), 'berbagi cache kontak dengan Compose');

console.log('rule-address-suggest: all assertions passed');
