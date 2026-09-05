import assert from 'node:assert/strict';
import {
  extractLoginErrorMessage,
  isLoginSuccessResponse,
  isUnsupportedLoginFormat,
  isNetworkError,
  friendlyLoginError,
  loginErrorAction,
} from '../src/lib/loginDiagnostics.js';

// 403 fallback TIDAK boleh mengklaim "wajib ganti password" — 403 juga muncul
// utk password salah & window sinkronisasi auth server (diagnosa 2026-09-04).
const MSG_403 = 'Login ditolak. Periksa kembali email dan password Anda; jika sudah benar dan tetap gagal, tunggu beberapa menit lalu coba lagi — bila masih gagal, hubungi administrator.';
assert.equal(extractLoginErrorMessage({}, 403), MSG_403);
// SOGo mailcow: LDAPPasswordPolicyError 65535 = password salah ATAU flag
// force_pw_update aktif ATAU window sinkronisasi hash (terbukti eksperimen
// mailbox kontrol 2026-09-03 & reset-password 2026-09-04) — pesan multi-kemungkinan.
const POLICY_MSG = 'Login ditolak: kemungkinan besar password salah. Jika Anda yakin password sudah benar, tunggu beberapa menit lalu coba lagi (sinkronisasi akun di server bisa tertunda); bila tetap gagal, hubungi administrator untuk memeriksa status akun Anda.';
assert.equal(extractLoginErrorMessage({ message: 'LDAPPasswordPolicyError' }, 403), POLICY_MSG);
// Body polos SOGo tanpa field message — path deteksi langsung.
assert.equal(extractLoginErrorMessage({ LDAPPasswordPolicyError: 65535 }, 403), POLICY_MSG);
assert.equal(extractLoginErrorMessage({ message: '<html>secret</html>' }, 403), MSG_403);
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

// ── CTA untuk pesan password-policy (password salah ATAU flag aktif) ─────────
const act = loginErrorAction({ message: POLICY_MSG });
assert.equal(act?.type, 'password-change');
assert.ok(act?.hint.includes('force_pw_update'));
// Pesan lama yang salah arah tidak boleh kembali muncul.
assert.ok(!MSG_403.includes('diwajibkan') && !POLICY_MSG.includes('diwajibkan mengganti password'), 'tidak ada klaim pasti wajib ganti password');

console.log('loginDiagnostics assertions passed');
