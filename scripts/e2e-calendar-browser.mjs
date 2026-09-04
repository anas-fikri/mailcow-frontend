/**
 * BROWSER E2E — create calendar event end-to-end lewat SPA produksi (Puppeteer).
 *
 * Rantai: login UI diag2 → halaman Calendar → klik "+" di sel hari ini
 * (modal terbuka, tanggal pre-filled) → isi Judul → "Buat Event" → event
 * MUNCUL di grid (react-query invalidate) → RELOAD PENUH → event TETAP ADA
 * (bukti persist di server) → cleanup via UI (Hapus + window.confirm).
 *
 * Regresi utk bug kalender sebelumnya (baris event dibaca dari kunci salah →
 * kalender selalu kosong) dan kontrak saveAsAppointment.
 * Jalankan (opt-in, butuh diag2 aktif): node scripts/e2e-calendar-browser.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';

const HOST = 'https://mail.pcpexpress.co.id';
const USER = process.env.E2E_USER || 'diag2@pcpexpress.co.id';
const PASS = process.env.E2E_PASS || 'DiagTest123!';
const STAMP = Date.now();
const TITLE = `E2E Browser Event ${STAMP}`;
const USER_EMAIL = USER; // dipakai di cleanup (same-origin fetch session)

const log = (...a) => console.log('[e2e-cal]', ...a);
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
  page.setDefaultTimeout(30_000);

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

  // ── 1.5 Pre-cleanup: hapus event uji LAMA (dari run sebelumnya yang cleanup-nya gagal)
  // agar slice(0,3) di sel hari ini tidak penuh event bekas.
  const pre = await page.evaluate(async (userEmail) => {
    const enc = encodeURIComponent(userEmail);
    const s = Math.floor(Date.now() / 1000) - 7 * 86400;
    const e = Math.floor(Date.now() / 1000) + 30 * 86400;
    const xsrf = decodeURIComponent((document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/) || [])[1] || '');
    const hdrs = {
      Accept: 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
      ...(xsrf ? { 'X-XSRF-TOKEN': xsrf } : {}),
    };
    const res = await fetch(`/SOGo/so/${enc}/Calendar/eventsblocks?startDate=${s}&endDate=${e}`, {
      credentials: 'include', headers: hdrs,
    });
    if (!res.ok) return { removed: 0 };
    const data = await res.json();
    const guids = new Set();
    for (const cal of (Array.isArray(data) ? data : [])) {
      const fields = cal?.eventsFields || [];
      const iT = fields.indexOf('c_title');
      const iN = fields.indexOf('c_name');
      for (const row of (cal?.events || cal?.blocks || [])) {
        if (String(row[iT]).includes('E2E Browser Event') && row[iN]) guids.add(row[iN]);
      }
    }
    let removed = 0;
    for (const g of guids) {
      const del = await fetch(`/SOGo/so/${enc}/Calendar/personal/${encodeURIComponent(g)}/delete`, {
        credentials: 'include', headers: hdrs,
      });
      if (del.ok || del.status === 204) removed += 1;
    }
    return { removed };
  }, USER).catch(() => ({ removed: 0 }));
  if (pre.removed > 0) log('pre-cleanup:', pre.removed, 'event uji lama dihapus');

  // ── 2. Buka Calendar ──────────────────────────────────────────────────────
  await page.goto(`${HOST}/webmail/calendar`, { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => location.pathname.endsWith('/calendar'));
  // Tunggu grid termuat (skeleton hilang)
  await page.waitForFunction(() => !document.querySelector('.animate-pulse'), { timeout: 30_000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1000));
  log('halaman calendar terbuka');

  // ── 3. Klik tombol "+" pada sel HARI INI (month view default) ────────────
  const plusClicked = await page.evaluate(() => {
    const btn = document.querySelector('button[title="Buat event di tanggal ini"]');
    if (!btn) return false;
    btn.click();
    return true;
  });
  assert.ok(plusClicked, 'tombol + (Buat event di tanggal ini) ditemukan — pastikan month view tampil');
  await page.waitForFunction(() => document.body.textContent.includes('Event Baru'), { timeout: 15_000 });
  log('modal Event Baru terbuka (tanggal pre-filled hari ini)');

  // ── 4. Isi Judul → klik Buat Event ────────────────────────────────────────
  const titleInput = await page.evaluateHandle(() => {
    const labels = [...document.querySelectorAll('label')];
    const l = labels.find((el) => el.textContent.trim() === 'Judul');
    return l?.nextElementSibling?.querySelector('input') || l?.parentElement?.querySelector('input[placeholder="Nama event"]');
  });
  const titleEl = titleInput.asElement();
  assert.ok(titleEl, 'input Judul ditemukan');
  await titleEl.type(TITLE);
  const createBtn = await page.evaluateHandle(() => {
    const btns = [...document.querySelectorAll('button')];
    return btns.find((b) => b.textContent.trim() === 'Buat Event');
  });
  assert.ok(createBtn && createBtn.asElement(), 'tombol Buat Event ditemukan');
  await createBtn.asElement().click();
  log('judul diisi, klik Buat Event');

  // Modal harus tertutup (toast sukses / hilangnya "Event Baru")
  await page.waitForFunction(() => !document.body.textContent.includes('Event Baru'), { timeout: 30_000 });
  log('modal tertutup (create sukses)');

  // ── 5. Event muncul di grid (month view) ──────────────────────────────────
  await page.waitForFunction(
    (t) => document.body.textContent.includes(t),
    { timeout: 30_000 },
    TITLE,
  );
  log('✅ event muncul di grid');

  // ── 6. RELOAD PENUH — event TETAP ADA = persist di server ────────────────
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForFunction(() => !document.querySelector('.animate-pulse'), { timeout: 30_000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1000));
  await page.waitForFunction(
    (t) => document.body.textContent.includes(t),
    { timeout: 30_000 },
    TITLE,
  );
  log('✅ event TETAP ADA setelah reload penuh (persist di server)');

  // ── 7. Cleanup: cari event by title via eventsblocks (session browser) ───
  // lalu DELETE endpoint SOGo langsung. Lebih andal daripada klik grid event
  // (render chip nested + window.confirm). Sesuai kontrak deleteCalendarEvent.
  const cleanup = await page.evaluate(async (t, userEmail) => {
    const enc = encodeURIComponent(userEmail);
    const s = Math.floor(Date.now() / 1000) - 7 * 86400;
    const e = Math.floor(Date.now() / 1000) + 30 * 86400;
    const xsrf = decodeURIComponent((document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/) || [])[1] || '');
    const hdrs = {
      Accept: 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
      ...(xsrf ? { 'X-XSRF-TOKEN': xsrf } : {}),
    };
    // SOGo kadang 500 transien — retry pola sama dgn api.js (2x, backoff 300ms)
    let res, ok = false;
    for (let a = 0; a < 3 && !ok; a++) {
      if (a > 0) await new Promise((r) => setTimeout(r, 300 * a));
      res = await fetch(`/SOGo/so/${enc}/Calendar/eventsblocks?startDate=${s}&endDate=${e}`, {
        credentials: 'include', headers: hdrs,
      });
      ok = res.ok;
    }
    if (!ok) return { ok: false, why: `eventsblocks ${res.status}` };
    const data = await res.json();
    for (const cal of (Array.isArray(data) ? data : [])) {
      const fields = cal?.eventsFields || [];
      const iT = fields.indexOf('c_title');
      const iN = fields.indexOf('c_name');
      for (const row of (cal?.events || cal?.blocks || [])) {
        if (row[iT] === t && row[iN]) {
          // Delete juga kadang 500 transien — retry 3x backoff
          let st = 0;
          for (let a = 0; a < 3; a++) {
            if (a > 0) await new Promise((r) => setTimeout(r, 300 * a));
            const del = await fetch(`/SOGo/so/${enc}/Calendar/personal/${encodeURIComponent(row[iN])}/delete`, {
              credentials: 'include', headers: hdrs,
            });
            st = del.status;
            if (del.ok || st === 204) return { ok: true, why: `delete ${st}` };
          }
          return { ok: false, why: `delete ${st}` };
        }
      }
    }
    return { ok: false, why: 'event tidak ditemukan' };
  }, TITLE, USER_EMAIL).catch((err) => ({ ok: false, why: err.message }));
  if (cleanup.ok) {
    log('cleanup selesai via API session browser (delete event)');
    await page.reload({ waitUntil: 'networkidle2' }).catch(() => {});
    await page.waitForFunction(
      (t) => !document.body.textContent.includes(t),
      { timeout: 15_000 },
      TITLE,
    ).catch(() => log('warn: masih terlihat setelah delete (cache)'));
  } else {
    log('warn cleanup:', cleanup.why, '— hapus manual bila perlu');
  }

  // ── 8. Tidak boleh ada error React di console ────────────────────────────
  const realErrors = consoleErrors.filter((e) => !/Download the React DevTools/i.test(e));
  assert.deepEqual(realErrors, [], `tanpa pageerror: ${JSON.stringify(realErrors)}`);

  console.log('✅ e2e-calendar-browser: create event end-to-end lolos (muncul + persist + tanpa error React)');
} catch (err) {
  console.error('❌ e2e-calendar-browser GAGAL:', err.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
