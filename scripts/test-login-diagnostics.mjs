import assert from 'node:assert/strict';
import {
  extractLoginErrorMessage,
  isLoginSuccessResponse,
  isUnsupportedLoginFormat,
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

console.log('loginDiagnostics assertions passed');
