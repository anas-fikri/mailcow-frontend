#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync('server.js', 'utf8');
const route = "app.post('/api/send'";
const start = server.indexOf(route);
assert.ok(start >= 0, 'route /api/send ada');
const end = server.indexOf("// ── Batal kirim", start);
assert.ok(end > start, 'batas route /api/send ditemukan');
const block = server.slice(start, end);
assert.match(block, /app\.post\('\/api\/send',\s*resolveSmtpSession,\s*requireSmtpSession,\s*rateLimit/,
  'requireSmtpSession dijalankan sebelum rate-limit dan handler');
const authPos = block.indexOf('requireSmtpSession');
const validationPos = block.indexOf('sendEmailSchema.safeParse');
assert.ok(authPos >= 0 && validationPos > authPos, 'auth terjadi sebelum validasi payload');
assert.equal((block.match(/if \(!session\)/g) || []).length, 0, 'tidak ada fallback session check yang terlambat');
assert.match(block, /const session = req\.smtpSession;/, 'handler memakai sesi yang sudah di-resolve');
console.log('send auth-order assertions passed');
