/**
 * BROWSER E2E — flow "Bukan Spam" folder Junk end-to-end lewat SPA produksi
 * (Puppeteer).
 *
 * Rantai: login UI diag2 → (session) kirim email uji ke diri sendiri → pindah
 * ke folderJunk via moveMessages (persis flow native SOGo) → UI: buka folder
 * Junk/Spam → row uji tampil → hover → klik "Bukan Spam" (ShieldCheck) →
 * row HILANG dari Junk (regresi bug lama: POST 204 tanpa move = pesan
 * diam di tempat) → folder Kotak Masuk → row MUNCUL di INBOX →
 * RELOAD PENUH → masih di INBOX & tidak kembali ke Junk (persist server).
 *
 * Regresi untuk fitur markMessagesAsNotJunk (laporan not-spam best-effort +
 * moveMessages → folderINBOX) di toolbar/per-baris reader & list.
 * Jalankan (opt-in, butuh diag2 aktif): node scripts/e2e-notjunk-browser.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';

const HOST = 'https://mail.example.com';
const USER = process.env.E2E_USER || 'diag2@example.com';
const PASS = process.env.E2E_PASS || 'DiagTest123!';
const STAMP = Date.now();
const SUBJECT = `E2E NotJunk ${STAMP}`;
const BODY = `Tes E2E bukan-spam — ${new Date().toISOString()}`;

const log = (...a) => console.log('[e2e-notjunk]', ...a);
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

/** Index kolom list view (kontrak buildMessageViewBody / MSG_FIELD). */
const COLS = { SUBJECT: 3, UID: 10 };
/** POST view dgn headers SPA — balikan {ok, uids, subjects}. */
async function viewFolder(page, folder, userEmail, xsrfToken) {
  return page.evaluate(async (f, u, token, cols) => {
    const enc = encodeURIComponent(u);
    let res;
    for (let a = 0; a < 3; a++) {
      if (a > 0) await new Promise((r) => setTimeout(r, 300 * a));
      res = await fetch(`/SOGo/so/${enc}/Mail/0/${f}/view`, {
        method: 'POST', credentials: 'include',
        headers: {
          Accept: 'application/json, text/plain, */*',
          'X-Requested-With': 'XMLHttpRequest',
          'Content-Type': 'application/json',
          ...(token ? { 'X-XSRF-TOKEN': token } : {}),
        },
        body: JSON.stringify({ sortby: 'date', asc: 0, limit: 50 }),
      });
      if (res.ok) break;
    }
    if (!res?.ok) return { ok: false, why: `view ${res?.status}` };
    const data = await res.json();
    const headers = data?.headers || [];
    const uids = [], subjects = [];
    for (const row of headers.slice(1)) {
      if (!Array.isArray(row) || row.length <= cols.UID) continue;
      uids.push(row[cols.UID]);
      subjects.push(String(row[cols.SUBJECT] || ''));
    }
    return { ok: true, uids, subjects };
  }, folder, userEmail, xsrfToken, COLS).catch((err) => ({ ok: false, why: err.message }));
}

/** batchDelete uids di folder — balikan status akhir. */
async function batchDelete(page, folder, uids, userEmail, xsrfToken) {
  return page.evaluate(async (f, ids, u, token) => {
    const enc = encodeURIComponent(u);
    let st = 0;
    for (let a = 0; a < 3; a++) {
      if (a > 0) await new Promise((r) => setTimeout(r, 300 * a));
      const del = await fetch(`/SOGo/so/${enc}/Mail/0/${f}/batchDelete`, {
        method: 'POST', credentials: 'include',
        headers: {
          Accept: 'application/json, text/plain, */*',
          'X-Requested-With': 'XMLHttpRequest',
          'Content-Type': 'application/json',
          ...(token ? { 'X-XSRF-TOKEN': token } : {}),
        },
        body: JSON.stringify({ uids: ids.map(Number) }),
      });
      st = del.status;
      if (del.ok || st === 204) return { ok: true, status: st };
    }
    return { ok: false, status: st };
  }, folder, uids, userEmail, xsrfToken).catch((err) => ({ ok: false, why: err.message }));
}

/** Hapus semua email dgn subjek uji di INBOX/Junk/Sent (pre-cleanup / cleanup).
 *  userEmail dikirim eksplisit — page global HILANG setelah page.reload(). */
