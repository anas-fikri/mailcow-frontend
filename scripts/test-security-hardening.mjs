/**
 * test-security-hardening.mjs — Regresi audit security & data (OWASP refresh):
 *
 * 1. Rate-limit /api/send per AKUN (bukan per-IP) — kantor/NAT berbagi satu IP
 *    publik; key IP = 10 kirim/menit tersedot semua user (429 palsu/self-DoS).
 * 2. Cap panjang query pencarian ke SOGo (input UI + defensive di body builder).
 * 3. Pengingat guard yang sudah ada (pathSegment traversal, attachment path,
 *    binding /api/preferences ke session) — supaya tidak diregressi.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMessageSearchBody, MAX_SEARCH_QUERY_LENGTH } from '../src/lib/messageRequests.js';
import { pathSegment } from '../src/lib/pathSegment.js';
import { validateAttachment } from '../src/lib/attachmentValidation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let pass = 0;
const ok = (cond, name) => { assert.ok(cond, name); pass++; console.log(`  ✓ ${name}`); };

// ── 1. Rate-limit /api/send per-akun ─────────────────────────────────────────
const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
ok(server.includes('function resolveSmtpSession'), 'server.js punya resolveSmtpSession (rate-limit key)');
ok(
  server.includes("app.post('/api/send', resolveSmtpSession, requireSmtpSession, rateLimit({ max: 10, windowMs: 60000, keyFn: (req) => req.smtpSession?.user || clientIp(req) })"),
  '/api/send auth + rate-limit keyed per session.user (fallback IP)'
);
ok(server.includes('const session = req.smtpSession;'), 'handler /api/send reuse req.smtpSession (tanpa lookup ganda)');
ok(server.includes("console.log(`[smtp-session] 401 ${req.method} ${req.path}"), 'telemetry 401 SMTP dipertahankan tanpa data sensitif');

// ── 2. Cap query pencarian ───────────────────────────────────────────────────
ok(MAX_SEARCH_QUERY_LENGTH === 500, 'MAX_SEARCH_QUERY_LENGTH = 500');
assert.equal(buildMessageSearchBody('x'.repeat(5000)).filters[0].searchInput.length, 500, 'query > 500 di-truncate');
pass++;
assert.equal(buildMessageSearchBody('hello').filters[0].searchInput, 'hello', 'query pendek tidak berubah');
pass++;
assert.equal(buildMessageSearchBody(null).filters[0].searchInput, '', 'query null → string kosong (tanpa crash)');
pass++;
assert.equal(buildMessageSearchBody(undefined, 'from').filters[0].searchBy, 'from', 'criteria tetap dipetakan setelah truncate');
pass++;

const mail = fs.readFileSync(path.join(ROOT, 'src/pages/MailPage.jsx'), 'utf8');
ok(mail.includes('maxLength={300}'), 'input pencarian MailPage maxLength=300');

// ── 3. Guard yang sudah ada (anti-regresi) ───────────────────────────────────
// pathSegment menolak traversal / percent-escape selain %2F yang diizinkan
assert.throws(() => pathSegment('folderINBOX%2F..%2F..'), /tidak valid/, 'pathSegment tolak traversal ter-encode');
pass++;
assert.throws(() => pathSegment('a/b'), /tidak valid/, 'pathSegment tolak slash pada segmen non-folder');
pass++;
assert.equal(pathSegment('folderINBOX%2FSub', 'folder', { allowEncodedSlash: true }), 'folderINBOX%2FSub', 'nested folder %2F tetap valid');
pass++;

// Attachment: filename tidak boleh mengandung path/karakter kontrol
assert.equal(validateAttachment({ filename: '../../etc/passwd', contentType: 'text/plain', data: 'aGk=' }).ok, false, 'filename traversal ditolak');
pass++;
assert.equal(validateAttachment({ filename: 'a\nb.txt', contentType: 'text/plain', data: 'aGk=' }).ok, false, 'filename newline ditolak');
pass++;

// /api/preferences terikat session user (403 saat email != session)
ok(server.includes("requestedEmail.toLowerCase() !== sessionEmail.toLowerCase()"), '/api/preferences cek user-binding');

// ── 4. /api/health konsisten antara server & deploy.sh verify ───────────────
// /api/health butuh API key (requireApiKey di server.js) — bukan public.
ok(server.indexOf("app.get('/api/health'") > server.indexOf("app.use('/api', requireApiKey)"),
  '/api/health didefinisikan SETELAH requireApiKey (butuh API key)');

const deploy = fs.readFileSync(path.join(ROOT, 'deploy.sh'), 'utf8');
ok(deploy.includes('verify_health'), 'deploy.sh punya verify_health');
ok(deploy.includes('verify_health "$host"'), 'verify() memanggil verify_health (end-to-end pasca-deploy)');
ok(deploy.includes('/api/health') && deploy.includes('X-Api-Key'), 'verify_health memakai API key utk /api/health');
ok(deploy.includes('preflight') && deploy.includes('/api/health'), 'preflight juga cek /api/health');

console.log(`\nSecurity-hardening: ${pass} assertions PASS ✅`);
