/**
 * BROWSER E2E — reply-with-attachment: compose→kirim ke diri sendiri → buka
 * email → Balas (quote terisi) → tambah lampiran → kirim → verifikasi balasan
 * masuk INBOX DENGAN lampiran → cleanup.
 *
 * Menguji rantai penuh turunan compose: MessageReader.handleReply (quote +
 * composeMode 'reply') → ComposeModal (To/Subject prefilled) → upload lampiran
 * → sendMessage (attachments base64) → SMTP → INBOX → MessageReader render
 * nama lampiran. Bug kelas yang dijaga: quote hilang, To salah, lampiran
 * tidak ikut saat reply (varian dari bug draft-attach yang pernah ditemukan).
 *
 * Jalankan: node scripts/e2e-reply-attach-browser.mjs  (diag2 harus aktif)
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';

const HOST = process.env.E2E_HOST || 'https://mail.pcpexpress.co.id';
const USER = process.env.E2E_USER || 'diag2@pcpexpress.co.id';
const PASS = process.env.E2E_PASS || 'DiagTest123!';
const STAMP = Date.now();
const SUBJECT = `E2E Reply ${STAMP}`;      // email induk (kirim ke diri sendiri)
const BODY = `Tes E2E reply-attach — ${new Date().toISOString()}`;
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const log = (...a) => console.log('[e2e-reply]', ...a);
let browser;

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

/** Hapus email uji (subject contains `prefix`) di INBOX/Junk/Sent via sesi browser. */
async function sweepBySubject(page, prefix) {
  const xsrf = await page.evaluate(() => decodeURIComponent((document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/) || [])[1] || ''));
  return page.evaluate(async (userEmail, xsrfToken, t) => {
    const hdrs = {
      Accept: 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
      ...(xsrfToken ? { 'X-XSRF-TOKEN': xsrfToken } : {}),
    };
    const enc = encodeURIComponent(userEmail);
    let deleted = 0; const why = [];
    for (const folder of ['folderINBOX', 'folderJunk', 'folderSent']) {
      const res = await fetch(`/SOGo/so/${enc}/Mail/0/${folder}/view`, {
        method: 'POST', credentials: 'include', headers: hdrs,
        body: JSON.stringify({ sortby: 'date', asc: 0 }),
      });
      if (!res.ok) { why.push(`view ${folder} ${res.status}`); continue; }
      const data = await res.json();
      const headers = data?.headers || [];
      const cols = (headers[0] || []).map((c) => String(c).toLowerCase());
      const iSubj = cols.indexOf('subject');
      const iUid = cols.indexOf('uid');
      const uids = [];
      for (const row of headers.slice(1)) {
        if (Array.isArray(row) && String(row[iSubj]).includes(t)) uids.push(row[iUid]);
      }
      if (!uids.length) continue;
      const del = await fetch(`/SOGo/so/${enc}/Mail/0/${folder}/batchDelete`, {
        method: 'POST', credentials: 'include', headers: hdrs,
        body: JSON.stringify({ uids }),
      });
      if (del.ok || del.status === 204) deleted += uids.length;
      else why.push(`batchDelete ${folder} ${del.status}`);
    }
    return { deleted, why };
  }, USER, xsrf, prefix).catch((err) => ({ deleted: 0, why: [err.message] }));
}

