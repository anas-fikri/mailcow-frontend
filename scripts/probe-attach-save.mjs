/**
 * PROBE v4 — verifikasi protokol attach SOGo (dari source UIxMailEditor.m):
 *   1. GET  /Mail/0/compose → draftId
 *   2. POST multipart /Mail/0/folderDrafts/<draftId>/save  field "attachments" (file PNG)
 *   3. POST json      /Mail/0/folderDrafts/<draftId>/save  (subject/text)
 *   4. GET  detail draft → parts berisi image/png?
 * Jalankan: node scripts/probe-attach-save.mjs
 */
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';

const HOST = process.env.E2E_HOST || 'https://mail.example.com';
const USER = process.env.E2E_USER || 'diag2@example.com';
const PASS = process.env.E2E_PASS || 'DiagTest123!';
const STAMP = Date.now();
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function findChrome() {
  const root = process.env.PUPPETEER_CACHE_DIR || join(homedir(), '.cache', 'puppeteer');
  for (const dir of ['chrome', 'chrome-headless-shell']) {
    const base = join(root, dir);
    if (!existsSync(base)) continue;
    const versions = readdirSync(base).sort().reverse();
    for (const v of versions) {
      const inner = join(base, v);
      const sub = readdirSync(inner)[0];
      const bin = join(inner, sub, dir === 'chrome' ? 'chrome' : 'chrome-headless-shell');
      if (existsSync(bin)) return bin;
    }
  }
  return null;
}
(function ensureChromeLibs() {
  const libDir = join(homedir(), '.local', 'chrome-libs', 'usr', 'lib', 'x86_64-linux-gnu');
  if (existsSync(libDir)) {
    process.env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH
      ? `${libDir}:${process.env.LD_LIBRARY_PATH}`
      : libDir;
  }
})();

const browser = await puppeteer.launch({
  headless: 'shell',
  executablePath: process.env.CHROME_PATH || findChrome() || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
try {
  const page = await browser.newPage();
  await page.goto(`${HOST}/webmail/`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[type="email"]');
  await page.locator('input[type="email"]').fill(USER);
  await page.locator('input[type="password"]').fill(PASS);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30_000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForFunction(() => !location.pathname.includes('/login'), { timeout: 30_000 });

  const out = await page.evaluate(async (enc0, pngB64, stamp) => {
    const hdrs = { Accept: 'application/json, text/plain, */*', 'X-Requested-With': 'XMLHttpRequest' };
    const xsrf = decodeURIComponent((document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/) || [])[1] || '');
    if (xsrf) hdrs['X-XSRF-TOKEN'] = xsrf;
    const enc = encodeURIComponent(enc0);
    const SAVE = `/SOGo/so/${enc}/Mail/0/folderDrafts`;

    // 1. compose → draftId
    const cRes = await fetch(`/SOGo/so/${enc}/Mail/0/compose`, { credentials: 'include', headers: hdrs });
    const cData = await cRes.json().catch(() => ({}));
    const draftId = cData?.draftId;
    if (!draftId) return { step: 'compose', status: cRes.status };

    // 2. multipart POST dgn field "attachments"
    const pngBlob = new Blob([Uint8Array.from(atob(pngB64), (c) => c.charCodeAt(0))], { type: 'image/png' });
    const fd = new FormData();
    fd.append('attachments', pngBlob, `probe-${stamp}.png`);
    const aRes = await fetch(`${SAVE}/${encodeURIComponent(draftId)}/save`, {
      method: 'POST', credentials: 'include', headers: hdrs, body: fd,
    });
    const aText = (await aRes.text()).slice(0, 200);

    // 3. json save (text+headers)
    const sRes = await fetch(`${SAVE}/${encodeURIComponent(draftId)}/save`, {
      method: 'POST', credentials: 'include',
      headers: { ...hdrs, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: `Probe AttachSave ${stamp}`, to: [enc0], cc: [], bcc: [],
        replyTo: '', inReplyTo: '', references: '',
        text: '<p>probe attach-save</p>', isHTML: true, from: enc0,
      }),
    });
    const sData = await sRes.json().catch(() => ({}));
    await new Promise((r) => setTimeout(r, 1500));

    // 4. detail draft → parts
    const list = await fetch(`${SAVE}/view`, {
      method: 'POST', credentials: 'include', headers: hdrs,
      body: JSON.stringify({ sortby: 'date', asc: 0 }),
    }).then((r) => r.json());
    const headers = list?.headers || [];
    const cols = (headers[0] || []).map((c) => String(c).toLowerCase());
    const iSubj = cols.indexOf('subject'); const iUid = cols.indexOf('uid');
    const row = headers.slice(1).filter(Array.isArray).find((r) => String(r[iSubj]).includes(`Probe AttachSave ${stamp}`));
    let parts = null; let uid = null;
    if (row) {
      uid = row[iUid];
      const d = await fetch(`${SAVE}/${encodeURIComponent(uid)}/view`, { credentials: 'include', headers: hdrs }).then((r) => r.json()).catch(() => null);
      const flat = [];
      const walk = (p) => {
        if (!p || typeof p !== 'object') return;
        if (Array.isArray(p)) return p.forEach(walk);
        if (p.contentType) flat.push({ ct: p.contentType, name: p.filename || p.name || null });
        if (p.content) walk(p.content);
      };
      walk(d?.parts);
      parts = flat;
    }
    return { draftId, attachStatus: aRes.status, attachBody: aText, jsonStatus: sRes.status, savedUid: sData?.uid ?? null, listUid: uid, parts };
  }, USER, PNG_B64, STAMP);

  console.log(JSON.stringify(out, null, 2));
} finally {
  await browser.close();
}
