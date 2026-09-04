/**
 * BROWSER E2E — auto-capture kontak eksternal setelah kirim sukses (pola Gmail).
 *
 * Rantai: login UI diag2 → Tulis Pesan → To = alamat EKSTERNAL unik
 * (TLD .example, reserved — tidak pernah terkirim sungguhan; SOGo tetap
 * menerima & mengirim ke antrean) → Kirim → poll Contacts/personal/view
 * sampai alamat eksternal itu MUNCUL sebagai kontak (bukti capture jalan
 * di bundle produksi) → cleanup kontak + sweep DSN bounce (kirim ke TLD
 * reserved memicu "Undelivered Mail" dari MAILER-DAEMON ke INBOX).
 *
 * Regresi untuk chokepoint captureExternalContacts di api.js sendMessage
 * (fire-and-forget; filter self/no-reply/known personal+GAL).
 * Jalankan (opt-in, butuh diag2 aktif): node scripts/e2e-contact-capture-browser.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import puppeteerPkg from 'puppeteer';
// Interop penting: beberapa setup CJS-interop kehilangan .default (disebabkan
// urutan resolusi inline vs file — terbukti di mesin ini 2026-09-04), yang
// membuat `findChrome()` tidak pernah dipanggil dan launch memakai default
// cache 151 yang TIDAK LENGKAP → libatk error. Ambil constructor eksplisit.
const puppeteer = puppeteerPkg?.default ?? puppeteerPkg;

const HOST = 'https://mail.pcpexpress.co.id';
const USER = process.env.E2E_USER || 'diag2@pcpexpress.co.id';
const PASS = process.env.E2E_PASS || 'DiagTest123!';
const STAMP = Date.now();
const EMAIL = `capture.e2e.${STAMP}@contoh.example`; // TLD reserved → tidak pernah terkirim nyata
const SUBJECT = `E2E Capture ${STAMP}`;

const log = (...a) => console.log('[e2e-capture]', ...a);
let browser;

function findChrome() {
  const root = process.env.PUPPETEER_CACHE_DIR || join(homedir(), '.cache', 'puppeteer');
  for (const dir of ['chrome', 'chrome-headless-shell']) {
    const base = join(root, dir);
    if (!existsSync(base)) continue;
    for (const v of readdirSync(base).sort().reverse()) {
      const inner = join(base, v);
      const bin = join(inner, readdirSync(inner)[0], dir === 'chrome' ? 'chrome' : 'chrome-headless-shell');
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

/** Hapus dari INBOX pesan DSN/bounce utk alamat uji (subjek Undelivered/dari MAILER-DAEMON). */
async function sweepBounces(page, userEmail, xsrfToken) {
  return page.evaluate(async (u, token) => {
    const enc = encodeURIComponent(u);
    const hdrs = {
      Accept: 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/json',
      ...(token ? { 'X-XSRF-TOKEN': token } : {}),
    };
    const res = await fetch(`/SOGo/so/${enc}/Mail/0/folderINBOX/view`, {
      method: 'POST', credentials: 'include', headers: hdrs,
      body: JSON.stringify({ sortby: 'date', asc: 0 }),
    });
    if (!res.ok) return 0;
    const data = await res.json();
    const headers = data?.headers || [];
    const cols = (headers[0] || []).map((c) => String(c).toLowerCase());
    const iSubj = cols.indexOf('subject');
    const iFrom = cols.indexOf('from');
    const iUid = cols.indexOf('uid');
    const uids = [];
    for (const row of headers.slice(1)) {
      if (!Array.isArray(row) || row.length <= iUid) continue;
      const subj = String(row[iSubj] || '');
      const from = String(row[iFrom] || '');
      if (/undeliver|returned to sender|mail delivery/i.test(subj) || /mailer-daemon|postmaster/i.test(from)) {
        uids.push(row[iUid]);
      }
    }
    if (!uids.length) return 0;
    const del = await fetch(`/SOGo/so/${enc}/Mail/0/folderINBOX/batchDelete`, {
      method: 'POST', credentials: 'include', headers: hdrs,
      body: JSON.stringify({ uids }),
    });
    return (del.ok || del.status === 204) ? uids.length : 0;
  }, userEmail, xsrfToken).catch(() => 0);
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

  // ── 2. Pre-cleanup: kontak uji lama (idempoten) via session browser ───────
  const xsrf = await page.evaluate(() =>
    decodeURIComponent((document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/) || [])[1] || ''));
  await page.evaluate(async (u, token) => {
    const enc = encodeURIComponent(u);
    const hdrs = {
      Accept: 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
      ...(token ? { 'X-XSRF-TOKEN': token } : {}),
    };
    const res = await fetch(`/SOGo/so/${enc}/Contacts/personal/view`, { credentials: 'include', headers: hdrs });
    if (!res.ok) return;
    const data = await res.json();
    const cols = data?.headers?.[0] || [];
    const iMail = cols.indexOf('c_mail');
    const iUid = cols.indexOf('id') !== -1 ? cols.indexOf('id') : cols.indexOf('c_uid'); // view SOGo: c_uid bisa null — uid kartu ada di kolom id
    for (const row of (data?.headers || []).slice(1)) {
      if (Array.isArray(row) && String(row[iMail] || '').includes('capture.e2e.') && row[iUid]) {
        await fetch(`/SOGo/so/${enc}/Contacts/personal/${encodeURIComponent(row[iUid])}/delete`, {
          credentials: 'include', headers: hdrs,
        });
      }
    }
  }, USER, xsrf).catch(() => {});
  log('pre-cleanup kontak uji lama selesai');

  // ── 3. Compose UI: To = alamat eksternal → Kirim ──────────────────────────
  await page.goto(`${HOST}/webmail/mail`, { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => !document.querySelector('.animate-pulse'), { timeout: 45_000 }).catch(() => {});
  const composeBtn = await page.evaluateHandle(() =>
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Tulis Pesan')));
  assert.ok(composeBtn && composeBtn.asElement(), 'tombol Tulis Pesan ditemukan');
  await composeBtn.asElement().click();
  await page.waitForFunction(() => document.body.textContent.includes('Kepada:'), { timeout: 30_000 });

  const toInput = await page.evaluateHandle(() => {
    const l = [...document.querySelectorAll('label')].find((el) => el.textContent.trim() === 'Kepada:');
    return l?.parentElement?.querySelector('input');
  });
  assert.ok(toInput.asElement(), 'input Kepada ditemukan');
  await toInput.asElement().type(EMAIL);
  await page.keyboard.press('Enter'); // commit chip
  await new Promise((r) => setTimeout(r, 300));

  const subjEl = await page.evaluateHandle(() => {
    const l = [...document.querySelectorAll('label')].find((el) => el.textContent.trim() === 'Subjek:');
    return l?.nextElementSibling?.querySelector('input') || l?.parentElement?.querySelector('input');
  });
  assert.ok(subjEl.asElement(), 'input Subjek ditemukan');
  await subjEl.asElement().type(SUBJECT);

  const bodyEl = await page.$('[data-placeholder="Tulis pesan Anda di sini..."]');
  assert.ok(bodyEl, 'editor body ditemukan');
  await bodyEl.type('Tes auto-capture kontak eksternal.');

  page.once('dialog', (d) => d.resolve());
  const sendBtn = await page.evaluateHandle(() =>
    [...document.querySelectorAll('button[type="submit"]')].find((b) => b.textContent.includes('Kirim')));
  assert.ok(sendBtn && sendBtn.asElement(), 'tombol Kirim ditemukan');
  await sendBtn.asElement().click();
  await page.waitForFunction(() => !document.body.textContent.includes('Kepada:'), { timeout: 60_000 });
  log('kirim sukses (modal tertutup) — menunggu capture fire-and-forget');

  // ── 4. Poll Contacts/personal/view sampai alamat eksternal muncul ────────
  // Capture berjalan setelah kirim (fetchContacts → createContact) — beri waktu.
  let found = false;
  for (let i = 0; i < 15 && !found; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    found = await page.evaluate(async (u, token, em) => {
      const enc = encodeURIComponent(u);
      const hdrs = {
        Accept: 'application/json, text/plain, */*',
        'X-Requested-With': 'XMLHttpRequest',
        ...(token ? { 'X-XSRF-TOKEN': token } : {}),
      };
      const res = await fetch(`/SOGo/so/${enc}/Contacts/personal/view`, { credentials: 'include', headers: hdrs });
      if (!res.ok) return false;
      const data = await res.json();
      const cols = data?.headers?.[0] || [];
      const iMail = cols.indexOf('c_mail');
      return (data?.headers || []).slice(1).some((row) =>
        Array.isArray(row) && String(row[iMail] || '').toLowerCase() === em.toLowerCase());
    }, USER, xsrf, EMAIL).catch(() => false);
  }
  assert.ok(found, `alamat eksternal otomatis tersimpan sebagai kontak (${EMAIL})`);
  log('✅ kontak eksternal otomatis tersimpan');

  // ── 6. Cleanup: hapus kontak uji + sweep DSN bounce (delayed, bisa datang belakangan)
  const cleaned = await page.evaluate(async (u, token, em) => {
    const enc = encodeURIComponent(u);
    const hdrs = {
      Accept: 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
      ...(token ? { 'X-XSRF-TOKEN': token } : {}),
    };
    const res = await fetch(`/SOGo/so/${enc}/Contacts/personal/view`, { credentials: 'include', headers: hdrs });
    if (!res.ok) return false;
    const data = await res.json();
    const cols = data?.headers?.[0] || [];
    const iMail = cols.indexOf('c_mail');
    const iUid = cols.indexOf('id') !== -1 ? cols.indexOf('id') : cols.indexOf('c_uid'); // view SOGo: c_uid bisa null — uid kartu ada di kolom id
    let ok = false;
    for (const row of (data?.headers || []).slice(1)) {
      if (Array.isArray(row) && String(row[iMail] || '').toLowerCase() === em.toLowerCase() && row[iUid]) {
        const del = await fetch(`/SOGo/so/${enc}/Contacts/personal/${encodeURIComponent(row[iUid])}/delete`, {
          credentials: 'include', headers: hdrs,
        });
        ok = del.ok || del.status === 204;
      }
    }
    return ok;
  }, USER, xsrf, EMAIL).catch(() => false);
  log(cleaned ? 'cleanup kontak uji selesai' : 'warn cleanup gagal — pre-cleanup run berikutnya menangkap');
  await new Promise((r) => setTimeout(r, 2000));
  const bounces = await sweepBounces(page, USER, xsrf);
  if (bounces > 0) log('sweep bounce:', bounces, 'DSN dihapus');

  // ── 7. Tidak boleh ada error React di console ────────────────────────────
  const realErrors = consoleErrors.filter((e) => !/Download the React DevTools/i.test(e));
  assert.deepEqual(realErrors, [], `tanpa pageerror: ${JSON.stringify(realErrors)}`);

  console.log('✅ e2e-contact-capture-browser: kirim ke external → kontak otomatis tersimpan → cleanup lolos');
} catch (err) {
  console.error('❌ e2e-contact-capture-browser GAGAL:', err.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
