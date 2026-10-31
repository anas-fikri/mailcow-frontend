/**
 * BROWSER E2E — flag-color v3 (folder-scoped) di produksi.
 *
 * Email uji di-seed oleh e2e-browser-runner.sh (doveadm save) dengan subjek
 * unik E2E_FC_SUBJECT — jalur kirim UI sudah dicover e2e-mail-browser; di
 * sini fokus lifecycle flag:
 *
 *   1. Seed localStorage flag_colors_v2 (bentuk flat) SEBELUM app membuka
 *      MailPage → verifikasi migrasi otomatis ke v3 { folderINBOX: {...} }
 *      (key v2 lama dihapus).
 *   2. Set warna 'purple' pada email uji (via v3 store) → UI menampilkan
 *      star ber-class text-purple-500.
 *   3. Pindahkan email uji ke Arsip via tombol Arsip PER-BARIS (jalur
 *      moveMutation yang baru saja di-wire ke purge) → entri uid uji hilang
 *      dari folderINBOX, entri seed lain TIDAK ikut terhapus (presisi).
 *   4. RELOAD penuh → purge persist (tidak bangkit dari cache).
 *   5. Tidak ada pageerror React.
 *
 * Jalankan: SERVER=deploy-mail scripts/e2e-browser-runner.sh flagcolor
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';

const HOST = 'https://mail.example.com';
const USER = process.env.E2E_USER || 'diag2@example.com';
const PASS = process.env.E2E_PASS || 'DiagTest123!';
// Subjek email uji di-seed runner (doveadm save). Fallback utk run manual.
const SUBJECT = process.env.E2E_FC_SUBJECT || `E2E FlagColor ${Date.now()}`;
const LS_V2 = `flag_colors_v2_${USER}`;
const LS_V3 = `flag_colors_v3_${USER}`;

const log = (...a) => console.log('[e2e-flagcolor]', ...a);
let browser;
let page;
const consoleErrors = [];

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Buka halaman mail; tunggu daftar pesan ter-render. */
async function openMail(p) {
  await p.goto(`${HOST}/webmail/mail`, { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => !document.querySelector('.animate-pulse'), { timeout: 45_000 }).catch(() => {});
  await p.waitForSelector('div.text-sm.truncate', { timeout: 45_000 });
  await sleep(800);
}

try {
  ensureChromeLibs();
  const executablePath = process.env.CHROME_PATH || findChrome() || undefined;
  log('chrome:', executablePath || '(bundled default)');
  browser = await puppeteer.launch({
    headless: 'shell',
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.setDefaultTimeout(45_000);

  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  // ── 1. Login ─────────────────────────────────────────────────────────────
  log('buka', `${HOST}/webmail/`);
  await page.goto(`${HOST}/webmail/`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[type="email"]');
  await page.locator('input[type="email"]').fill(USER);
  await page.locator('input[type="password"]').fill(PASS);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30_000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForFunction(() => !location.pathname.includes('/login'), { timeout: 30_000 });
  log('login OK');

  // ── 2. Pre-cleanup: hanya email uji run SEBELUMNYA (jangan sentuh yang
  //      baru di-seed runner — subjeknya sama prefix). ─────────────────────
  const pre = await page.evaluate(async (userEmail, currentSubject) => {
    const hdrs = { Accept: 'application/json, text/plain, */*', 'X-Requested-With': 'XMLHttpRequest' };
    const enc = encodeURIComponent(userEmail);
    const xsrf = decodeURIComponent((document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/) || [])[1] || '');
    if (xsrf) hdrs['X-XSRF-TOKEN'] = xsrf;
    let removed = 0;
    for (const folder of ['folderINBOX', 'folderJunk', 'folderSent']) {
      const res = await fetch(`/SOGo/so/${enc}/Mail/0/${folder}/view`, {
        method: 'POST', credentials: 'include', headers: hdrs,
        body: JSON.stringify({ sortby: 'date', asc: 0 }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const headers = data?.headers || [];
      const cols = (headers[0] || []).map((c) => String(c).toLowerCase());
      const iSubj = cols.indexOf('subject');
      const iUid = cols.indexOf('uid');
      const uids = [];
      for (const row of headers.slice(1)) {
        const s = String(row[iSubj] || '');
        if (Array.isArray(row) && s.includes('E2E FlagColor ') && s !== currentSubject) uids.push(row[iUid]);
      }
      for (const uid of uids) {
        await fetch(`/SOGo/so/${enc}/Mail/0/${folder}/batchMove`, {
          method: 'POST', credentials: 'include', headers: hdrs,
          body: JSON.stringify({ uids: [uid], folder: '/0/folderTrash' }),
        }).catch(() => {});
        removed += 1;
      }
    }
    return { removed };
  }, USER, SUBJECT).catch((err) => ({ removed: 0, err: err.message }));
  if (pre.removed > 0) log('pre-cleanup:', pre.removed, 'email uji lama dibuang ke Trash');

  // ── 3. Seed store v2 FLAT (bentuk pra-v3) + reload penuh → migrasi otomatis ──
  // UID seed {4,7} sengaja tidak bersesuaian dgn pesan nyata: migrasi harus
  // membungkusnya apa adanya; purge-on-move harus presisi (tidak ikut hapus).
  await page.evaluate((v2Key, email) => {
    localStorage.setItem(v2Key, JSON.stringify({ 4: 'red', 7: 'blue' }));
    delete localStorage[`flag_colors_v3_${email}`];
  }, LS_V2, USER);
  log('store v2 flat di-seed: {4:red, 7:blue}');

  await openMail(page);
  // Pastikan folder INBOX terpilih (default sudah, tapi deterministik)
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button[type="button"]')];
    const inbox = btns.find((b) => b.querySelector('span')?.textContent === 'Kotak Masuk');
    if (inbox) inbox.click();
  });
  await sleep(800);

  // Migrasi: app memanggil getStore saat render baris → store v3 ditulis.
  await page.waitForFunction(
    (k) => !!localStorage.getItem(k),
    { timeout: 30_000 },
    LS_V3,
  );
  const migrated = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), LS_V3);
  assert.deepEqual(migrated, { folderINBOX: { 4: 'red', 7: 'blue' } },
    `migrasi v2→v3 salah bentuk: ${JSON.stringify(migrated)}`);
  const v2Gone = await page.evaluate((k) => localStorage.getItem(k) === null, LS_V2);
  assert.ok(v2Gone, 'key v2 harus dihapus setelah migrasi');
  log('✅ migrasi v2→v3 benar (wrap folderINBOX, key v2 dihapus)');

  // ── 4. Email uji (seed runner) harus ada di INBOX; ambil UID aslinya ────
  await page.waitForFunction(
    (t) => [...document.querySelectorAll('div.text-sm.truncate')].some((el) => el.textContent?.includes(t)),
    { timeout: 60_000 },
    SUBJECT,
  );
  log('email uji muncul di INBOX');

  const xsrf2 = await page.evaluate(() => decodeURIComponent((document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/) || [])[1] || ''));
  const testUid = await page.evaluate(async (userEmail, xsrfToken, subject) => {
    const hdrs = { Accept: 'application/json, text/plain, */*', 'X-Requested-With': 'XMLHttpRequest' };
    if (xsrfToken) hdrs['X-XSRF-TOKEN'] = xsrfToken;
    const enc = encodeURIComponent(userEmail);
    const res = await fetch(`/SOGo/so/${enc}/Mail/0/folderINBOX/view`, {
      method: 'POST', credentials: 'include', headers: hdrs,
      body: JSON.stringify({ sortby: 'date', asc: 0 }),
    });
    const data = await res.json();
    const headers = data?.headers || [];
    const cols = (headers[0] || []).map((c) => String(c).toLowerCase());
    const iSubj = cols.indexOf('subject');
    const iUid = cols.indexOf('uid');
    for (const row of headers.slice(1)) {
      if (Array.isArray(row) && String(row[iSubj]).includes(subject)) return String(row[iUid]);
    }
    return null;
  }, USER, xsrf2, SUBJECT);
  assert.ok(testUid, 'uid email uji ditemukan di folder INBOX');
  log('uid email uji:', testUid);

  // Set warna flag 'purple' pada email uji (bentuk v3 sudah aktif)
  await page.evaluate((v3Key, email, uid) => {
    const store = JSON.parse(localStorage.getItem(v3Key) || '{}');
    store.folderINBOX = { ...(store.folderINBOX || {}), [uid]: 'purple' };
    localStorage.setItem(v3Key, JSON.stringify(store));
  }, LS_V3, USER, testUid);
  await page.reload({ waitUntil: 'networkidle2' });
  await openMail(page);

  // Verifikasi UI: star baris uji ber-class text-purple-500
  const starPurple = await page.evaluate((subject) => {
    const rows = [...document.querySelectorAll('div.text-sm.truncate')];
    const row = rows.find((el) => el.textContent?.includes(subject));
    if (!row) return null;
    const container = row.closest('div.group');
    const star = container?.querySelector('button[aria-label="Tandai penting"] svg');
    return star ? star.getAttribute('class') : null;
  }, SUBJECT);
  assert.ok(starPurple && /text-purple-500/.test(starPurple),
    `star berwarna purple di UI (class: ${starPurple})`);
  log('✅ warna flag tampil di UI (purple)');

  // ── 5. Pindahkan email uji ke Arsip via tombol Arsip per-baris ─────────
  const archived = await page.evaluate((subject) => {
    const rows = [...document.querySelectorAll('div.text-sm.truncate')];
    const row = rows.find((el) => el.textContent?.includes(subject));
    if (!row) return { ok: false, why: 'baris tidak ditemukan' };
    const container = row.closest('div.group');
    const archBtn = container?.querySelector('button[title="Arsip"]');
    if (!archBtn) return { ok: false, why: 'tombol Arsip tidak ditemukan (Archive kosong?)' };
    archBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return { ok: true };
  }, SUBJECT);
  assert.ok(archived.ok, `klik Arsip: ${archived.why || 'ok'}`);
  log('klik Arsip → tunggu mutasi selesai…');

  // Tunggu: baris uji hilang dari INBOX (mutasi selesai + refetch)
  await page.waitForFunction(
    (t) => ![...document.querySelectorAll('div.text-sm.truncate')].some((el) => el.textContent?.includes(t)),
    { timeout: 30_000 },
    SUBJECT,
  );
  await sleep(1500);

  // Purge: entri uid uji harus SUDAH DIHAPUS dari folderINBOX di store v3
  const afterMove = await page.evaluate((v3Key, uid) => {
    const store = JSON.parse(localStorage.getItem(v3Key) || '{}');
    return { inboxEntry: store.folderINBOX?.[uid] ?? null, store };
  }, LS_V3, testUid);
  assert.equal(afterMove.inboxEntry, null,
    `entri flag uid ${testUid} harus sudah di-purge dari folderINBOX setelah move (masih: ${afterMove.inboxEntry})`);
  log('✅ purge-on-move benar (entri uid uji hilang dari folderINBOX)');

  // Entri seed {4:red, 7:blue} TIDAK boleh ikut terpurge (presisi folder/uid)
  assert.equal(afterMove.store.folderINBOX?.['4'], 'red', 'entri seed uid 4 tetap utuh');
  assert.equal(afterMove.store.folderINBOX?.['7'], 'blue', 'entri seed uid 7 tetap utuh');
  log('✅ purge presisi (entri lain tidak ikut terhapus)');

  // ── 6. RELOAD penuh → purge persist (tidak bangkit dari cache) ──────────
  await page.reload({ waitUntil: 'networkidle2' });
  await openMail(page);
  const afterReload = await page.evaluate((v3Key, uid) => {
    const store = JSON.parse(localStorage.getItem(v3Key) || '{}');
    return { inboxEntry: store.folderINBOX?.[uid] ?? null };
  }, LS_V3, testUid);
  assert.equal(afterReload.inboxEntry, null, 'purge persist setelah reload penuh');
  log('✅ purge persist setelah reload penuh');

  // ── 7. Cleanup: email uji dibuang ke Trash via session browser ──────────
  const xsrf3 = await page.evaluate(() => decodeURIComponent((document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/) || [])[1] || ''));
  await page.evaluate(async (userEmail, xsrfToken, subject, currentUid) => {
    const hdrs = { Accept: 'application/json, text/plain, */*', 'X-Requested-With': 'XMLHttpRequest' };
    if (xsrfToken) hdrs['X-XSRF-TOKEN'] = xsrfToken;
    const enc = encodeURIComponent(userEmail);
    for (const folder of ['folderINBOX', 'folderJunk', 'folderSent']) {
      const res = await fetch(`/SOGo/so/${enc}/Mail/0/${folder}/view`, {
        method: 'POST', credentials: 'include', headers: hdrs,
        body: JSON.stringify({ sortby: 'date', asc: 0 }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const headers = data?.headers || [];
      const cols = (headers[0] || []).map((c) => String(c).toLowerCase());
      const iSubj = cols.indexOf('subject');
      const iUid = cols.indexOf('uid');
      const uids = [];
      for (const row of headers.slice(1)) {
        const s = String(row[iSubj] || '');
        if (Array.isArray(row) && s.includes('E2E FlagColor ') && s !== subject) uids.push(row[iUid]);
        if (Array.isArray(row) && s.includes(subject)) uids.push(row[iUid]);
      }
      if (!uids.length) continue;
      await fetch(`/SOGo/so/${enc}/Mail/0/${folder}/batchMove`, {
        method: 'POST', credentials: 'include', headers: hdrs,
        body: JSON.stringify({ uids, folder: '/0/folderTrash' }),
      }).catch(() => {});
    }
  }, USER, xsrf3, SUBJECT);

  // ── 8. Tidak boleh ada error React di console ────────────────────────────
  const realErrors = consoleErrors.filter((e) => !/Download the React DevTools/i.test(e));
  assert.deepEqual(realErrors, [], `tanpa pageerror: ${JSON.stringify(realErrors)}`);

  console.log('✅ e2e-flagcolor-browser: seed v2 → migrasi v3 → warna tampil → move (Arsip) → purge presisi → persist → cleanup lolos');
} catch (err) {
  console.error('❌ e2e-flagcolor-browser GAGAL:', err.message);
  try {
    console.error('pageerrors:', JSON.stringify(consoleErrors));
    console.error('url saat gagal:', page.url());
    const body = await page.evaluate(() => {
      // Buka detail error boundary bila ada (tombol "Lihat Detail Error")
      for (const b of [...document.querySelectorAll('button,summary')]) {
        if (/Detail|Error/i.test(b.textContent || '') && b.click) { try { b.click(); } catch {} }
      }
      return document.body?.innerText?.slice(0, 2500) || '(kosong)';
    });
    console.error('body saat gagal:', body);
    await page.screenshot({ path: '/tmp/e2e-flagcolor-fail.png', fullPage: false });
    console.error('screenshot: /tmp/e2e-flagcolor-fail.png');
  } catch (e2) { console.error('gagal ambil diagnostik:', e2.message); }
  process.exitCode = 1;
} finally {
  await browser?.close();
}