async function deleteTestMails(page, subject, userEmail, xsrfToken) {
  let removed = 0;
  for (const folder of ['folderINBOX', 'folderJunk', 'folderSent']) {
    const v = await viewFolder(page, folder, userEmail, xsrfToken);
    if (!v.ok) continue;
    const uids = v.subjects
      .map((s, i) => (s.includes(subject) ? v.uids[i] : null))
      .filter((u) => u !== null && u !== undefined);
    if (uids.length) {
      const d = await batchDelete(page, folder, uids, userEmail, xsrfToken);
      if (d.ok) removed += uids.length;
    }
  }
  return removed;
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

  // ── 2. Pre-cleanup: email uji lama di INBOX/Junk (idempoten) ──────────────
  let xsrf = await page.evaluate(() =>
    decodeURIComponent((document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/) || [])[1] || ''));
  const pre = await deleteTestMails(page, 'E2E NotJunk ', USER, xsrf);
  if (pre > 0) log('pre-cleanup:', pre, 'email uji lama dihapus');

  // ── 3. Seed via session browser: kirim ke diri sendiri → pindah ke Junk ───
  // 3a. compose (GET) → draftId
  const compose = await page.evaluate(async (u, token) => {
    const enc = encodeURIComponent(u);
    const res = await fetch(`/SOGo/so/${enc}/Mail/0/compose`, {
      method: 'GET', credentials: 'include',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'X-Requested-With': 'XMLHttpRequest',
        ...(token ? { 'X-XSRF-TOKEN': token } : {}),
      },
    });
    if (!res.ok) return { ok: false, why: `compose ${res.status}` };
    const data = await res.json().catch(() => ({}));
    return { ok: !!data?.draftId, draftId: data?.draftId, why: data?.draftId ? null : 'draftId kosong' };
  }, USER, xsrf);
  assert.ok(compose.ok, `compose draft: ${compose.why}`);
  log('draft dibuat:', compose.draftId);

  // 3b. kirim (POST folderDrafts/{id}/send) — fallback /api/send bila 501
  const send = await page.evaluate(async (u, draftId, token, subj, bodyTxt, to) => {
    const enc = encodeURIComponent(u);
    const hdrs = {
      Accept: 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/json',
      ...(token ? { 'X-XSRF-TOKEN': token } : {}),
    };
    const payload = {
      subject: subj, to: [to], cc: [], bcc: [], replyTo: '', inReplyTo: '',
      references: '', text: bodyTxt, isHTML: false, from: to,
    };
    const res = await fetch(`/SOGo/so/${enc}/Mail/0/folderDrafts/${encodeURIComponent(draftId)}/send`, {
      method: 'POST', credentials: 'include', headers: hdrs,
      body: JSON.stringify(payload),
    });
    if (res.ok) return { ok: true, via: 'sogo' };
    if (res.status !== 501) return { ok: false, why: `send ${res.status}` };
    const smtp = await fetch('/api/send', {
      method: 'POST', credentials: 'include',
      headers: hdrs,
      body: JSON.stringify({ to, cc: '', bcc: '', subject: subj, body: bodyTxt, isHTML: false, from: to }),
    });
    return smtp.ok ? { ok: true, via: 'smtp' } : { ok: false, why: `smtp ${smtp.status}` };
  }, USER, compose.draftId, xsrf, SUBJECT, BODY, USER);
  assert.ok(send.ok, `kirim email uji: ${send.why}`);
  log('kirim OK via', send.via);

  // 3c. tunggu masuk INBOX lalu pindah ke Junk via moveMessages (flow native)
  // PENTING: poll sampai SUBJEK DITEMUKAN (bukan sekadar view sukses) —
  // view selalu 200 walau email belum tiba; delivery SMTP butuh beberapa detik.
  let inboxV = { ok: false, match: -1 };
  for (let i = 0; i < 20 && inboxV.match === -1; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    inboxV = await viewFolder(page, 'folderINBOX', USER, xsrf);
    inboxV.match = inboxV.ok ? inboxV.subjects.findIndex((s) => s.includes(SUBJECT)) : -1;
  }
  assert.ok(inboxV.ok && inboxV.match !== -1, `email uji tiba di INBOX (view: ${inboxV.why || 'tidak ditemukan'})`);
  const seedUid = inboxV.uids[inboxV.match];
  const move = await page.evaluate(async (u, uid, token) => {
    const enc = encodeURIComponent(u);
    let st = 0;
    for (let a = 0; a < 3; a++) {
      if (a > 0) await new Promise((r) => setTimeout(r, 300 * a));
      const res = await fetch(`/SOGo/so/${enc}/Mail/0/folderINBOX/moveMessages`, {
        method: 'POST', credentials: 'include',
        headers: {
          Accept: 'application/json, text/plain, */*',
          'X-Requested-With': 'XMLHttpRequest',
          'Content-Type': 'application/json',
          ...(token ? { 'X-XSRF-TOKEN': token } : {}),
        },
        body: JSON.stringify({ uids: [Number(uid)], folder: '/0/folderJunk' }),
      });
      st = res.status;
      if (res.ok) return { ok: true, status: st };
    }
    return { ok: false, status: st };
  }, USER, seedUid, xsrf);
  assert.ok(move.ok, `pindah email uji ke Junk: ${move.status ?? move.why}`);
  const junkV = await viewFolder(page, 'folderJunk', USER, xsrf);
  assert.ok(junkV.ok && junkV.subjects.some((s) => s.includes(SUBJECT)),
    'email uji berada di folder Junk (seed siap)');
  log('seed siap: email uji di Junk (uid', seedUid + ')');

  // ── 4. UI: buka folder Junk/Spam dari sidebar ─────────────────────────────
  await page.goto(`${HOST}/webmail/mail`, { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => !document.querySelector('.animate-pulse'), { timeout: 45_000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 800));
  await page.evaluate(() => {
    const spans = [...document.querySelectorAll('button span')];
    // Label bundel produksi bisa "Spam" atau "Junk/Spam" (tergantung versi) —
    // regex agar tahan terhadap perbedaan versi.
    const s = spans.find((el) => /^(Junk\/)?Spam$/.test(el.textContent?.trim() || ''));
    if (!s) throw new Error('folder Spam/Junk tidak ditemukan di sidebar');
    s.closest('button').click();
  });
  // Row uji tampil di daftar Junk
  await page.waitForFunction(
    (t) => [...document.querySelectorAll('div.text-sm.truncate')].some((el) => el.textContent?.includes(t)),
    { timeout: 30_000 },
    SUBJECT,
  );
  log('folder Junk terbuka, row uji tampil');

  // ── 5. Klik "Bukan Spam" (ShieldCheck per-baris) ──────────────────────────
  // Catatan: cluster aksi per-baris = `.row-quick-actions` (hover + delay 250ms), dan headless
  // shell TIDAK mengaktifkan CSS :hover via CDP mouse events (ElementHandle
  // .hover() tidak berpengaruh). Solusi deterministik: paksa cluster tampil
  // via injected CSS, lalu klik tombol asli (handler mutasi tetap yang diuji;
  // reveal-by-hover murni concern CSS, bukan logika).
  await page.addStyleTag({ content: '.row-quick-actions { display: flex !important; visibility: visible !important; opacity: 1 !important; animation: none !important; }' });
  await page.waitForFunction(() => {
    const b = document.querySelector('button[title="Bukan Spam"]');
    return !!b && b.offsetParent !== null;
  }, { timeout: 15_000 });
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button[title="Bukan Spam"]')]
      .find((b) => b.offsetParent !== null);
    if (!btn) throw new Error('tombol Bukan Spam tidak terlihat');
    btn.click();
  });
  log('klik Bukan Spam pada row uji');

  // ── 6. Row HILANG dari Junk (laporan + moveMessages → INBOX) ─────────────
  await page.waitForFunction(
    (t) => ![...document.querySelectorAll('div.text-sm.truncate')].some((el) => el.textContent?.includes(t)),
    { timeout: 30_000 },
    SUBJECT,
  );
  log('✅ row hilang dari Junk (bukan sekadar 204 tanpa move)');
  const junkAfter = await viewFolder(page, 'folderJunk', USER, xsrf);
  if (junkAfter.ok) {
    assert.ok(!junkAfter.subjects.some((s) => s.includes(SUBJECT)),
      'email uji benar-benar keluar dari folder Junk (server-side)');
  }

  // ── 7. Folder Kotak Masuk → email uji MUNCUL ─────────────────────────────
  await page.evaluate(() => {
    const spans = [...document.querySelectorAll('button span')];
    const s = spans.find((el) => el.textContent?.trim() === 'Kotak Masuk');
    if (!s) throw new Error('folder Kotak Masuk tidak ditemukan di sidebar');
    s.closest('button').click();
  });
  await page.waitForFunction(
    (t) => [...document.querySelectorAll('div.text-sm.truncate')].some((el) => el.textContent?.includes(t)),
    { timeout: 30_000 },
    SUBJECT,
  );
  log('✅ email uji MUNCUL di Kotak Masuk');

  // ── 8. RELOAD PENUH — persist: tetap di INBOX, tidak kembali ke Junk ─────
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForFunction(() => !document.querySelector('.animate-pulse'), { timeout: 45_000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1200));
  const afterReload = await page.evaluate((t) => ({
    inInbox: [...document.querySelectorAll('div.text-sm.truncate')].some((el) => el.textContent?.includes(t)),
  }), SUBJECT);
  assert.ok(afterReload.inInbox, 'email uji TETAP di Kotak Masuk setelah reload penuh (persist di server)');
  const junkReload = await viewFolder(page, 'folderJunk', USER, xsrf);
  if (junkReload.ok) {
    assert.ok(!junkReload.subjects.some((s) => s.includes(SUBJECT)),
      'email uji tidak kembali ke Junk setelah reload');
  }
  log('✅ persist + tidak kembali ke Junk setelah reload penuh');

  // ── 9. Cleanup: email uji dihapus dari INBOX/Junk ─────────────────────────
  const removed = await deleteTestMails(page, SUBJECT, USER, xsrf);
  if (removed > 0) log('cleanup:', removed, 'email uji dihapus');
  else log('warn cleanup: tidak ada yang perlu dihapus / view gagal — pre-cleanup run berikutnya menangkap');

  // ── 10. Tidak boleh ada error React di console ────────────────────────────
  const realErrors = consoleErrors.filter((e) => !/Download the React DevTools/i.test(e));
  assert.deepEqual(realErrors, [], `tanpa pageerror: ${JSON.stringify(realErrors)}`);

  console.log('✅ e2e-notjunk-browser: Junk → Bukan Spam → kembali ke INBOX → persist, lolos');
} catch (err) {
  console.error('❌ e2e-notjunk-browser GAGAL:', err.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
