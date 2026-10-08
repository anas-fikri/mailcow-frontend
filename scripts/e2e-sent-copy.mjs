/**
 * E2E — sent-copy (round-59): email yang dikirim via jalur SMTP proxy harus
 * mendapat salinan di folder Sent (IMAP APPEND oleh server).
 *
 * Rantai yang diuji (tanpa browser — murni API + ground truth doveadm):
 *   login /api/auth/smtp → POST /api/send (sendAt = +12s → queue terenkripsi)
 *   → flushDueSends (interval 5s) → nodemailer kirim
 *   → persistSentCopy: buildSentRaw + appendSentCopy → folder Sent diag2.
 *
 * Ground truth folder Sent dibaca via doveadm di server (ssh deploy-mail) —
 * bukan dari UI, supaya kegagalan parser frontend tidak menutupi bug backend.
 *
 * Jalankan: SERVER=deploy-mail scripts/e2e-browser-runner.sh sentcopy
 * (runner mengurus enable diag2 + cleanup expunge Sent/INBOX via trap).
 */
import { execFileSync } from 'node:child_process';

const HOST = process.env.E2E_HOST || 'https://mail.pcpexpress.co.id';
const USER = process.env.E2E_USER || 'diag2@pcpexpress.co.id';
const PASS = process.env.E2E_PASS || 'DiagTest123!';
const SERVER = process.env.SERVER || 'deploy-mail';
const STAMP = Date.now();
const SUBJECT = `E2E SentCopy ${STAMP}`;

const log = (...a) => console.log('[e2e-sent-copy]', ...a);
const fail = (m) => { console.error('[e2e-sent-copy] ❌', m); process.exit(1); };

function ssh(cmd) {
  return execFileSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', SERVER, cmd], {
    encoding: 'utf8', timeout: 30000,
  });
}

async function api(path, { method = 'GET', body, cookie = '', apiKey = '' } = {}) {
  const res = await fetch(`${HOST}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...(apiKey ? { 'X-Api-Key': apiKey } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  return { res, setCookie };
}

function cookiePair(setCookie) {
  const first = setCookie[0] || '';
  return first.split(';')[0] || '';
}

// 0. API key dari server (header X-Api-Key — dipakai SPA via build-time inject).
let API_KEY = '';
try {
  API_KEY = ssh("grep '^API_KEY=' /home/anas.fikri/sogo-proxy/.env | head -1 | cut -d= -f2-").trim();
} catch { /* fallback: lanjut tanpa header */ }
log('api key didapat:', API_KEY ? 'ya' : 'tidak (lanjut tanpa header)');

// 1. Login SMTP proxy → cookie sesi.
const login = await api('/api/auth/smtp', { method: 'POST', body: { user: USER, pass: PASS }, apiKey: API_KEY });
if (!login.res.ok) fail(`login gagal: ${login.res.status} ${await login.res.text().catch(() => '')}`);
const cookie = cookiePair(login.setCookie);
if (!cookie) fail('cookie sesi SMTP tidak diterima');
log('login SMTP proxy OK');

// 2. Kirim ke diri sendiri, dijadwalkan +12 detik (masuk queue server).
const sendAt = new Date(Date.now() + 12_000).toISOString();
const send = await api('/api/send', {
  method: 'POST',
  cookie,
  apiKey: API_KEY,
  body: { to: USER, subject: SUBJECT, body: `E2E sent-copy ${new Date().toISOString()}`, isHTML: false, sendAt },
});
if (!send.res.ok) fail(`kirim gagal: ${send.res.status} ${await send.res.text().catch(() => '')}`);
const sendBody = await send.res.json().catch(() => ({}));
if (!sendBody.queued || !sendBody.id) fail(`respons tak terduga: ${JSON.stringify(sendBody)}`);
log('queued:', sendBody.id, '→ due', sendBody.sendAt);

// 3. Poll /api/send/pending sampai kosong (flush selesai, maks 90s).
let flushed = false;
for (let i = 0; i < 18 && !flushed; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const p = await api('/api/send/pending', { cookie, apiKey: API_KEY });
  if (!p.res.ok) fail(`pending gagal: ${p.res.status}`);
  const items = (await p.res.json().catch(() => ({ items: [1] }))).items || [];
  flushed = items.length === 0;
}
if (!flushed) fail('queue tidak kunjung kosong dalam 90s — flush bermasalah');
log('queue kosong — email terkirim + sent-copy seharusnya di-APPEND');

// 4. Ground truth: subjek uji harus ada di folder Sent (doveadm, maks 60s).
function sentHasSubject() {
  try {
    const out = ssh(
      `docker exec $(docker ps --format '{{.Names}}' | grep -i dovecot | head -1) `
      + `sh -c "doveadm search -u '${USER}' mailbox Sent | awk '{print \\$2}' | sort -n | tail -20"`,
    ).trim().split('\n').filter(Boolean);
    for (const uid of out) {
      const hdr = ssh(
        `docker exec $(docker ps --format '{{.Names}}' | grep -i dovecot | head -1) `
        + `doveadm fetch -u '${USER}' "hdr.subject" mailbox Sent uid ${uid}`,
      );
      if (hdr.includes(SUBJECT)) return true;
    }
  } catch (e) { log('ssh check error:', e.message); }
  return false;
}

let found = false;
for (let i = 0; i < 12 && !found; i++) {
  found = sentHasSubject();
  if (!found) await new Promise((r) => setTimeout(r, 5000));
}
if (!found) fail(`salinan Sent TIDAK ditemukan untuk subjek "${SUBJECT}"`);
log('✅ salinan Sent terverifikasi di server (doveadm):', SUBJECT);
console.log('E2E sent-copy PASS');
