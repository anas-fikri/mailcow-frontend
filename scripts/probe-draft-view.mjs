/**
 * PROBE — dump /view JSON untuk draft diag2 (folderDrafts) via session browser.
 * Menjawab: apa isi detail.parts utk draft yg disimpan autosave SPA
 * (apakah attachment part benar-benar hilang server-side)?
 * Jalankan: node scripts/probe-draft-view.mjs [uid]
 */
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';

const HOST = process.env.E2E_HOST || 'https://mail.example.com';
const USER = process.env.E2E_USER || 'diag2@example.com';
const PASS = process.env.E2E_PASS || 'DiagTest123!';
const UID = process.argv[2] || '';

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

function ensureChromeLibs() {
  const libDir = join(homedir(), '.local', 'chrome-libs', 'usr', 'lib', 'x86_64-linux-gnu');
  if (existsSync(libDir)) {
    process.env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH
      ? `${libDir}:${process.env.LD_LIBRARY_PATH}`
      : libDir;
  }
}
ensureChromeLibs();

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

  const out = await page.evaluate(async (enc0, uid) => {
    const hdrs = {
      Accept: 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
    };
    const xsrf = decodeURIComponent((document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/) || [])[1] || '');
    if (xsrf) hdrs['X-XSRF-TOKEN'] = xsrf;
    const enc = encodeURIComponent(enc0);
    // List drafts dulu
    const list = await fetch(`/SOGo/so/${enc}/Mail/0/folderDrafts/view`, {
      method: 'POST', credentials: 'include', headers: hdrs,
      body: JSON.stringify({ sortby: 'date', asc: 0 }),
    }).then((r) => r.json());
    const headers = list?.headers || [];
    const cols = (headers[0] || []).map((c) => String(c).toLowerCase());
    const iSubj = cols.indexOf('subject');
    const iUid = cols.indexOf('uid');
    const rows = headers.slice(1).filter(Array.isArray).map((r) => ({ uid: r[iUid], subject: r[iSubj] }));
    // Detail uid target (atau draft terbaru)
    const target = uid || rows[0]?.uid;
    if (!target) return { rows, detail: null };
    const res = await fetch(`/SOGo/so/${enc}/Mail/0/folderDrafts/${encodeURIComponent(target)}/view`, {
      credentials: 'include', headers: hdrs,
    });
    const detail = res.ok ? await res.json() : { httpStatus: res.status };
    return {
      rows,
      target,
      contentType: detail?.contentType || detail?.['content-type'] || null,
      topKeys: detail ? Object.keys(detail) : null,
      parts: (Array.isArray(detail?.parts) ? detail.parts : []).map((p) => ({
        contentType: p.contentType, name: p.name || p.filename || null, size: p.size, downloadURL: p.downloadURL || null,
      })),
    };
  }, USER, UID);

  console.log(JSON.stringify(out, null, 2));
} finally {
  await browser.close();
}
