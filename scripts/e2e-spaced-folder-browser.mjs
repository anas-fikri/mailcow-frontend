/**
 * BROWSER E2E — folder dengan SPASI di nama: pindah pesan + akses penuh.
 *
 * Regresi bug "Parameter folder tidak valid.": whitelist pathSegment lama
 * menolak spasi, padahal produksi penuh folder "INBOX/Pak Eriawan",
 * "Team KAC 3 - Tuta", "X. Spam", dll. Rantai:
 *   seed 2 email uji ke INBOX (send-to-self, subjek unik per stamp)
 *   → UI: buat subfolder "E2E Spasi <stamp>" di bawah INBOX (dialog Buat)
 *   → UI: pilih kedua email → toolbar bulk "Pindah ke..." (quickMoveMutation)
 *   → buka folder uji via sidebar; row uji tampil
 *   → RELOAD PENUH → folder tetap terbuka & row uji tetap tampil (persist)
 *   → UI: hapus folder (dialog konfirmasi teks)
 *   → verifikasi folder hilang dari sidebar + sapu email uji (pre & post)
 *
 * Jalankan (opt-in, butuh diag2 aktif + email uji):
 *   node scripts/e2e-spaced-folder-browser.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import puppeteerPkg from 'puppeteer';
const puppeteer = puppeteerPkg?.default ?? puppeteerPkg;

const HOST = 'https://mail.pcpexpress.co.id';
const USER = process.env.E2E_USER || 'diag2@pcpexpress.co.id';
const PASS = process.env.E2E_PASS || 'DiagTest123!';
const STAMP = Date.now();
const FOLDER = `E2E Spasi ${STAMP}`; // sengaja ada SPASI — inti regresi
const SUBJ1 = `E2E Spasi A ${STAMP}`;
const SUBJ2 = `E2E Spasi B ${STAMP}`;

const log = (...a) => console.log('[e2e-spaced]', ...a);
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

const COLS = { SUBJECT: 3, UID: 10 };

/** POST view folder SOGo dgn headers SPA — balikan {ok, uids, subjects}. */
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
        body: JSON.stringify({ sortby: 'date', asc: 0, limit: 100 }),
      });
      if (res.ok) break;
    }
    if (!res?.ok) return { ok: false, why: `view ${res?.status}` };
    const data = await res.json();
    const headers = data?.headers || [];
    const uids = headers.map((h) => h[cols.UID]);
    const subjects = headers.map((h) => String(h[cols.SUBJECT] || ''));
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

/** Hapus semua email ber-subjek berawalan prefix di INBOX/Junk/Sent.
 *  userEmail eksplisit — page global HILANG setelah page.reload(). */
