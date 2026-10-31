/**
 * BROWSER E2E — draft edit with attachments, end-to-end:
 *
 *   1. Compose (To/subject/body + attach small PNG via real file input)
 *   2. Wait for autosave ("Tersimpan") → close modal
 *   3. Reopen the draft from folder "Draf" via sidebar
 *   4. VERIFY the attachment chip is restored (draft attachments survive the
 *      server-side round-trip) + subject/body intact
 *   5. Edit body → wait "Tersimpan" again → full reload → reopen → still there
 *   6. Cleanup: delete the test draft via browser session (SOGo batchDelete)
 *
 * Rationale (audit round-2): api.js saveDraft() does NOT include attachments in
 * its payload — only this browser E2E can prove whether attachments survive a
 * server-side draft save or are silently dropped (the "feature silently dead
 * while tests green" class).
 *
 * Run (opt-in, needs diag2 enabled):
 *   node scripts/e2e-draft-attachments-browser.mjs
 *   E2E_HOST=https://mail.example.net ... (env-overridable like the others)
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';

const HOST = process.env.E2E_HOST || 'https://mail.example.com';
const USER = process.env.E2E_USER || 'diag2@example.com';
const PASS = process.env.E2E_PASS || 'DiagTest123!';
const STAMP = Date.now();
const SUBJECT = `E2E Draft Att ${STAMP}`;
const BODY1 = `Body draft v1 — ${STAMP}`;
const BODY2 = `Body draft v2 (edited) — ${STAMP}`;

// ── 1×1 PNG (transparent) → lampiran "E2E-attach-<stamp>.png" ───────────────
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const log = (...a) => console.log('[e2e-draft-att]', ...a);
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

/**
 * Klik sidebar folder Drafts — label bisa 'Draf' (id) atau 'Drafts' (locale
 * server). Returns true on success.
 */
const DRAFT_LABELS = ['Draf', 'Drafts'];
async function openDraftsFolder(page) {
  return page.evaluate((labels) => {
    const spans = [...document.querySelectorAll('button span')];
    const s = spans.find((el) => labels.includes(el.textContent?.trim()));
    if (!s) return false;
    s.closest('button').click();
    return true;
  }, DRAFT_LABELS);
}
/** Tunggu folder Drafts muncul di sidebar. */
function waitDraftsInSidebar(page) {
  return page.waitForFunction((labels) => {
    const spans = [...document.querySelectorAll('button span')];
    return spans.some((el) => labels.includes(el.textContent?.trim()));
  }, { timeout: 30_000 }, DRAFT_LABELS);
}

/** Tutup compose modal via tombol title="Tutup". */
async function closeCompose(page) {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button[title="Tutup"]')][0];
    b?.click();
  });
  await page.waitForFunction(() => !document.body.textContent.includes('Kepada:'), { timeout: 20_000 });
}

