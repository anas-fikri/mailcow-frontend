// Regresi 2026-10-29: auto-reply terkirim KOSONG — form menyimpan ke field
// yang tidak dibaca SOGo (text/subject) alih-alih autoReplyText/customSubject.
process.env.TZ = 'Asia/Jakarta';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const V = await import('../src/lib/vacation.js');

// Tanggal lokal (WIB) — tidak mundur sehari seperti toISOString() lama.
const e = V.dateInputToEpoch('2026-11-02');
assert.equal(V.epochToDateInput(e), '2026-11-02');
assert.equal(new Date(e * 1000).getHours(), 0, 'tengah malam lokal (pola SOGo beginOfDay)');
assert.equal(V.dateInputToEpoch(''), null);
assert.equal(V.epochToDateInput('x'), '');

// Payload memakai field SOGo yang benar; field lama dibuang; field asing dipertahankan.
const old = { enabled: '1', text: 'lama', subject: 'subj lama', autoReplyEmailAddresses: ['a@x.id'], ignoreLists: '0', alwaysSend: 1 };
const p = V.buildVacationPayload(old, { enabled: true, message: 'Saya cuti.', subject: 'Cuti', startDate: '2026-11-02', endDate: '2026-11-05' }, 'a@x.id');
assert.equal(p.autoReplyText, 'Saya cuti.', 'isi pesan → autoReplyText');
assert.equal(p.customSubject, 'Cuti');
assert.equal(p.customSubjectEnabled, 1);
assert.equal(p.enabled, 1);
assert.ok(!('text' in p) && !('subject' in p), 'field lama yang salah dibuang');
assert.equal(p.endDateEnabled, 1, 'tanggal selesai kini berlaku (endDateEnabled)');
assert.equal(p.startDateEnabled, 1);
assert.equal(typeof p.startDate, 'number');
assert.equal(p.daysBetweenResponse, 7);
assert.deepEqual(p.autoReplyEmailAddresses, ['a@x.id']);
assert.equal(p.ignoreLists, '0', 'setelan yang ada dipertahankan');
assert.equal(p.alwaysSend, 1, 'field SOGo lain dipertahankan');

// Subjek kosong → pakai subjek bawaan SOGo; tanggal kosong → flag dihapus.
const p2 = V.buildVacationPayload({ startDate: 1, startDateEnabled: 1, endDate: 2, endDateEnabled: 1 }, { enabled: true, message: 'x', subject: '  ', startDate: '', endDate: '' }, 'b@x.id');
assert.equal(p2.customSubjectEnabled, 0);
assert.ok(!('customSubject' in p2));
assert.ok(!('startDateEnabled' in p2) && !('endDate' in p2));
assert.deepEqual(p2.autoReplyEmailAddresses, ['b@x.id'], 'alamat default = email user');

// Baca: format baru diutamakan, fallback ke data lama.
assert.equal(V.readVacationForm({ enabled: 1, autoReplyText: 'baru', text: 'lama' }).message, 'baru');
assert.equal(V.readVacationForm({ enabled: '1', text: 'lama', subject: 's' }).message, 'lama');
assert.equal(V.readVacationForm({ enabled: '1', text: 'lama', subject: 's' }).subject, 's');
assert.equal(V.readVacationForm({ endDate: e }).endDate, '', 'endDate tanpa endDateEnabled tidak dianggap aktif');

// Validasi.
assert.deepEqual(V.validateVacationForm({ enabled: true, message: '  ' }), ['Isi pesan auto-reply wajib diisi.']);
assert.equal(V.validateVacationForm({ enabled: true, message: 'x', startDate: '2026-11-05', endDate: '2026-11-02' }).length, 1);
assert.deepEqual(V.validateVacationForm({ enabled: false, message: '' }), []);

// Deteksi data rusak (kasus imawati/nidia: aktif, autoReplyText kosong, text berisi).
assert.equal(V.needsVacationRepair({ enabled: '1', text: 'isi' }), true);
assert.equal(V.needsVacationRepair({ enabled: '1', text: 'isi', autoReplyText: 'isi' }), false);
assert.equal(V.needsVacationRepair({ enabled: '0', text: 'isi' }), false);
assert.equal(V.needsVacationRepair({ enabled: 1, text: '' }), false);

// Kontrak sumber: form & perbaikan otomatis memakai helper ini.
const pref = readFileSync(new URL('../src/pages/PreferencesPage.jsx', import.meta.url), 'utf8');
assert.ok(pref.includes('buildVacationPayload(fresh.Vacation, form, user.email)'), 'form menyimpan via buildVacationPayload dari Vacation SERVER segar');
assert.ok(!/text:\s+message,/.test(pref), 'form tidak lagi menulis Vacation.text');
const api = readFileSync(new URL('../src/lib/api.js', import.meta.url), 'utf8');
assert.ok(api.includes('export async function repairVacationIfNeeded'), 'perbaikan otomatis tersedia');
const layout = readFileSync(new URL('../src/components/layout/AppLayout.jsx', import.meta.url), 'utf8');
assert.ok(layout.includes('repairVacationIfNeeded(token, email)'), 'dipanggil saat app start');

console.log('vacation: all assertions passed');