async function deleteTestMailsByPrefix(page, prefix, userEmail, xsrfToken) {
  let removed = 0;
  for (const folder of ['folderINBOX', 'folderJunk', 'folderSent']) {
    const v = await viewFolder(page, folder, userEmail, xsrfToken);
    if (!v.ok) continue;
    const uids = v.subjects
      .map((s, i) => (s.startsWith(prefix) ? v.uids[i] : null))
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

  // ── 2. Pre-cleanup: folder uji lama "E2E Spasi %" (session browser) ───────
  const xsrf = await page.evaluate(() =>
    decodeURIComponent((document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/) || [])[1] || ''));
  await page.evaluate(async (u, token) => {
    const enc = encodeURIComponent(u);
    const hdrs = {
      Accept: 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/json',
      ...(token ? { 'X-XSRF-TOKEN': token } : {}),
    };
    const res = await fetch(`/SOGo/so/${enc}/Mail/0/view`, { credentials: 'include', headers: hdrs });
    if (!res.ok) return;
    const data = await res.json();
    const paths = [];
    const collect = (mbs) => {
      for (const m of mbs || []) {
        if (/^INBOX\/E2E Spasi/.test(String(m.path || ''))) paths.push(String(m.path));
        collect(m.children);
      }
    };
    collect(Array.isArray(data) ? data : data.mailboxes || []);
    for (const p of paths) {
      const seg = 'folder' + p.replace(/\//g, '%2F');
      await fetch(`/SOGo/so/${enc}/Mail/0/${encodeURIComponent(seg)}/delete`, {
        method: 'POST', credentials: 'include', headers: hdrs,
        body: JSON.stringify({ withoutTrash: true }),
      }).catch(() => {});
    }
  }, USER, xsrf).catch(() => {});
  log('pre-cleanup folder uji lama selesai');

  // Sapu email uji lama (run gagal meninggalkan pasangan email di INBOX,
  // salinan kirim-ke-diri di Sent) — waits test memakai prefix umum, jadi
  // leftover HARUS hilang agar wait tidak salah cocok.
  const sweptBefore = await deleteTestMailsByPrefix(page, 'E2E Spasi', USER, xsrf);
  log(`pre-cleanup email uji lama: ${sweptBefore} dihapus`);

  // ── 3. Seed 2 email uji ke INBOX (doveadm) ────────────────────────────────
  const seed = await page.evaluate(async (s1, s2, to) => {
    const res = await fetch('/api/seed-mail', { method: 'POST' }).catch(() => null);
    return res ? 'unexpected-endpoint' : 'no-seed-endpoint';
  }, SUBJ1, SUBJ2, USER).catch(() => 'skip');
  if (seed !== 'skip') log('note:', seed);
  log('PERHATIAN: seed email via doveadm dilakukan oleh runner/server di luar script ini');
  // Fallback seed via send-to-self (2 email) agar script mandiri:
  for (const subj of [SUBJ1, SUBJ2]) {
    const okSend = await (async () => {
      const compose = await page.evaluate(async (u, token) => {
        const enc = encodeURIComponent(u);
        const hdrs = {
          Accept: 'application/json, text/plain, */*',
          'X-Requested-With': 'XMLHttpRequest',
          ...(token ? { 'X-XSRF-TOKEN': token } : {}),
        };
        const res = await fetch(`/SOGo/so/${enc}/Mail/0/compose`, { credentials: 'include', headers: hdrs });
        if (!res.ok) return null;
        return (await res.json().catch(() => ({})))?.draftId || null;
      }, USER, xsrf);
      if (!compose) return false;
      return page.evaluate(async (u, token, draftId, s) => {
        const enc = encodeURIComponent(u);
        const hdrs = {
          Accept: 'application/json, text/plain, */*',
          'X-Requested-With': 'XMLHttpRequest',
          'Content-Type': 'application/json',
          ...(token ? { 'X-XSRF-TOKEN': token } : {}),
        };
        const payload = {
          subject: s, to: [u], cc: [], bcc: [], replyTo: '', inReplyTo: '',
          references: '', text: 'seed folder-spasi E2E', isHTML: false, from: u,
        };
        const res = await fetch(`/SOGo/so/${enc}/Mail/0/folderDrafts/${encodeURIComponent(draftId)}/send`, {
          method: 'POST', credentials: 'include', headers: hdrs, body: JSON.stringify(payload),
        });
        if (res.ok) return true;
        if (res.status !== 501) return false;
        const smtp = await fetch('/api/send', {
          method: 'POST', credentials: 'include', headers: hdrs,
          body: JSON.stringify({ to: u, cc: '', bcc: '', subject: s, body: 'seed', isHTML: false, from: u }),
        });
        return smtp.ok;
      }, USER, xsrf, compose, subj);
    })();
    assert.ok(okSend, `seed email "${subj}" terkirim`);
  }
  log('2 email uji terkirim (send-to-self)');

  // Tunggu kedua email tiba di INBOX
  await page.goto(`${HOST}/webmail/mail`, { waitUntil: 'networkidle2' });
  await page.waitForFunction(
    (pfx, stamp) => [...document.querySelectorAll('div.text-sm.truncate')]
      .filter((el) => el.textContent?.includes(pfx) && el.textContent?.includes(stamp)).length >= 2,
    { timeout: 60_000 },
    'E2E Spasi', String(STAMP),
  );
  log('kedua email terlihat di INBOX');

  // ── 4. UI: buat subfolder berspasi di bawah INBOX ────────────────────────
  // Tombol + hanya terlihat via hover CSS — headless shell tak mengaktifkan
  // :hover via CDP, jadi klik via dispatch click() langsung (tidak butuh visible).
  const createBtn = await page.evaluateHandle(() => {
    const spans = [...document.querySelectorAll('button span')];
    const s = spans.find((el) => el.textContent?.trim() === 'Kotak Masuk');
    const row = s.closest('div.flex.items-center.group');
    return row?.querySelector('button[title^="Buat subfolder di"]') || null;
  });
  assert.ok(createBtn.asElement(), 'tombol Buat subfolder ditemukan');
  await createBtn.asElement().evaluate((el) => el.click());
  await page.waitForFunction(() => document.body.textContent.includes('Buat Subfolder'), { timeout: 15_000 });
  const nameInput = await page.evaluateHandle(() => {
    const dialog = [...document.querySelectorAll('h3')].find((h) => h.textContent === 'Buat Subfolder');
    return dialog?.closest('div')?.parentElement?.querySelector('input[placeholder="Nama folder"]');
  });
  await nameInput.asElement().type(FOLDER);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    btns.find((b) => b.textContent.trim() === 'Buat Folder').click();
  });
  // Mutasi sukses → dialog tertutup + sidebar invalidate; tunggu label folder
  // benar-benar muncul di sidebar sebelum dipakai sebagai target drag.
  await page.waitForFunction(() => !document.body.textContent.includes('Buat Subfolder'), { timeout: 30_000 });
  await page.waitForFunction(
    (label) => [...document.querySelectorAll('button span')].some((el) => el.textContent?.trim() === label),
    { timeout: 30_000 },
    FOLDER,
  );
  log('subfolder dibuat + terlihat di sidebar:', FOLDER);

  // ── 5. UI: pilih kedua email → toolbar bulk "Pindah ke..." ────────────────
  // PENTING: MailPage TIDAK punya drag & drop — move pesan lewat
  // quickMoveMutation (select aria-label="Pindah pesan terpilih ke folder").
  // Buat folder meng-invalidate daftar pesan → tunggu row stabil dulu.
  for (const subj of [SUBJ1, SUBJ2]) {
    await page.waitForFunction(
      (s) => [...document.querySelectorAll('div.text-sm.truncate')]
        .some((n) => n.textContent?.includes(s)),
      { timeout: 30_000 },
      subj,
    );
    const selBtn = await page.evaluateHandle((s) => {
      const el = [...document.querySelectorAll('div.text-sm.truncate')]
        .find((n) => n.textContent?.includes(s));
      const row = el?.closest('div[class*="group"]');
      return row?.querySelector('button[aria-label="Pilih pesan"]') || null;
    }, subj);
    assert.ok(selBtn.asElement(), `tombol pilih utk "${subj}" ada`);
    // Overlay pilih tak terlihat (opacity-0 tanpa hover) — click() programatik
    // tetap menembus karena langsung memanggil handler, bukan hit-test.
    await selBtn.asElement().evaluate((el) => el.click());
  }
  await page.waitForFunction(
    (t) => document.body.textContent.includes(t),
    { timeout: 15_000 },
    '2 terpilih',
  );
  log('kedua email terpilih (badge "2 terpilih")');

  // Toolbar bulk: set value option = folder target, trigger change React.
  const moveSel = await page.evaluateHandle(
    () => document.querySelector('select[aria-label="Pindah pesan terpilih ke folder"]'),
  );
  assert.ok(moveSel.asElement(), 'select "Pindah ke..." terlihat di toolbar');
  await moveSel.asElement().evaluate((sel, label) => {
    const opt = [...sel.options].find((o) => o.textContent.trim() === label);
    if (!opt) throw new Error(`option folder "${label}" tidak ada di toolbar`);
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, opt.value);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, FOLDER);
  // quickMoveMutation onSuccess → toast "Pesan dipindahkan"
  await page.waitForFunction(
    (t) => document.body.textContent.includes(t),
    { timeout: 30_000 },
    'Pesan dipindahkan',
  );
  log('move via toolbar "Pindah ke..." sukses');

  // ── 6. Buka folder uji via sidebar — kedua email tampil ──────────────────
  await page.evaluate((label) => {
    const spans = [...document.querySelectorAll('button span')];
    const s = spans.find((el) => el.textContent?.trim() === label);
    if (!s) throw new Error('folder uji hilang dari sidebar');
    s.closest('button').click();
  }, FOLDER);
  try {
    await page.waitForFunction(
      (pfx, stamp) => [...document.querySelectorAll('div.text-sm.truncate')]
        .filter((el) => el.textContent?.includes(pfx) && el.textContent?.includes(stamp)).length >= 2,
      { timeout: 30_000 },
      'E2E Spasi', String(STAMP),
    );
  } catch {
    const d = await page.evaluate(async (u, token, stampStr) => {
      const enc = encodeURIComponent(u);
      const rows = [...document.querySelectorAll('div.text-sm.truncate')].map((e) => e.textContent.slice(0, 50));
      const active = [...document.querySelectorAll('button')]
        .filter((b) => b.className.includes('bg-primary/10'))
        .map((b) => b.textContent.trim().slice(0, 40));
      const seg = 'folderINBOX%2FE2E Spasi ' + stampStr;
      const r = await fetch(`/SOGo/so/${enc}/Mail/0/${encodeURIComponent(seg)}/view`, {
        method: 'POST', credentials: 'include',
        headers: { Accept: 'application/json, text/plain, */*', 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...(token ? { 'X-XSRF-TOKEN': token } : {}) },
        body: JSON.stringify({ sortby: 'date', asc: 0 }),
      }).catch(() => null);
      let srv = `HTTP ${r?.status}`;
      if (r?.ok) {
        const j = await r.json();
        srv = (j?.headers || []).map((h) => String(h[3] || '')).slice(0, 5);
      }
      return { rows: rows.slice(0, 10), active, srv };
    }, USER, xsrf, String(STAMP));
    console.error('DIAG gagal-buka-folder:', JSON.stringify(d, null, 1));
    throw new Error('row uji tidak tampil di folder berspasi');
  }
  log('✅ kedua email pindah & tampil di folder berspasi (move path asli aplikasi)');

  // ── 7. RELOAD PENUH — persist: buka folder via UI, row uji tampil ─────────
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForFunction(() => !document.querySelector('.animate-pulse'), { timeout: 45_000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 800));
  await page.evaluate((label) => {
    const spans = [...document.querySelectorAll('button span')];
    const s = spans.find((el) => el.textContent?.trim() === label);
    if (!s) throw new Error('folder uji hilang dari sidebar setelah reload');
    s.closest('button').click();
  }, FOLDER);
  await page.waitForFunction(
    (s) => [...document.querySelectorAll('div.text-sm.truncate')].some((el) => el.textContent?.includes(s)),
    { timeout: 30_000 },
    SUBJ1,
  );
  log('✅ persist: folder + isi utuh setelah reload penuh');

  // ── 8. Cleanup: hapus folder via UI dialog ────────────────────────────────
  const delBtn = await page.evaluateHandle((label) => {
    const spans = [...document.querySelectorAll('button span')];
    const s = spans.find((el) => el.textContent?.trim() === label);
    const row = s.closest('div.flex.items-center.group');
    return row?.querySelector('button[title^="Hapus "]') || null;
  }, FOLDER);
  assert.ok(delBtn.asElement(), 'tombol Hapus folder ditemukan');
  await delBtn.asElement().evaluate((el) => el.click());
  await page.waitForFunction(
    (t) => document.body.textContent.includes(t),
    { timeout: 15_000 },
    FOLDER,
  );
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const confirm = btns.find((b) => /Hapus|Ya|Delete/i.test(b.textContent) && b.type === 'submit');
    (confirm || btns.find((b) => /Hapus/i.test(b.textContent))).click();
  });
  // SOGo delete + invalidate — folder hilang dari sidebar
  await page.waitForFunction(
    (label) => ![...document.querySelectorAll('button span')].some((el) => el.textContent?.trim() === label),
    { timeout: 30_000 },
    FOLDER,
  );
  log('✅ folder uji dihapus via UI');

  // ── 9. Sapu email uji (salinan Sent + sisa INBOX) ─────────────────────────
  const sweptAfter = await deleteTestMailsByPrefix(page, 'E2E Spasi', USER, xsrf);
  log(`✅ sapu email uji: ${sweptAfter} dihapus (INBOX/Junk/Sent)`);

  // ── 9. Tidak boleh ada error React ────────────────────────────────────────
  const realErrors = consoleErrors.filter((e) => !/Download the React DevTools/i.test(e));
  assert.deepEqual(realErrors, [], `tanpa pageerror: ${JSON.stringify(realErrors)}`);

  console.log('✅ e2e-spaced-folder-browser: buat→pindah→akses→persist→hapus folder berspasi lolos');
} catch (err) {
  console.error('❌ e2e-spaced-folder-browser GAGAL:', err.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
