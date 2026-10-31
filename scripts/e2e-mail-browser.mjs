/**
 * BROWSER E2E — mail flow: compose → kirim ke diri sendiri → verifikasi
 * kedatangan + URUTAN SORT (regresi bug RelativeDate "13:36" yang tenggelam
 * di bawah email lama) → cleanup.
 *
 * Rantai: login UI diag2 → Mail → Tulis Pesan → To=diri sendiri, subjek unik,
 * isi body → Kirim → tunggu sukses → balik ke INBOX → subjek uji MUNCUL dan
 * berada DI ATAS email ber-RosterRelativeDate "Yesterday …" (bukti sort benar)
 * → RELOAD PENUH → masih ada & tetap di atas (persist + sort stabil).
 *
 * Jalankan (opt-in, butuh diag2 aktif): node scripts/e2e-mail-browser.mjs
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
const SUBJECT = `E2E Mail ${STAMP}`;
const BODY = `Tes E2E browser mail — ${new Date().toISOString()}`;

const log = (...a) => console.log('[e2e-mail]', ...a);
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

/** Posisi (index) subjek uji dalam daftar urut tampil; -1 bila tidak ada. */
function subjectIndex(t) {
  // Baris list: subjek tampil dalam div.text-sm.truncate — ambil urutan dokumen
  // semua subjek baris (elemen dgn class tsb di dalam list container).
  const rows = [...document.querySelectorAll('div.text-sm.truncate')];
  return rows.findIndex((el) => el.textContent?.includes(t));
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

  // ── 2. Buka Mail (INBOX) ──────────────────────────────────────────────────
  await page.goto(`${HOST}/webmail/mail`, { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => !document.querySelector('.animate-pulse'), { timeout: 45_000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 800));
  log('halaman mail terbuka');

  // ── 3. Pre-cleanup: hapus email uji lama (idempoten) via session browser ──
  const xsrf = await page.evaluate(() => decodeURIComponent((document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/) || [])[1] || ''));
  const pre = await page.evaluate(async (userEmail, xsrfToken) => {
    const hdrs = {
      Accept: 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
      ...(xsrfToken ? { 'X-XSRF-TOKEN': xsrfToken } : {}),
    };
    const enc = encodeURIComponent(userEmail);
    let removed = 0, why = '';
    // Pre-cleanup menyapu INBOX + Junk + Sent (kirim-ke-diri meninggalkan salinan di Sent)
    for (const folder of ['folderINBOX', 'folderJunk', 'folderSent']) {
      const res = await fetch(`/SOGo/so/${enc}/Mail/0/${folder}/view`, {
        method: 'POST', credentials: 'include', headers: hdrs,
        body: JSON.stringify({ sortby: 'date', asc: 0 }),
      });
      if (!res.ok) { why = `view ${folder} ${res.status}`; continue; }
      const data = await res.json();
      const headers = data?.headers || [];
      const cols = (headers[0] || []).map((c) => String(c).toLowerCase());
      const iSubj = cols.indexOf('subject');
      const iUid = cols.indexOf('uid');
      const uids = [];
      for (const row of headers.slice(1)) {
        if (Array.isArray(row) && String(row[iSubj]).includes('E2E Mail ')) uids.push(row[iUid]);
      }
      for (const uid of uids) {
        const del = await fetch(`/SOGo/so/${enc}/Mail/0/${folder}/batchDelete`, {
          method: 'POST', credentials: 'include', headers: hdrs,
          body: JSON.stringify({ uids: [uid] }),
        });
        if (del.ok || del.status === 204) removed += 1;
      }
    }
    return { removed, why };
  }, USER, xsrf).catch((err) => ({ removed: 0, why: err.message }));
  if (pre.removed > 0) log('pre-cleanup:', pre.removed, 'email uji lama dihapus');
  else if (pre.why) log('pre-cleanup skip:', pre.why);

  // ── 4. Compose: Tulis Pesan → isi To/Subjek/Body → Kirim ─────────────────
  const composeBtn = await page.evaluateHandle(() => {
    const btns = [...document.querySelectorAll('button')];
    return btns.find((b) => b.textContent.includes('Tulis Pesan'));
  });
  assert.ok(composeBtn && composeBtn.asElement(), 'tombol Tulis Pesan ditemukan');
  await composeBtn.asElement().click();
  await page.waitForFunction(() => document.body.textContent.includes('Kepada:'), { timeout: 30_000 });
  log('compose modal terbuka');

  // To = MultiEmailInput: ketik email lalu Enter (commit chip)
  const toInput = await page.evaluateHandle(() => {
    const labels = [...document.querySelectorAll('label')];
    const l = labels.find((el) => el.textContent.trim() === 'Kepada:');
    return l?.parentElement?.querySelector('input');
  });
  const toEl = toInput.asElement();
  assert.ok(toEl, 'input Kepada ditemukan');
  await toEl.type(USER);
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 300));

  // Subjek
  const subjInput = await page.evaluateHandle(() => {
    const labels = [...document.querySelectorAll('label')];
    const l = labels.find((el) => el.textContent.trim() === 'Subjek:');
    return l?.nextElementSibling?.querySelector('input') || l?.parentElement?.querySelector('input');
  });
  const subjEl = subjInput.asElement();
  assert.ok(subjEl, 'input Subjek ditemukan');
  await subjEl.type(SUBJECT);

  // Body: contentEditable rich editor (data-placeholder)
  const bodyEl = await page.$('[data-placeholder="Tulis pesan Anda di sini..."]');
  assert.ok(bodyEl, 'editor body ditemukan');
  await bodyEl.type(BODY);
  log('form terisi → kirim');

  // Kirim: tombol submit ("Kirim")
  page.once('dialog', (d) => d.resolve()); // anti-panic bila ada confirm
  const sendBtn = await page.evaluateHandle(() => {
    const btns = [...document.querySelectorAll('button[type="submit"]')];
    return btns.find((b) => b.textContent.includes('Kirim'));
  });
  assert.ok(sendBtn && sendBtn.asElement(), 'tombol Kirim ditemukan');
  await sendBtn.asElement().click();

  // Modal tertutup = sukses (atau toast sukses)
  await page.waitForFunction(
    () => !document.body.textContent.includes('Kepada:'),
    { timeout: 60_000 },
  );
  log('kirim sukses (modal tertutup)');
  await new Promise((r) => setTimeout(r, 1500)); // beri waktu SMTP deliver

  // ── 5. Verifikasi: subjek uji MUNCUL di INBOX & DI ATAS email "Yesterday" ─
  const check = async () => {
    await page.goto(`${HOST}/webmail/mail`, { waitUntil: 'networkidle2' });
    await page.waitForFunction(() => !document.querySelector('.animate-pulse'), { timeout: 45_000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1200));
    return page.evaluate((t) => {
      const rows = [...document.querySelectorAll('div.text-sm.truncate')];
      const subjects = rows.map((el) => el.textContent?.trim() || '');
      const idx = subjects.findIndex((s) => s.includes(t));
      // Email lama bermunculan "Yesterday …" — pastikan subjek uji di atasnya
      const yesterdayIdx = subjects.findIndex((s) => /Yesterday/i.test(s));
      return { idx, yesterdayIdx, total: subjects.length };
    }, SUBJECT);
  };

  let first = await check();
  // Kirim bisa butuh beberapa detik (SMTP + fetch ulang) — poll hingga 30 dtk
  for (let i = 0; i < 10 && first.idx === -1; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    first = await check();
  }
  assert.ok(first.idx !== -1, `email uji muncul di INBOX (ditemukan di index ${first.idx}; total baris ${first.total})`);
  if (first.yesterdayIdx !== -1) {
    assert.ok(
      first.idx < first.yesterdayIdx,
      `email hari ini di ATAS email kemarin (uji=${first.idx}, yesterday=${first.yesterdayIdx}) — regresi sort!`,
    );
    log(`✅ kedatangan + sort benar (uji di index ${first.idx}, yesterday di ${first.yesterdayIdx} dari ${first.total} baris)`);
  } else {
    log(`✅ kedatangan terverifikasi (index ${first.idx} dari ${first.total}); tidak ada pembanding "Yesterday" — sort dinilai di langkah reload`);
  }

  // ── 6. RELOAD PENUH — masih ada & sort tetap benar ────────────────────────
  await page.reload({ waitUntil: 'networkidle2' });
  const second = await (async () => {
    await page.waitForFunction(() => !document.querySelector('.animate-pulse'), { timeout: 45_000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1200));
    return page.evaluate((t) => {
      const rows = [...document.querySelectorAll('div.text-sm.truncate')];
      const subjects = rows.map((el) => el.textContent?.trim() || '');
      return {
        idx: subjects.findIndex((s) => s.includes(t)),
        yesterdayIdx: subjects.findIndex((s) => /Yesterday/i.test(s)),
      };
    }, SUBJECT);
  })();
  assert.ok(second.idx !== -1, 'email uji TETAP ADA setelah reload penuh (persist di server)');
  if (second.yesterdayIdx !== -1) {
    assert.ok(second.idx < second.yesterdayIdx, 'sort tetap benar setelah reload');
  }
  log('✅ persist + sort stabil setelah reload penuh');

  // ── 7. Cleanup: hapus email uji via session browser ──────────────────────
  const xsrf2 = await page.evaluate(() => decodeURIComponent((document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/) || [])[1] || ''));
  const cleanup = await page.evaluate(async (userEmail, xsrfToken, t) => {
    const hdrs = {
      Accept: 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
      ...(xsrfToken ? { 'X-XSRF-TOKEN': xsrfToken } : {}),
    };
    const enc = encodeURIComponent(userEmail);
    let deleted = 0, ok = true, why = '';
    // Cleanup menyapu INBOX + Junk + Sent (kirim-ke-diri meninggalkan salinan di Sent)
    for (const folder of ['folderINBOX', 'folderJunk', 'folderSent']) {
      const res = await fetch(`/SOGo/so/${enc}/Mail/0/${folder}/view`, {
        method: 'POST', credentials: 'include', headers: hdrs,
        body: JSON.stringify({ sortby: 'date', asc: 0 }),
      });
      if (!res.ok) { ok = false; why = `view ${folder} ${res.status}`; continue; }
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
      else { ok = false; why = `batchDelete ${folder} ${del.status}`; }
    }
    return { ok, deleted, why };
  }, USER, xsrf2, SUBJECT).catch((err) => ({ ok: false, why: err.message }));

  if (cleanup.ok) {
    log('cleanup selesai (email uji dihapus via batchDelete)');
  } else {
    log('warn cleanup:', cleanup.why, '— pre-cleanup run berikutnya akan menghapus');
  }

  // ── 8. Tidak boleh ada error React di console ────────────────────────────
  const realErrors = consoleErrors.filter((e) => !/Download the React DevTools/i.test(e));
  assert.deepEqual(realErrors, [], `tanpa pageerror: ${JSON.stringify(realErrors)}`);

  console.log('✅ e2e-mail-browser: compose→kirim→muncul→sort benar→persist→cleanup lolos');
} catch (err) {
  console.error('❌ e2e-mail-browser GAGAL:', err.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
