// Test: markMessagesAsJunk / markMessagesAsNotJunk harus memindahkan pesan
// (perilaku native SOGo), bukan hanya POST endpoint laporan.
//
// Ground truth (dibaca dari sumber SOGo + E2E produksi 2026-09-03):
// - SOGoMailFolder.m markMessagesAsJunkOrNotJunk HANYA kirim email laporan
//   learn-spam bila mailJunkSettings vendor=generic — tanpa flag, tanpa move.
// - Mailer.services.js markOrUnMarkMessagesAsJunk (UI native) SELALU memanggil
//   $moveMessages ke folder Junk SETELAH endpoint laporan.
// - E2E: POST markMessagesAsJunk → 204 tapi pesan TETAP di INBOX (Junk kosong).
//
// Kontrak baru di api.js:
// 1. markMessagesAsJunk: laporan best-effort + moveMessages → folderJunk
//    (kecuali source sudah folderJunk).
// 2. markMessagesAsNotJunk: laporan best-effort + moveMessages → folderINBOX
//    (hanya bila source folderJunk).
// 3. Kegagalan laporan TIDAK menggagalkan operasi (pesannya tetap pindah).

import assert from 'node:assert/strict';

const api = await import('../src/lib/api.js');

function response(status, data = {}, contentType = 'application/json') {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => String(name).toLowerCase() === 'content-type' ? contentType : '' },
    json: async () => data,
    text: async () => typeof data === 'string' ? data : JSON.stringify(data),
  };
}

const calls = [];
const originalFetch = globalThis.fetch;
function record(label, handler) {
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    calls.push({ label, url: u, method: options.method || 'GET', body: options.body || null });
    return handler(u, options);
  };
}

try {
  globalThis.document = { cookie: '' };

  // ── 1. markMessagesAsJunk dari INBOX: laporan + move ke folderJunk ─────────
  calls.length = 0;
  record('junk-inbox', (u) => {
    if (u.includes('/markMessagesAsJunk')) return response(204);
    if (u.includes('/moveMessages')) return response(200, { unseenCount: 0 });
    return response(404, {});
  });
  await api.markMessagesAsJunk('u@x.com', 'folderINBOX', ['3']);
  const junkCalls = calls.map((c) => c.url);
  assert.ok(junkCalls.some((u) => u.includes('/markMessagesAsJunk')), 'endpoint laporan tetap dipanggil');
  const move1 = calls.find((c) => c.url.includes('/moveMessages'));
  assert.ok(move1, 'markMessagesAsJunk harus memindahkan pesan (native SOGo flow)');
  const body1 = JSON.parse(move1.body);
  assert.deepEqual(body1.uids, [3], 'uids dinormalisasi integer');
  assert.equal(body1.folder, '/0/folderJunk', 'destination pakai segmen akun 0');

  // ── 2. Source sudah folderJunk → tanpa move (anti self-move loop) ──────────
  calls.length = 0;
  record('junk-self', (u) => {
    if (u.includes('/markMessagesAsJunk')) return response(204);
    if (u.includes('/moveMessages')) return response(200, {});
    return response(404, {});
  });
  await api.markMessagesAsJunk('u@x.com', 'folderJunk', [5]);
  assert.ok(!calls.some((c) => c.url.includes('/moveMessages')), 'folderJunk → folderJunk tidak boleh move lagi');

  // ── 3. Laporan gagal (500) → tetap sukses karena move yang menentukan ──────
  calls.length = 0;
  record('junk-report-fail', (u) => {
    if (u.includes('/markMessagesAsJunk')) return response(500, { message: 'no learn address' });
    if (u.includes('/moveMessages')) return response(200, {});
    return response(404, {});
  });
  await api.markMessagesAsJunk('u@x.com', 'folderINBOX', [7]);
  assert.ok(calls.some((c) => c.url.includes('/moveMessages')), 'laporan 500 tidak boleh cegah move');

  // ── 4. move gagal → error dilempar (user harus tahu) ───────────────────────
  record('junk-move-fail', (u) => {
    if (u.includes('/markMessagesAsJunk')) return response(204);
    if (u.includes('/moveMessages')) return response(500, { message: 'boom' });
    return response(404, {});
  });
  await assert.rejects(
    () => api.markMessagesAsJunk('u@x.com', 'folderINBOX', [9]),
    (e) => /memindahkan|boom/i.test(e.message || ''),
    'move gagal harus surface error'
  );

  // ── 5. markMessagesAsNotJunk dari Junk → pindah ke INBOX ───────────────────
  calls.length = 0;
  record('notjunk', (u) => {
    if (u.includes('/markMessagesAsNotJunk')) return response(204);
    if (u.includes('/moveMessages')) return response(200, {});
    return response(404, {});
  });
  await api.markMessagesAsNotJunk('u@x.com', 'folderJunk', [11]);
  const move2 = calls.find((c) => c.url.includes('/moveMessages'));
  assert.ok(move2, 'markMessagesAsNotJunk dari Junk harus pindah ke INBOX');
  const body2 = JSON.parse(move2.body);
  assert.equal(body2.folder, '/0/folderINBOX', 'tujuan not-junk = folderINBOX');

  // ── 6. markMessagesAsNotJunk dari folder lain → tanpa move ─────────────────
  calls.length = 0;
  record('notjunk-inbox', (u) => {
    if (u.includes('/markMessagesAsNotJunk')) return response(204);
    if (u.includes('/moveMessages')) return response(200, {});
    return response(404, {});
  });
  await api.markMessagesAsNotJunk('u@x.com', 'folderINBOX', [13]);
  assert.ok(!calls.some((c) => c.url.includes('/moveMessages')), 'not-junk dari INBOX tidak boleh move');

  console.log('test-junk-move: all assertions passed');
} finally {
  globalThis.fetch = originalFetch;
}
