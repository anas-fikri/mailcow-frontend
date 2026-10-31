/**
 * Sesi SMTP proxy berakhir (401 dari /api/*) TIDAK boleh me-logout user dari
 * SOGo: dulu logout paksa membuang compose + lampiran yang sedang dikirim, dan
 * restart server.js menendang semua user. Sekarang: error bertanda
 * smtpSessionLost + event SMTP_SESSION_LOST_EVENT → SmtpReauthBanner meminta
 * password di tempat.
 *
 * Bandingkan dengan /api/preferences yang sengaja TIDAK memicu logout
 * (lihat test-preferences-fallback.mjs) — agar baca email tidak terganggu.
 */
import assert from 'node:assert/strict';

// window minimal (EventTarget) SEBELUM api.js dimuat, agar event bisa diamati.
globalThis.window = globalThis.window || new EventTarget();
const {
  sendMessage,
  registerSmtpSession,
  onSessionExpired,
  resetSessionExpiredFlag,
  SMTP_SESSION_LOST_EVENT,
} = await import('../src/lib/api.js');
let lostEvents = 0;
window.addEventListener(SMTP_SESSION_LOST_EVENT, () => { lostEvents += 1; });

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

// ── 1. sendMessage DENGAN lampiran → /api/send 401: TIDAK logout, event re-auth ─
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
  (err) => err.smtpSessionLost === true && err.status === 401,
  'sendMessage harus throw error bertanda smtpSessionLost kalau /api/send 401'
);

const lastCall = calls.at(-1);
assert.ok(lastCall.url.endsWith('/api/send'), 'harus hit /api/send');

// throwApiError menjadwalkan callback via setTimeout(.,0) — tunggu 1 tick.
await new Promise((resolve) => setTimeout(resolve, 20));
assert.equal(fired, 0, 'sesi SOGo TIDAK boleh di-logout karena sesi SMTP habis');
assert.equal(lostEvents, 1, 'event SMTP_SESSION_LOST_EVENT harus dikirim sekali');

console.log('sendMessage /api/send 401 → no logout, re-auth event:', lostEvents);

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
