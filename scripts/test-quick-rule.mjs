// "Buat aturan dari pesan ini" — prefill murni (buildRuleFromMessage & kondisi
// cepat) + kontrak statis: QuickRuleModal & RulesPage memakai RuleEditor yang SAMA.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildRuleFromMessage, quickRuleContext, quickRuleOptions, quickConditionState,
  toggleQuickCondition, validateRule, toSogoFilter, emptyCondition,
} from '../src/lib/sieveFilters.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const vals = (r) => r.conditions.map((c) => [c.field, c.operator, c.value]);
const ME = 'Anas.Fikri@pcpexpress.com';

// ── Alamat pengirim: alamat email, bukan nama tampilan ─────────────────────
eq(quickRuleContext({ from: 'Budi Santoso <Budi@Contoh.co.id>' }, ME).senderEmail, 'budi@contoh.co.id', 'Nama <a@b> → alamat (lowercase)');
eq(quickRuleContext({ from: 'Budi Santoso <budi@contoh.co.id>' }, ME).senderName, 'Budi Santoso', 'nama pengirim');
const quoted = quickRuleContext({ from: '"Doe, John" <john@x.com>' }, ME);
eq([quoted.senderName, quoted.senderEmail], ['Doe, John', 'john@x.com'], 'nama berkutip dgn koma');
eq(quickRuleContext({ from: "'Eko Budi' <eko@x.com>" }, ME).senderName, 'Eko Budi', 'kutip tunggal dibuang');
eq(quickRuleContext({ from: 'plain@x.com' }, ME).senderEmail, 'plain@x.com', 'alamat polos');
eq(quickRuleContext({ from: [{ name: 'Obj', email: 'obj@x.com' }] }, ME).senderEmail, 'obj@x.com', 'bentuk objek SOGo');
eq(quickRuleContext({ from: 'Unknown Sender' }, ME).senderEmail, '', 'tanpa alamat → kosong');

// ── Normalisasi subjek ─────────────────────────────────────────────────────
eq(quickRuleContext({ subject: 'Re: Fwd: RE: Laporan Q3' }, ME).subject, 'Laporan Q3', 'Re:/Fwd: berulang dibuang, kapitalisasi tetap');
eq(quickRuleContext({ subject: 'FW: Undangan' }, ME).subject, 'Undangan', 'FW:');
eq(quickRuleContext({}, ME).subject, '', 'subjek kosong');

// ── Default: Dari <alamat> → Pindahkan (folder kosong → validasi meminta) ─
const msg = { from: 'Budi Santoso <budi@contoh.co.id>', to: ME, subject: 'Re: Proyek A' };
const def = buildRuleFromMessage(msg, { userEmail: ME });
eq(vals(def), [['from', 'contains', 'budi@contoh.co.id']], 'default hanya kondisi Dari (alamat)');
eq(def.name, 'Dari Budi Santoso', 'nama default "Dari <nama pengirim>"');
eq(def.match, 'all', 'semua kondisi');
eq(def.actions, [{ type: 'fileinto', argument: '' }], 'aksi default Pindahkan ke folder');
ok(validateRule(def).some((e) => /pilih folder tujuan/.test(e)), 'folder kosong → validasi meminta folder');
ok(validateRule({ ...def, actions: [{ type: 'fileinto', argument: 'Archive' }] }).length === 0, 'valid setelah folder dipilih');
eq(buildRuleFromMessage({ from: 'x@y.com' }, { userEmail: ME }).name, 'Dari x@y.com', 'tanpa nama → alamat');
eq(buildRuleFromMessage({ from: 'Unknown Sender' }, { userEmail: ME }).name, 'Aturan baru', 'pengirim tak dikenal');
eq(vals(buildRuleFromMessage({ from: 'Unknown Sender' }, { userEmail: ME })), [['from', 'contains', '']], 'pengirim tak dikenal → kondisi kosong (diisi user)');

// ── Opsi: subjek, kepada saya, cc ke saya ─────────────────────────────────
const withSubj = buildRuleFromMessage(msg, { userEmail: ME, options: { subject: true } });
eq(vals(withSubj), [['from', 'contains', 'budi@contoh.co.id'], ['subject', 'contains', 'Proyek A']], 'subjek dinormalisasi');
const me = ME.toLowerCase();
eq(vals(buildRuleFromMessage(msg, { userEmail: ME, options: { toMe: true } }))[1], ['to', 'contains', me], 'Kepada saya');
eq(vals(buildRuleFromMessage(msg, { userEmail: ME, options: { ccMe: true } }))[1], ['cc', 'contains', me], 'Cc ke saya');
const both = buildRuleFromMessage(msg, { userEmail: ME, options: { toMe: true, ccMe: true } });
eq(vals(both), [['from', 'contains', 'budi@contoh.co.id'], ['to_or_cc', 'contains', me]], 'Kepada+Cc → satu kondisi "Kepada atau Cc" (bukan AND)');
eq(quickConditionState(both, quickRuleContext(msg, ME)), { from: true, subject: false, toMe: true, ccMe: true }, 'state centang dari model');

