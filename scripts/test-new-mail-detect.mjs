// Regresi 2026-10-14: notifikasi "email baru" palsu saat email ditandai
// belum-dibaca (unseen naik tanpa email masuk) atau setelah satu poll gagal.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { maxUidOf, isNewMailArrival, pickNewestArrival } from '../src/lib/newMail.js';

// maxUidOf: angka/string, abaikan sampah; kosong → null.
assert.equal(maxUidOf([2390, '2392', 2391]), 2392);
assert.equal(maxUidOf([]), null);
assert.equal(maxUidOf(undefined), null);
assert.equal(maxUidOf(['x', -1, 0]), null);

const base = { prevUnseen: 10, prevMaxUid: 2392 };
// Email baru masuk: UID naik + unseen naik → notifikasi.
assert.equal(isNewMailArrival({ ...base, unseen: 11, maxUid: 2393 }), true);
// Tandai belum-dibaca (di tab ini / tab lain / Outlook / HP): unseen naik, UID tetap → BUKAN email baru.
assert.equal(isNewMailArrival({ ...base, unseen: 11, maxUid: 2392 }), false);
// Poll gagal (unseen 0, maxUid null) lalu normal lagi (0 → 10): UID tetap → bukan email baru.
assert.equal(isNewMailArrival({ prevUnseen: 0, prevMaxUid: 2392, unseen: 10, maxUid: 2392 }), false);
assert.equal(isNewMailArrival({ ...base, unseen: 11, maxUid: null }), false, 'maxUid tak diketahui → jangan notif');
// Email masuk tapi langsung dibaca di klien lain (unseen tidak naik) → tidak perlu notif.
assert.equal(isNewMailArrival({ ...base, unseen: 10, maxUid: 2393 }), false);
// Poll pertama (belum ada pembanding) → tidak notif.
assert.equal(isNewMailArrival({ prevUnseen: null, prevMaxUid: null, unseen: 5, maxUid: 2393 }), false);

// pickNewestArrival: hanya pesan dgn UID > UID tertinggi lama; null → teks umum.
const list = [{ uid: '2392', from: 'lama' }, { uid: 2394, from: 'baru-2' }, { uid: '2393', from: 'baru-1' }];
assert.equal(pickNewestArrival(list, 2392).from, 'baru-2');
assert.equal(pickNewestArrival([{ uid: 2392, from: 'lama' }], 2392), null, 'daftar belum ter-refresh → jangan pakai pengirim lama');
assert.equal(pickNewestArrival(list, null), null);

// Kontrak sumber: MailPage memakai deteksi berbasis UID, bukan unseen saja.
const mail = readFileSync(new URL('../src/pages/MailPage.jsx', import.meta.url), 'utf8');
assert.ok(mail.includes('isNewMailArrival({'), 'deteksi memakai isNewMailArrival');
assert.ok(!/const isNewEmail = prev !== null && unseenCount > prev/.test(mail), 'deteksi lama (unseen naik saja) sudah dihapus');
assert.ok(mail.includes('pickNewestArrival(messagesInWindow, pending.prevMaxUid)'), 'isi notif dari pesan yang benar-benar baru');
const api = readFileSync(new URL('../src/lib/api.js', import.meta.url), 'utf8');
assert.ok(api.includes('maxUid: maxUidOf(data?.uids)'), 'getUnseenCount mengembalikan maxUid');

console.log('new-mail-detect: all assertions passed');
