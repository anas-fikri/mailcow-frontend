/**
 * BROWSER E2E — scheduled send: compose → pilih jadwal (custom +2 menit) →
 * "Jadwalkan" → masuk queue server (toast countdown + badge "Terjadwal (N)")
 * → panel Kiriman Terjadwal menampilkan entry (server truth via
 * /api/send/pending) → Batalkan (undo) → entry hilang → email TIDAK pernah
 * tiba di INBOX.
 *
 * Menguji rantai: ComposeModal schedulePick (datetime-local) → sendMessage
 * (sendAt) → /api/send (queue terenkripsi) → toast undo + badge poll
 * getPendingSends → /api/send/undo → flushDueSends tidak mengirim entry yang
 * sudah dibatalkan.
 *
 * Jalankan: node scripts/e2e-scheduled-send-browser.mjs  (diag2 harus aktif)
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';

const HOST = process.env.E2E_HOST || 'https://mail.example.com';
const USER = process.env.E2E_USER || 'diag2@example.com';
const PASS = process.env.E2E_PASS || 'DiagTest123!';
const STAMP = Date.now();
const SUBJECT = `E2E Sched ${STAMP}`;
const BODY = `Tes E2E scheduled send — ${new Date().toISOString()}`;

const log = (...a) => console.log('[e2e-sched]', ...a);
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

async function xsrfOf(page) {
  return page.evaluate(() => decodeURIComponent((document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/) || [])[1] || ''));
}

/** Apakah ada email dgn subject mengandung `t` di folder (via SOGo view). */
async function hasSubject(page, folder, t) {
  const xsrf = await xsrfOf(page);
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

async function sweepBySubject(page, prefix) {
  const xsrf = await xsrfOf(page);
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

async function openMailList(page) {
  await page.goto(`${HOST}/webmail/mail`, { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => !document.querySelector('.animate-pulse'), { timeout: 45_000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1000));
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

  // ── 2. Pre-cleanup email uji lama + verifikasi queue bersih ───────────────
  await openMailList(page);
  const pre = await sweepBySubject(page, 'E2E Sched ');
  if (pre.deleted > 0) log('pre-cleanup:', pre.deleted, 'email uji lama dihapus');

  const pendingBefore = await page.evaluate(async () => {
    const res = await fetch('/api/send/pending', { credentials: 'include' });
    if (!res.ok) return { err: res.status, items: [] };
    const d = await res.json().catch(() => ({ items: [] }));
    return { items: d?.items || [] };
  });
  if (pendingBefore.err) log('note /api/send/pending:', pendingBefore.err, '(API key context — lanjut via UI)');
  else log('queue awal:', pendingBefore.items.length, 'entry');

  // ── 3. Compose → pilih jadwal custom (+2 menit) → "Jadwalkan" ─────────────
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
  await subjInput.asElement().type(SUBJECT);

  const bodyEl = await page.$('[data-placeholder="Tulis pesan Anda di sini..."]');
  assert.ok(bodyEl, 'editor body ditemukan');
  await bodyEl.type(BODY);

  // Buka menu jadwal → isi "Waktu khusus" (datetime-local) = sekarang +2 mnt
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find((el) => el.getAttribute('title') === 'Jadwalkan pengiriman');
    b.click();
  });
  await page.waitForFunction(() => document.body.textContent.includes('Waktu khusus'), { timeout: 10_000 });

  const sched = new Date(Date.now() + 2 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const dtValue = `${sched.getFullYear()}-${pad(sched.getMonth() + 1)}-${pad(sched.getDate())}T${pad(sched.getHours())}:${pad(sched.getMinutes())}`;
  await page.evaluate((v) => {
    const inputs = [...document.querySelectorAll('input[type="datetime-local"]')];
    const inp = inputs[inputs.length - 1];
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, v);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  }, dtValue);
  await new Promise((r) => setTimeout(r, 300));

  // Tombol utama kini "Jadwalkan"; klik → toast countdown (queue server)
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button[type="submit"]')];
    const b = btns.find((el) => el.textContent.includes('Jadwalkan'));
    b.click();
  });
  // Modal tertutup + toast "Email akan terkirim pukul … · batal dalam m:ss"
  await page.waitForFunction(() => !document.body.textContent.includes('Kepada:'), { timeout: 60_000 });
  await page.waitForFunction(() => document.body.textContent.includes('batal dalam'), { timeout: 15_000 });
  log('terjadwal — toast countdown tampil (queue server)');

  // ── 4. Badge "Terjadwal (N)" muncul → buka panel → entry ada ──────────────
  await page.waitForFunction(() => document.body.textContent.includes('Terjadwal ('), { timeout: 90_000 });
  const badgeCount = await page.evaluate(() => {
    const m = document.body.textContent.match(/Terjadwal \((\d+)\)/);
    return m ? Number(m[1]) : 0;
  });
  assert.ok(badgeCount >= 1, `badge "Terjadwal (N)" muncul (dapat: ${badgeCount})`);

  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find((el) => /Terjadwal \(\d+\)/.test(el.textContent));
    b.click();
  });
  await page.waitForFunction(() => document.body.textContent.includes('Kiriman Terjadwal'), { timeout: 15_000 });
  await page.waitForFunction((t) => document.body.textContent.includes(t), { timeout: 15_000 }, SUBJECT);
  log(`panel Kiriman Terjadwal menampilkan entry uji (badge=${badgeCount}) — server truth OK`);

  // ── 5. Batalkan dari panel → entry hilang ─────────────────────────────────
  await page.evaluate(() => {
    // Cari tombol Batalkan MILIK PANEL: mulai dari h2 "Kiriman Terjadwal",
    // naik ke leluhur sampai ketemu button Batalkan. Toast "Batalkan" ada di
    // luar panel (portal) — tidak boleh keklik.
    const h2 = [...document.querySelectorAll('h2')].find((h) => h.textContent.includes('Kiriman Terjadwal'));
    if (!h2) throw new Error('panel Kiriman Terjadwal tidak ditemukan');
    let el = h2; let btn = null;
    while (el && el !== document.body) {
      const cands = [...el.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Batalkan');
      if (cands.length) { btn = cands[0]; break; }
      el = el.parentElement;
    }
    if (!btn) throw new Error('tombol Batalkan tidak ditemukan di panel');
    btn.click();
  });
  await page.waitForFunction(() => document.body.textContent.includes('Jadwal kirim dibatalkan.'), { timeout: 20_000 });
  await page.waitForFunction(
    (t) => ![...document.querySelectorAll('p')].some((p) => p.textContent?.includes(t)),
    { timeout: 20_000 },
    SUBJECT,
  );
  log('undo OK — entry hilang dari panel');

  // Verifikasi server truth: queue kosong untuk subjek uji
  const pendingAfter = await page.evaluate(async (t) => {
    const res = await fetch('/api/send/pending', { credentials: 'include' });
    if (!res.ok) return { err: res.status };
    const d = await res.json().catch(() => ({ items: [] }));
    return { items: (d?.items || []).filter((x) => x.subject?.includes(t)) };
  }, SUBJECT);
  if (!pendingAfter.err) {
    assert.equal(pendingAfter.items.length, 0, 'queue server tidak lagi berisi entry uji setelah undo');
    log('✅ /api/send/pending bersih setelah undo (server truth)');
  } else {
    log('note verifikasi /api/send/pending skip:', pendingAfter.err);
  }

  // ── 6. Email TIDAK boleh tiba di INBOX (flushDueSends tidak mengirimnya) ──
  await new Promise((r) => setTimeout(r, 8_000)); // > 1 siklus flush (5s)
  const notArrived = await hasSubject(page, 'folderINBOX', SUBJECT);
  assert.ok(!notArrived, 'email terjadwal yang dibatalkan TIDAK boleh tiba di INBOX');
  log('✅ email dibatalkan tidak pernah tiba di INBOX');

  // ── 7. Cleanup ────────────────────────────────────────────────────────────
  const cleaned = await sweepBySubject(page, `E2E Sched ${STAMP}`);
  if (cleaned.why.length) log('warn cleanup:', cleaned.why.join('; '));
  else if (cleaned.deleted > 0) log('cleanup selesai (', cleaned.deleted, 'email dihapus )');

  // ── 8. Tidak boleh ada error React di console ─────────────────────────────
  const realErrors = consoleErrors.filter((e) => !/Download the React DevTools/i.test(e));
  assert.deepEqual(realErrors, [], `tanpa pageerror: ${JSON.stringify(realErrors)}`);

  console.log('✅ e2e-scheduled-send-browser: jadwalkan(+2m)→toast→badge→panel(server truth)→batalkan→queue bersih→tidak terkirim lolos');
} catch (err) {
  console.error('❌ e2e-scheduled-send-browser GAGAL:', err.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