// ── Toggle: tambah/hapus tanpa merusak kondisi lain ───────────────────────
const ctx = quickRuleContext(msg, ME);
let r = toggleQuickCondition(both, 'ccMe', false, ctx);
eq(vals(r)[1], ['to', 'contains', me], 'hapus Cc dari "Kepada atau Cc" → tinggal Kepada');
r = toggleQuickCondition(r, 'toMe', false, ctx);
eq(vals(r), [['from', 'contains', 'budi@contoh.co.id']], 'hapus Kepada');
r = toggleQuickCondition(r, 'from', false, ctx);
eq(vals(r), [['from', 'contains', '']], 'kondisi terakhir dihapus → placeholder kosong');
r = toggleQuickCondition(r, 'subject', true, ctx);
eq(vals(r), [['subject', 'contains', 'Proyek A']], 'placeholder kosong diganti saat menambah');
const custom = { ...def, conditions: [...def.conditions, { ...emptyCondition('size'), value: '500' }] };
r = toggleQuickCondition(custom, 'from', false, ctx);
eq(vals(r), [['size', 'over', '500']], 'kondisi kustom user dipertahankan');
eq(toggleQuickCondition(def, 'from', true, ctx), def, 'toggle on yg sudah ada → idempoten');
const noMe = quickRuleContext(msg, '');
eq(quickRuleOptions(noMe).map((o) => o.id), ['from', 'subject'], 'tanpa email akun → opsi Kepada/Cc disembunyikan');
eq(quickRuleOptions(ctx).map((o) => o.id), ['from', 'subject', 'toMe', 'ccMe'], 'opsi lengkap');
ok(quickRuleOptions(ctx)[0].label.includes('budi@contoh.co.id'), 'label Dari memuat alamat');

// ── Format SOGo hasil prefill ─────────────────────────────────────────────
const sogo = toSogoFilter({ ...both, actions: [{ type: 'fileinto', argument: 'INBOX/Proyek' }] });
eq(sogo.rules, [
  { field: 'from', operator: 'contains', value: 'budi@contoh.co.id' },
  { field: 'to_or_cc', operator: 'contains', value: me },
], 'rules SOGo');

// ── Kontrak statis: satu RuleEditor dipakai dua tempat ────────────────────
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const quick = read('src/components/mailer/QuickRuleModal.jsx');
const page = read('src/pages/RulesPage.jsx');
const editor = read('src/components/rules/RuleEditor.jsx');
const mail = read('src/pages/MailPage.jsx');
ok(quick.includes("import RuleEditor from '../rules/RuleEditor'"), 'QuickRuleModal mengimpor RuleEditor bersama');
ok(page.includes("import RuleEditor from '../components/rules/RuleEditor'"), 'RulesPage mengimpor RuleEditor bersama');
ok(!/function RuleEditor/.test(page) && !/function RunNowDialog/.test(page), 'RulesPage tidak lagi punya salinan lokal');
ok(quick.includes("import RunNowDialog from '../rules/RunNowDialog'") && quick.includes('initialFolderPath={sourcePath}'), 'QuickRuleModal: Jalankan sekarang di folder pesan');
ok(quick.includes('title="Buat aturan dari pesan ini"'), 'judul Outlook-style');
ok(quick.includes('Aturan baru ditempatkan paling bawah') && quick.includes('[...current, toSogoFilter(rule)]'), 'aturan baru di akhir daftar server');
ok(quick.includes("toast.success('Aturan tersimpan di server')") && quick.includes('Jalankan juga pada email lama di folder ini?'), 'toast + tawaran jalankan');
ok(editor.includes('Berhenti memproses aturan lain') && editor.includes('Pratinjau'), 'editor bersama lengkap');
ok(mail.includes('message={quickRuleMsg}') && mail.includes("id: 'createRule', label: 'Buat aturan…'"), 'MailPage: kirim pesan utuh + item menu konteks');
// Hooks sebelum early-return: QuickRuleModal luar tanpa hook.
const outer = quick.slice(quick.indexOf('export default function QuickRuleModal'), quick.indexOf('function QuickRuleFlow'));
ok(!/use[A-Z]\w*\(/.test(outer), 'QuickRuleModal luar tanpa hook sebelum early return');

console.log(`quick rule from message: ${n} assertions PASS ✅`);