/** Hapus draft uji (prefix subjek) via SOGo batchDelete dgn session browser. */
async function deleteTestDrafts(page, userEmail, subjectMatch) {
  const xsrf = await page.evaluate(() => decodeURIComponent((document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/) || [])[1] || ''));
  return page.evaluate(async (enc0, xsrfToken, match) => {
    const hdrs = {
      Accept: 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
      ...(xsrfToken ? { 'X-XSRF-TOKEN': xsrfToken } : {}),
    };
    const enc = encodeURIComponent(enc0);
    const res = await fetch(`/SOGo/so/${enc}/Mail/0/folderDrafts/view`, {
      method: 'POST', credentials: 'include', headers: hdrs,
      body: JSON.stringify({ sortby: 'date', asc: 0 }),
    });
    if (!res.ok) return { ok: false, why: `view ${res.status}`, deleted: 0 };
    const data = await res.json();
    const headers = data?.headers || [];
    const cols = (headers[0] || []).map((c) => String(c).toLowerCase());
    const iSubj = cols.indexOf('subject');
    const iUid = cols.indexOf('uid');
    const uids = [];
    for (const row of headers.slice(1)) {
      if (Array.isArray(row) && String(row[iSubj]).includes(match)) uids.push(row[iUid]);
    }
    if (!uids.length) return { ok: true, deleted: 0, why: '' };
    const del = await fetch(`/SOGo/so/${enc}/Mail/0/folderDrafts/batchDelete`, {
      method: 'POST', credentials: 'include', headers: hdrs,
      body: JSON.stringify({ uids }),
    });
    return { ok: del.ok || del.status === 204, deleted: uids.length, why: del.ok ? '' : `batchDelete ${del.status}` };
  }, userEmail, xsrf, subjectMatch);
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

  // ── 2. Pre-cleanup: hapus draft uji lama (idempoten) ────────────────────────
  const pre = await deleteTestDrafts(page, USER, 'E2E Draft Att').catch((err) => ({ ok: false, why: err.message, deleted: 0 }));
  if (pre.deleted > 0) log('pre-cleanup:', pre.deleted, 'draft lama dihapus');
  else if (!pre.ok) log('pre-cleanup skip:', pre.why);

  // ── 3. Mail → Tulis Pesan → isi + LAMPIRKAN file via input file asli ───────
  await page.goto(`${HOST}/webmail/mail`, { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => !document.querySelector('.animate-pulse'), { timeout: 45_000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 800));

  const composeBtn = await page.evaluateHandle(() => {
    const btns = [...document.querySelectorAll('button')];
    return btns.find((b) => b.textContent.includes('Tulis Pesan'));
  });
  assert.ok(composeBtn && composeBtn.asElement(), 'tombol Tulis Pesan ditemukan');
  await composeBtn.asElement().click();
  await page.waitForFunction(() => document.body.textContent.includes('Kepada:'), { timeout: 30_000 });
  log('compose modal terbuka');

  // To chip (MultiEmailInput: ketik + Enter commit)
  const toInput = await page.evaluateHandle(() => {
    const labels = [...document.querySelectorAll('label')];
    const l = labels.find((el) => el.textContent.trim() === 'Kepada:');
    return l?.parentElement?.querySelector('input');
  });
  assert.ok(toInput.asElement(), 'input Kepada ditemukan');
  await toInput.asElement().type(USER);
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 300));

  // Subject
  const subjInput = await page.evaluateHandle(() => {
    const labels = [...document.querySelectorAll('label')];
    const l = labels.find((el) => el.textContent.trim() === 'Subjek:');
    return l?.nextElementSibling?.querySelector('input') || l?.parentElement?.querySelector('input');
  });
  assert.ok(subjInput.asElement(), 'input Subjek ditemukan');
  await subjInput.asElement().type(SUBJECT);

  // Body (contentEditable rich editor)
  const bodyEl = await page.$('[data-placeholder="Tulis pesan Anda di sini..."]');
  assert.ok(bodyEl, 'editor body ditemukan');
  await bodyEl.type(BODY1);

  // Attach: tulis PNG ke tmp + upload lewat input[type=file] native
  const ATT_NAME = `E2E-attach-${STAMP}.png`;
  const attPath = join(tmpdir(), ATT_NAME);
  writeFileSync(attPath, Buffer.from(PNG_B64, 'base64'));
  const attachInput = await page.$('input[type="file"][multiple]');
  assert.ok(attachInput, 'input file lampiran ditemukan');
  await attachInput.uploadFile(attPath);
  await page.waitForFunction((n) => document.body.textContent.includes(n), { timeout: 15_000 }, ATT_NAME);
  log('lampiran terpasang:', ATT_NAME);

  // ── 4. Tunggu autosave "Draf tersimpan" → close ────────────────────────
  await page.waitForFunction(
    () => [...document.querySelectorAll('span')].some((el) => el.textContent?.trim() === 'Draf tersimpan'),
    { timeout: 30_000 },
  );
  log('autosave: draf tersimpan (v1)');
  await new Promise((r) => setTimeout(r, 1500)); // jeda — autosave berikutnya tak menimpa saat close
  await closeCompose(page);
  log('modal ditutup — draft ada di folder Draf');

  // ── 5. Buka folder Draf via sidebar → baris uji ada ────────────────────────
  await waitDraftsInSidebar(page);
  assert.ok(await openDraftsFolder(page), 'folder Draf/Drafts ditemukan di sidebar');
  await page.waitForFunction((t) => document.body.textContent.includes(t), { timeout: 45_000 }, SUBJECT);
  log('draft terlihat di folder Draf');

  // ── 6. Reopen draft → VERIFIKASI lampiran + konten direstorasi ─────────────
  await page.evaluate((t) => {
    const rows = [...document.querySelectorAll('div.text-sm.truncate')];
    const row = rows.find((el) => el.textContent?.includes(t));
    if (!row) throw new Error(`baris draft "${t}" tidak ada di daftar`);
    row.click();
  }, SUBJECT);
  try {
    await page.waitForFunction((n) => document.body.textContent.includes(n), { timeout: 30_000 }, ATT_NAME);
    log('✅ lampiran TERESETORASI saat draft dibuka ulang');
  } catch {
    const subjectThere = await page.evaluate((t) => document.body.textContent.includes(t), SUBJECT);
    assert.ok(
      false,
      `lampiran TIDAK direstorasi saat draft dibuka ulang (subjek ${subjectThere ? 'ada' : 'juga hilang'}) — bug draft-attachment!`,
    );
  }
  await page.waitForFunction((b) => document.body.textContent.includes(b), { timeout: 15_000 }, BODY1);
  log('konten draft direstorasi (subjek + body v1)');

  // ── 7. Edit body → autosave → RELOAD PENUH → buka ulang → masih ada ────────
  const bodyEl2 = await page.$('[data-placeholder="Tulis pesan Anda di sini..."]');
  assert.ok(bodyEl2, 'editor body ditemukan setelah reopen');
  // Klik editor lalu ketik tambahan (append di posisi caret). Jangan select-all
  // via shortcut — tidak stabil di headless shell. Bukti state benar-benar
  // berubah: indikator 'Menyimpan draf...' HARUS muncul (siklus autosave baru);
  // kalau tidak, berarti onChange editor tidak jalan → gagal dengan jelas.
  await bodyEl2.click();
  await bodyEl2.type(` ${BODY2}`);
  try {
    await page.waitForFunction(
      () => [...document.querySelectorAll('span')].some((el) => el.textContent?.trim() === 'Menyimpan draf...'),
      { timeout: 15_000 },
    );
  } catch {
    assert.ok(false, 'autosave v2 tidak terpicu — onChange editor tidak update state (bug atau typing tidak diterima)');
  }
  await page.waitForFunction(
    () => [...document.querySelectorAll('span')].some((el) => el.textContent?.trim() === 'Draf tersimpan'),
    { timeout: 30_000 },
  );
  log('edit tersimpan (v2 — siklus autosave baru terkonfirmasi)');
  await new Promise((r) => setTimeout(r, 1500));
  await closeCompose(page);

  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForFunction(() => !document.querySelector('.animate-pulse'), { timeout: 45_000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 800));
  assert.ok(await openDraftsFolder(page), 'folder Draf/Drafts masih ada di sidebar setelah reload');
  await page.waitForFunction((t) => document.body.textContent.includes(t), { timeout: 45_000 }, SUBJECT);
  await page.evaluate((t) => {
    const rows = [...document.querySelectorAll('div.text-sm.truncate')];
    const row = rows.find((el) => el.textContent?.includes(t));
    if (!row) throw new Error('baris draft hilang setelah reload');
    row.click();
  }, SUBJECT);
  await page.waitForFunction((n) => document.body.textContent.includes(n), { timeout: 30_000 }, ATT_NAME);
  await page.waitForFunction((b) => document.body.textContent.includes(b), { timeout: 15_000 }, BODY2);
  log('✅ edit + lampiran persist setelah reload penuh');

  // ── 8. Cleanup: hapus draft uji via session browser ────────────────────────
  await closeCompose(page).catch(() => {});
  const cleaned = await deleteTestDrafts(page, USER, SUBJECT).catch((err) => ({ ok: false, why: err.message, deleted: 0 }));
  if (cleaned.ok) log('cleanup selesai (draft uji dihapus via batchDelete)');
  else log('warn cleanup:', cleaned.why, '— pre-cleanup run berikutnya akan menghapus');

  // ── 9. Tanpa pageerror React ────────────────────────────────────────────────
  const realErrors = consoleErrors.filter((e) => !/Download the React DevTools/i.test(e));
  assert.deepEqual(realErrors, [], `tanpa pageerror: ${JSON.stringify(realErrors)}`);

  console.log('✅ e2e-draft-attachments-browser: compose+attach→autosave→close→reopen (lampiran+body direstorasi)→edit→reload→persist→cleanup lolos');
} catch (err) {
  console.error('❌ e2e-draft-attachments-browser GAGAL:', err.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
