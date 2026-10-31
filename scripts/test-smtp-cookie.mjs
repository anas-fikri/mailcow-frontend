import assert from 'node:assert/strict';
import {
  SMTP_SESSION_COOKIE,
  parseCookies,
  buildSmtpSessionCookie,
  clearSmtpSessionCookie,
} from '../src/lib/smtpCookie.js';

// ── parseCookies ─────────────────────────────────────────────────────────────
assert.deepEqual(parseCookies(''), {});
assert.deepEqual(parseCookies(undefined), {});
assert.deepEqual(parseCookies('a=1; b=2'), { a: '1', b: '2' });
assert.deepEqual(parseCookies('  spaced = value ; flag '), { spaced: 'value' });
// Nilai encoded
assert.deepEqual(parseCookies('k=hello%20world'), { k: 'hello world' });
// Malformed (tanpa '=') dilewati
assert.deepEqual(parseCookies('nonsense; a=1'), { a: '1' });
// decodeURIComponent gagal → raw value dipakai, tidak throw
assert.deepEqual(parseCookies('k=%E0%A4%A'), { k: '%E0%A4%A' });

// ── buildSmtpSessionCookie ───────────────────────────────────────────────────
const token = '01234567-89ab-cdef-0123-456789abcdef';
const set = buildSmtpSessionCookie(token, { maxAgeSec: 28800 });
assert.ok(set.startsWith(`${SMTP_SESSION_COOKIE}=${token};`), 'cookie harus mulai dengan name=token');
assert.match(set, /HttpOnly/, 'harus HttpOnly (anti XSS)');
assert.match(set, /SameSite=Strict/, 'harus SameSite=Strict (anti CSRF)');
assert.match(set, /Path=\/api/, 'harus Path=/api');
assert.match(set, /Max-Age=28800/, 'harus Max-Age selaras TTL');
assert.match(set, /Secure/, 'harus Secure (HTTPS only)');
// secure=false → tanpa Secure (dev http lokal)
assert.doesNotMatch(buildSmtpSessionCookie(token, { secure: false }), /Secure/);

// ── clearSmtpSessionCookie ───────────────────────────────────────────────────
const clr = clearSmtpSessionCookie();
assert.ok(clr.startsWith(`${SMTP_SESSION_COOKIE}=;`), 'clear harus kosongkan nilai');
assert.match(clr, /Max-Age=0/, 'clear harus Max-Age=0');
assert.match(clr, /HttpOnly/);
assert.match(clr, /SameSite=Strict/);
assert.match(clr, /Path=\/api/);

console.log('smtp cookie assertions passed');