/** Apakah ada email dgn subject mengandung `t` di folder (via SOGo view). */
async function hasSubject(page, folder, t) {
  const xsrf = await page.evaluate(() => decodeURIComponent((document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/) || [])[1] || ''));
  return page.evaluate(async (userEmail, xsrfToken, f, s) => {
    const hdrs = {
      Accept: 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
      ...(xsrfToken ? { 'X-XSRF-TOKEN': xsrfToken } : {}),
    };
    const res = await fetch(`/SOGo/so/${encodeURIComponent(userEmail)}/Mail/0/${f}/view`, {
      method: 'POST', credentials: 'include', headers: hdrs,
      body: JSON.stringify({ sortby: 'date', asc: 0 }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    const headers = data?.headers || [];
    const cols = (headers[0] || []).map((c) => String(c).toLowerCase());
    const iSubj = cols.indexOf('subject');
    return headers.slice(1).some((row) => Array.isArray(row) && String(row[iSubj]).includes(s));
  }, USER, xsrf, folder, t);
}

async function openMailList(page) {
  await page.goto(`${HOST}/webmail/mail`, { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => !document.querySelector('.animate-pulse'), { timeout: 45_000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1000));
}

/** Klik baris email dengan subjek `t` di daftar → reader terbuka. */
async function openRow(page, t) {
  const clicked = await page.evaluate((s) => {
    const rows = [...document.querySelectorAll('div.text-sm.truncate')];
    const row = rows.find((el) => el.textContent?.includes(s));
    if (!row) return false;
    row.click();
    return true;
  }, t);
  assert.ok(clicked, `baris "${t}" ditemukan di daftar`);
  await new Promise((r) => setTimeout(r, 1200));
}

async function composeFillAndSend(page, { subject, body, attachPath, attName }) {
  const composeBtn = await page.evaluateHandle(() => {
    const btns = [...document.querySelectorAll('button')];
    return btns.find((b) => b.textContent.includes('Tulis Pesan'));
  });
  assert.ok(composeBtn && composeBtn.asElement(), 'tombol Tulis Pesan ditemukan');
  await composeBtn.asElement().click();
  await page.waitForFunction(() => document.body.textContent.includes('Kepada:'), { timeout: 30_000 });

  const toInput = await page.evaluateHandle(() => {
    const labels = [...document.querySelectorAll('label')];
    const l = labels.find((el) => el.textContent.trim() === 'Kepada:');
    return l?.parentElement?.querySelector('input');
  });
  assert.ok(toInput.asElement(), 'input Kepada ditemukan');
  await toInput.asElement().type(USER);
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 300));

  const subjInput = await page.evaluateHandle(() => {
    const labels = [...document.querySelectorAll('label')];
    const l = labels.find((el) => el.textContent.trim() === 'Subjek:');
    return l?.nextElementSibling?.querySelector('input') || l?.parentElement?.querySelector('input');
  });
  assert.ok(subjInput.asElement(), 'input Subjek ditemukan');
  await subjInput.asElement().type(subject);

  const bodyEl = await page.$('[data-placeholder="Tulis pesan Anda di sini..."]');
  assert.ok(bodyEl, 'editor body ditemukan');
  await bodyEl.type(body);

  if (attachPath) {
    const attachInput = await page.$('input[type="file"][multiple]');
    assert.ok(attachInput, 'input file lampiran ditemukan');
    await attachInput.uploadFile(attachPath);
    await page.waitForFunction((n) => document.body.textContent.includes(n), { timeout: 15_000 }, attName);
  }

  page.once('dialog', (d) => d.resolve());
  // Klik Kirim via evaluate (query ulang di browser) — evaluateHandle+click
  // bisa kena stale node saat React re-render → "not clickable" flake.
  const clickedSend = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button[type="submit"]')];
    const b = btns.find((el) => el.textContent.includes('Kirim'));
    if (!b) return false;
    b.click();
    return true;
  });
  assert.ok(clickedSend, 'tombol Kirim ditemukan & diklik');
  await page.waitForFunction(() => !document.body.textContent.includes('Kepada:'), { timeout: 60_000 });
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
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.setDefaultTimeout(45_000);

  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  // ── 1. Login via UI ────────────────────────────────────────────────────────
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
  log('login OK →', await page.url());

  // ── 2. Pre-cleanup email uji lama (idempoten) ─────────────────────────────
  await openMailList(page);
  const pre = await sweepBySubject(page, 'E2E Reply ');
  if (pre.deleted > 0) log('pre-cleanup:', pre.deleted, 'email uji lama dihapus');
  else if (pre.why.length) log('pre-cleanup skip:', pre.why.join('; '));

  // ── 3. Kirim email induk ke diri sendiri ──────────────────────────────────
  await composeFillAndSend(page, { subject: SUBJECT, body: BODY });
  log('email induk terkirim');
  await new Promise((r) => setTimeout(r, 1500));

  let arrived = await hasSubject(page, 'folderINBOX', SUBJECT);
  // Postfix bisa mengantri 20-60+ detik (delays=25-32s terlihat di log produksi;
  // kadang baru terkirim saat retry) — poll hingga 90 dtk, bukan 30.
  for (let i = 0; i < 30 && !arrived; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    arrived = await hasSubject(page, 'folderINBOX', SUBJECT);
  }
  assert.ok(arrived, 'email induk muncul di INBOX (server truth)');
  log('email induk tiba di INBOX');

  // ── 4. Buka email → klik Balas → compose reply terisi quote ───────────────
  await openMailList(page);
  await openRow(page, SUBJECT);
  await page.waitForFunction(() => !!document.querySelector('[data-shortcut="reply"]'), { timeout: 30_000 });
  log('reader terbuka');

  // Klik via evaluate (bukan page.click) — reader bisa re-render di antara
  // query dan hit-test puppeteer → "not clickable" flake.
  await page.evaluate(() => document.querySelector('[data-shortcut="reply"]').click());
  await page.waitForFunction(() => document.body.textContent.includes('Kepada:'), { timeout: 30_000 });
  // Quote reply harus ada (Dari:/Subjek:) + subjek jadi Re: ...
  await page.waitForFunction(() => document.body.textContent.includes('Dari:'), { timeout: 15_000 });
  const reSubject = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('label')];
    const l = labels.find((el) => el.textContent.trim() === 'Subjek:');
    const input = l?.nextElementSibling?.querySelector('input') || l?.parentElement?.querySelector('input');
    return input?.value || '';
  });
  assert.ok(reSubject.startsWith('Re:') && reSubject.includes(SUBJECT), `subjek reply = "Re: ${SUBJECT}" (dapat: "${reSubject}")`);
  log('compose reply terbuka — quote + Re: benar');

  // ── 5. Tambah lampiran pada reply → kirim ─────────────────────────────────
  const ATT_NAME = `E2E-attach-${STAMP}.png`;
  const attPath = join(tmpdir(), ATT_NAME);
  writeFileSync(attPath, Buffer.from(PNG_B64, 'base64'));
  const attachInput = await page.$('input[type="file"][multiple]');
  assert.ok(attachInput, 'input file lampiran (reply) ditemukan');
  await attachInput.uploadFile(attPath);
  await page.waitForFunction((n) => document.body.textContent.includes(n), { timeout: 15_000 }, ATT_NAME);
  log('lampiran terpasang pada reply:', ATT_NAME);

  page.once('dialog', (d) => d.resolve());
  const clickedSend = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button[type="submit"]')];
    const b = btns.find((el) => el.textContent.includes('Kirim'));
    if (!b) return false;
    b.click();
    return true;
  });
  assert.ok(clickedSend, 'tombol Kirim (reply) ditemukan & diklik');
  try {
    // PENTING: reader tetap terbuka di belakang modal reply dan header-nya juga
    // memuat "Kepada:" — jadi penanda tutup = placeholder editor compose hilang.
    await page.waitForFunction(() => !document.querySelector('[data-placeholder="Tulis pesan Anda di sini..."]'), { timeout: 60_000 });
  } catch {
    // Diagnostik: apa yang tertulis di modal (error state?) saat kirim gagal
    const diag = await page.evaluate(() => {
      const errs = [...document.querySelectorAll('[role="alert"], .text-destructive, .text-red-500')]
        .map((el) => el.textContent?.trim()).filter(Boolean);
      const btn = [...document.querySelectorAll('button[type="submit"]')].map((b) => b.textContent?.trim());
      return { errs, btn, body: document.body.textContent.slice(0, 400) };
    });
    throw new Error(`modal reply tidak tertutup setelah kirim — errors=${JSON.stringify(diag.errs)} buttons=${JSON.stringify(diag.btn)}`);
  }
  log('reply terkirim');
  await new Promise((r) => setTimeout(r, 1500));

  // ── 6. Verifikasi balasan masuk INBOX dengan lampiran ─────────────────────
  const RE_SUBJECT = `Re: ${SUBJECT}`;
  let replyArrived = await hasSubject(page, 'folderINBOX', RE_SUBJECT);
  // PENTING (perilaku produk): kirim dengan LAMPIRAN lewat /api/send (proxy)
  // yang SELALU menahan di queue undo 3 menit (SEND_UNDO_SECONDS) sebelum
  // di-flush — jadi balasan+lamiran tiba ±3,5 menit setelah kirim. Poll
  // hingga 5 menit agar tidak false-fail (bukan bug, memang by design).
  for (let i = 0; i < 100 && !replyArrived; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    replyArrived = await hasSubject(page, 'folderINBOX', RE_SUBJECT);
  }
  assert.ok(replyArrived, `balasan "${RE_SUBJECT}" muncul di INBOX (server truth)`);

  await openMailList(page);
  await openRow(page, RE_SUBJECT);
  // Reader harus merender nama lampiran (extractAttachments → chip nama file)
  await page.waitForFunction((n) => document.body.textContent.includes(n), { timeout: 30_000 }, ATT_NAME);
  log('✅ balasan terbuka dan LAMPIRAN ter-render di reader');

  // ── 7. Cleanup email uji (induk + reply, INBOX/Junk/Sent) ─────────────────
  const cleaned = await sweepBySubject(page, `E2E Reply ${STAMP}`);
  if (cleaned.why.length) log('warn cleanup:', cleaned.why.join('; '));
  else log('cleanup selesai (', cleaned.deleted, 'email dihapus )');

  // ── 8. Tidak boleh ada error React di console ─────────────────────────────
  const realErrors = consoleErrors.filter((e) => !/Download the React DevTools/i.test(e));
  assert.deepEqual(realErrors, [], `tanpa pageerror: ${JSON.stringify(realErrors)}`);

  console.log('✅ e2e-reply-attach-browser: kirim→buka→balas(quote+Re:)→lampir→kirim→INBOX+lampiran ter-render→cleanup lolos');
} catch (err) {
  console.error('❌ e2e-reply-attach-browser GAGAL:', err.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
