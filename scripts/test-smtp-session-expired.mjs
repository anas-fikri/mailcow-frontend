/**
 * Sesi SMTP proxy berakhir boleh tampil di error toast, tapi user TIDAK BOLEH
 * terus berada di halaman seolah masih login (HTTP 200 mailbox SOGo masih jalan,
 * padahal /api/send 401). Begitu sesi SMTP proxy berakhir, picu onSessionExpired
 * callback (App.jsx logout paksa + navigate /login).
 *
 * Bandingkan dengan /api/preferences yang sengaja TIDAK memicu logout
 * (lihat test-preferences-fallback.mjs) — agar baca email tidak terganggu.
 */
import assert from 'node:assert/strict';
import {
  sendMessage,
  registerSmtpSession,
  onSessionExpired,
  resetSessionExpiredFlag,
} from '../src/lib/api.js';

const calls = [];

function jsonResponse(status, body, contentType = 'application/json') {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => contentType },
    json: async () => body,
  };
}

globalThis.fetch = async (url, options = {}) => {
  const u = String(url);
  calls.push({ url: u, method: options.method, body: options.body });
  if (u.endsWith('/api/send')) {
    return jsonResponse(401, { message: 'Sesi SMTP sudah berakhir. Silakan login ulang.' });
  }
  if (u.endsWith('/api/auth/smtp')) {
    return jsonResponse(401, { message: 'Sesi SMTP sudah berakhir.' });
  }
  throw new Error('Unexpected fetch: ' + u);
};

// Hapus /api/preferences mock — sendMessage dgn lampiran tidak memanggilnya.

// ── 1. sendMessage DENGAN lampiran → /api/send 401 memicu logout ──────────────
resetSessionExpiredFlag();
let fired = 0;
onSessionExpired(() => { fired += 1; });

await assert.rejects(
  () => sendMessage('user-token', {
    to: 'a@example.test',
    subject: 'Test',
    body: 'Hello',
    isHTML: false,
    attachments: [{ filename: 'x.txt', contentType: 'text/plain', data: 'aGVsbG8=' }],
  }),
  /SMTP|session|login/i,
  'sendMessage harus throw error kalau /api/send gagal'
);

const lastCall = calls.at(-1);
assert.ok(lastCall.url.endsWith('/api/send'), 'harus hit /api/send');

// throwApiError menjadwalkan callback via setTimeout(.,0) — tunggu 1 tick.
await new Promise((resolve) => setTimeout(resolve, 20));
assert.equal(fired, 1, 'onSessionExpired callback harus terpanggil sekali utk auto-logout');

console.log('sendMessage /api/send 401 → onSessionExpired fired:', fired);

// ── 2. registerSmtpSession 401 SELAMA login TIDAK boleh picu logout ─────────
// saat login, SessionWatcher belum mount jadi _onSessionExpired null → aman
// walau 401: LoginPage menampilkan error inline. Verifikasi callback TIDAK fire.
resetSessionExpiredFlag();
fired = 0;
onSessionExpired(() => { fired += 1; });

await assert.rejects(
  () => registerSmtpSession('a@example.test', 'wrong-password'),
  /SMTP|password|login/i,
  'registerSmtpSession harus throw kalau 401'
);
assert.equal(fired, 0, 'registerSmtpSession 401 (selama login) TIDAK boleh picu logout');

console.log('registerSmtpSession 401 during login → no logout (callback not fired)');

console.log('SMTP session-expired assertions passed');
