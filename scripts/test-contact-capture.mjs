// Test: auto-capture kontak eksternal setelah kirim sukses (pola Gmail).
//
// Kontrak (src/lib/contactCapture.js + chokepoint api.js sendMessage):
// 1. pickExternalContacts: hanya penerima valid, bukan diri sendiri, bukan
//    alamat layanan (no-reply/daemon/bounce/postmaster), unik
//    case-insensitive; nama "Budi <budi@x>" diekstrak.
// 2. filterKnownContacts: kandidat yang sudah ada di kontak (Personal ATAU
//    GAL, case-insensitive) dibuang; daftar kontak rusak di-toleransi.
// 3. Chokepoint api.js sendMessage (jalur SOGo langsung): setelah sukses,
//    fetchContacts dipanggil lalu createContact guid-flow HANYA untuk alamat
//    eksternal yang belum dikenal; kegagalan createContact tidak menggagalkan
//    kirim (sendMessage tetap resolve {ok:true}); alamat self/no-reply
//    tidak pernah dicatat.

import assert from 'node:assert/strict';

import { pickExternalContacts, filterKnownContacts, isAutoContactCandidate } from '../src/lib/contactCapture.js';

const api = await import('../src/lib/api.js');
const { _waitForContactCaptures } = api;

// ── 1. pickExternalContacts: filter dasar ────────────────────────────────────
{
  const out = pickExternalContacts(
    { to: 'Budi Santoso <budi@external.com>, no-reply@external.com', cc: 'citra@external.com', bcc: '' },
    'andi.pratama@example.net',
  );
  assert.deepEqual(out.map((c) => c.email), ['budi@external.com', 'citra@external.com']);
  assert.equal(out[0].name, 'Budi Santoso');
}

// ── 2. self + duplikat case-insensitive + alamat layanan ────────────────────
{
  const out = pickExternalContacts(
    {
      to: 'andi.pratama@example.net, budi@x.com',
      cc: 'BUDI@X.COM, mailer-daemon@x.com, postmaster@x.com',
      bcc: 'autoreply@x.com, bounce@x.com',
    },
    'andi.pratama@example.net',
  );
  assert.deepEqual(out.map((c) => c.email), ['budi@x.com']);
}

// ── 3. from berformat "Nama <self>" tetap dikenali sebagai self ─────────────
{
  assert.equal(isAutoContactCandidate({ email: 'andi.pratama@example.net', name: '' }, 'Andi <andi.pratama@example.net>'), false);
  assert.equal(isAutoContactCandidate({ email: 'budi@x.com', name: 'B' }, 'Andi <andi.pratama@example.net>'), true);
}

// ── 4. filterKnownContacts: Personal ATAU GAL, toleran data rusak ───────────
{
  const known = [
    { email: 'Citra@External.com' },        // GAL row (case beda)
    null,                                    // baris rusak → diabaikan
    { email: '' },                           // email kosong → diabaikan
    { uid: 'x' },                            // tanpa email → diabaikan
    { email: 'budi@external.com' },          // personal row
  ];
  const out = filterKnownContacts(
    [
      { email: 'budi@external.com', name: 'Budi' },
      { email: 'citra@external.com', name: 'Citra' },
      { email: 'baru@external.com', name: 'Baru' },
    ],
    known,
  );
  assert.deepEqual(out.map((c) => c.email), ['baru@external.com']);
}
assert.deepEqual(filterKnownContacts(null, null), []);

// ── 5. Chokepoint api.js sendMessage: capture dipanggil dengan benar ────────
{
  const calls = [];
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  globalThis.document = { cookie: '' }; // getXsrfToken() membaca cookie

  function response(status, data = {}) {
    return {
      status,
      ok: status >= 200 && status < 300,
      headers: { get: () => 'application/json' },
      json: async () => data,
      text: async () => JSON.stringify(data),
    };
  }

  let guidCount = 0;
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ url: u, method: options.method || 'GET', body });
    if (u.includes('/Mail/0/compose')) return response(200, { draftId: 'draft-1' });
    if (u.includes('/folderDrafts/draft-1/send')) return response(200, {});
    if (u.includes('/Contacts/personal/view')) {
      // 1 personal known + 1 GAL known (pola row view: cols + rows)
      return response(200, {
        headers: [
          ['c_cn', 'c_mail', 'containerName'],
          ['Dikenal Personal', 'kenal@external.com', 'Personal Address Book'],
          ['Dikenal GAL', 'gal@external.com', 'GAL example.com'],
        ],
      });
    }
    if (u.includes('/Contacts/personal/newguid')) {
      guidCount += 1;
      return response(200, { id: `guid-${guidCount}` });
    }
    if (u.includes('/saveAsContact')) return response(200, { id: body?.c_mail || 'x' });
    throw new Error(`unexpected fetch: ${u}`);
  };

  try {
    const res = await api.sendMessage('tok@user', {
      to: 'Budi <budi@external.com>, kenal@external.com, gal@external.com',
      cc: 'citra@external.com',
      bcc: 'no-reply@external.com',
      subject: 'uji',
      body: 'isi',
      isHTML: false,
      from: 'andi.pratama@example.net',
    });
    assert.equal(res.ok, true, 'kirim tetap sukses');

    // Tunggu capture fire-and-forget selesai — test seam resmi, deterministik
    await _waitForContactCaptures();
    const saves = calls.filter((c) => c.url.includes('/saveAsContact'));
    assert.equal(guidCount, 2, 'newguid dipanggil utk 2 kandidat fresh (bukan known/no-reply)');
    assert.equal(saves.length, 2, 'createContact 2x');
    const savedEmails = saves.map((s) => s.body?.c_mail).sort();
    assert.deepEqual(savedEmails, ['budi@external.com', 'citra@external.com']);
    assert.ok(saves.every((s) => s.body?.emails?.[0]?.value), 'body memakai bentuk $omit (emails array)');
    const viewCalls = calls.filter((c) => c.url.includes('/Contacts/personal/view'));
    assert.equal(viewCalls.length, 1, 'fetchContacts (dedup) tepat 1x');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
}

// ── 6. createContact gagal → kirim tetap sukses (best-effort) ───────────────
{
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  globalThis.document = { cookie: '' };
  function response(status, data = {}) {
    return {
      status,
      ok: status >= 200 && status < 300,
      headers: { get: () => 'application/json' },
      json: async () => data,
      text: async () => JSON.stringify(data),
    };
  }
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/Mail/0/compose')) return response(200, { draftId: 'draft-2' });
    if (u.includes('/send')) return response(200, {});
    if (u.includes('/Contacts/personal/view')) return response(200, { headers: [['c_mail']] });
    if (u.includes('/newguid')) return response(500);
    throw new Error(`unexpected fetch: ${u}`);
  };
  try {
    const res = await api.sendMessage('tok@user', {
      to: 'budi@external.com', subject: 'uji', body: 'isi', isHTML: false,
      from: 'andi.pratama@example.net',
    });
    assert.equal(res.ok, true, 'kegagalan capture TIDAK menggagalkan kirim');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
}

console.log('✅ test-contact-capture: 6 grup asersi lolos');
