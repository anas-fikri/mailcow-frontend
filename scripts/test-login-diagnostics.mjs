import assert from 'node:assert/strict';
import {
  extractLoginErrorMessage,
  isLoginSuccessResponse,
  isUnsupportedLoginFormat,
  isNetworkError,
  friendlyLoginError,
} from '../src/lib/loginDiagnostics.js';

assert.equal(extractLoginErrorMessage({}, 403), 'Login ditolak SOGo. Periksa email/password, status mailbox aktif, dan apakah akun diwajibkan mengganti password.');
assert.equal(extractLoginErrorMessage({ message: 'LDAPPasswordPolicyError' }, 403), 'Akun diwajibkan mengganti password sebelum dapat login.');
assert.equal(extractLoginErrorMessage({ message: '<html>secret</html>' }, 403), 'Login ditolak SOGo. Periksa email/password, status mailbox aktif, dan apakah akun diwajibkan mengganti password.');
assert.equal(isUnsupportedLoginFormat(415, { message: 'Unsupported content-type JSON' }), true);
assert.equal(isUnsupportedLoginFormat(422, {}), true);
assert.equal(isUnsupportedLoginFormat(403, { message: 'invalid password' }), false);
assert.equal(isLoginSuccessResponse({ ok: true, status: 200 }, { isJson: true, data: { username: 'dummy@example.test' } }), true);
assert.equal(isLoginSuccessResponse({ ok: false, status: 302 }, { isEmpty: true, isHtml: false }), true);
assert.equal(isLoginSuccessResponse({ ok: true, status: 200 }, { isJson: true, data: {} }), false);
assert.equal(isLoginSuccessResponse({ ok: true, status: 200 }, { isEmpty: true, isHtml: false }), true);
assert.equal(isLoginSuccessResponse({ ok: true, status: 200 }, { isEmpty: false, isHtml: true }), false);
assert.equal(isLoginSuccessResponse({ ok: true, status: 200 }, { isJson: true, data: { message: 'wrong password' } }), false);
assert.equal(isLoginSuccessResponse({ ok: true, status: 204 }, { isJson: true, data: {} }), false);
assert.equal(isLoginSuccessResponse({ ok: false, status: 403 }, { isJson: true, data: {} }), false);

// ── Network error detection & friendly message ──────────────────────────────
const friendly = 'Tidak dapat terhubung ke server email. Periksa koneksi internet atau VPN Anda, lalu coba lagi.';
assert.equal(isNetworkError(new TypeError('Failed to fetch')), true);
assert.equal(isNetworkError(new Error('NetworkError when attempting to fetch resource.')), true);
assert.equal(isNetworkError(new Error('Load failed')), true);
assert.equal(isNetworkError(Object.assign(new Error('x'), { name: 'AbortError' })), true);
assert.equal(isNetworkError(Object.assign(new Error('timeout'), { name: 'TimeoutError' })), true);
assert.equal(isNetworkError({ message: 'connection reset by peer' }), true);
// Error HTTP TIDAK boleh dianggap network error (pesan spesifik sendiri).
assert.equal(isNetworkError(Object.assign(new Error('invalid'), { status: 403 })), false);
assert.equal(isNetworkError(new Error('Email atau password tidak valid.')), false);
assert.equal(isNetworkError(null), false);
assert.equal(isNetworkError(undefined), false);

assert.equal(friendlyLoginError(new TypeError('Failed to fetch')), friendly);
assert.equal(friendlyLoginError(Object.assign(new Error('x'), { name: 'AbortError' })), friendly);
assert.equal(friendlyLoginError(new Error('Email atau password tidak valid.')), 'Email atau password tidak valid.');
assert.equal(friendlyLoginError(null), 'Login gagal. Periksa koneksi dan status akun.');

console.log('loginDiagnostics assertions passed');
