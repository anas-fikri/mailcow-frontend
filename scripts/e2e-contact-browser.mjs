/**
 * BROWSER E2E — create contact end-to-end lewat SPA produksi (Puppeteer).
 *
 * Bukan unit test: ini menjalankan Chromium sungguhan, login sebagai diag2 di
 * https://mail.pcpexpress.co.id/webmail, klik Tambah → isi form → Simpan,
 * lalu memverifikasi kontak MUNCUL DI DAFTAR (react-query invalidate) dan
 * TETAP ADA setelah reload penuh (bukti tersimpan di server, bukan cache).
 * Regresi utk bug data loss createContact (`_new_` → phantom draft).
 *
 * Prasyarat: diag2 aktif (script enable otomatis via API tidak tersedia dari
 * luar; jalankan bagian 0 dari scripts/capture-mail-golden.sh dulu bila
 * akun disabled, atau set env DIAG_ENABLED=1 jika sudah aktif).
 * Chrome: puppeteer bundled (linux). Jalankan (opt-in, butuh diag2 aktif): node scripts/e2e-contact-browser.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';

/** Cari binary Chrome di cache puppeteer (versi cache bisa beda dari paket). */
function findChrome() {
  const root = process.env.PUPPETEER_CACHE_DIR || join(homedir(), '.cache', 'puppeteer');
  for (const dir of ['chrome', 'chrome-headless-shell']) {
    const base = join(root, dir);
    if (!existsSync(base)) continue;
    const versions = readdirSync(base).sort().reverse(); // versi terbaru dulu
    for (const v of versions) {
      const inner = join(base, v);
      const sub = readdirSync(inner)[0];
      const bin = join(inner, sub, dir === 'chrome' ? 'chrome' : 'chrome-headless-shell');
      if (existsSync(bin)) return bin;
    }
  }
  return null;
}

/**
 * Mesin tanpa GUI stack butuh lib sistem Chrome di user-dir
 * (~/.local/chrome-libs — diisi via `apt-get download` + `dpkg-deb -x`, tanpa root).
 * Set LD_LIBRARY_PATH SEBELUM launch bila lib tsb ada.
 */
function ensureChromeLibs() {
  const libDir = join(homedir(), '.local', 'chrome-libs', 'usr', 'lib', 'x86_64-linux-gnu');
  if (existsSync(libDir)) {
    process.env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH
      ? `${libDir}:${process.env.LD_LIBRARY_PATH}`
      : libDir;
  }
}

const HOST = 'https://mail.pcpexpress.co.id';
const USER = process.env.E2E_USER || 'diag2@pcpexpress.co.id';
const PASS = process.env.E2E_PASS || 'DiagTest123!';
// Unik per run agar tidak kena guard duplikat dan mudah diverifikasi.
const STAMP = Date.now();
const NAME = `E2E Browser ${STAMP}`;
const EMAIL = `e2e.browser.${STAMP}@pcpexpress.co.id`;
const PHONE = '+62-999-000';

const log = (...a) => console.log('[e2e]', ...a);
let browser;

async function enableDiag2() {
  // Akun diag harus di-enable dari sisi server (SSH). Script golden capture
  // melakukannya; di CI, asumsikan sudah aktif.
  if (process.env.DIAG_ENABLED === '1') return;
  log('skip server-side enable (set DIAG_ENABLED=1 bila diag sudah aktif)');
}

try {
  await enableDiag2();
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
  await page.waitForSelector('input[type="password"]');
  await page.locator('input[type="email"]').fill(USER);
  await page.locator('input[type="password"]').fill(PASS);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30_000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForFunction(() => !location.pathname.includes('/login'), { timeout: 30_000 });
  log('login OK →', await page.url());

  // ── 2. Buka halaman Kontak ────────────────────────────────────────────────
  await page.goto(`${HOST}/webmail/contacts`, { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => location.pathname.endsWith('/contacts'));
  // Tunggu daftar termuat (query selesai — tombol Tambah aktif, skeleton hilang)
  await page.waitForSelector('button:has(> svg + *)', { timeout: 30_000 }).catch(() => {});
  await page.waitForFunction(
    () => !document.querySelector('.animate-pulse'),
    { timeout: 30_000 },
  ).catch(() => {});

  // ── 3. Klik tombol Tambah → modal muncul ──────────────────────────────────
  const addBtn = await page.evaluateHandle(() => {
    const btns = [...document.querySelectorAll('button')];
    return btns.find((b) => b.textContent.includes('Tambah'));
  });
  assert.ok(addBtn && addBtn.asElement(), 'tombol Tambah ditemukan');
  await addBtn.asElement().click();
  await page.waitForFunction(() => document.body.textContent.includes('Tambah Kontak Baru'));
  log('modal terbuka');

  // ── 4. Isi form (label → input) lalu submit ──────────────────────────────
  const setInputByLabel = async (label, value) => {
    await page.evaluate((lbl) => {
      const labels = [...document.querySelectorAll('label')];
      const target = labels.find((l) => l.textContent.includes(lbl));
      if (!target) throw new Error(`label ${lbl} tidak ada`);
      target.nextElementSibling?.querySelector('input,textarea')?.setAttribute('data-e2e', 'fill');
    }, label);
    // Fallback generik: form modal punya 3 input urut name/email/phone
  };
  // Modal berisi input urut: Nama, Email, Telepon — pakai urutan + placeholder
  const modalInputs = await page.$$('form input');
  assert.ok(modalInputs.length >= 2, 'input modal ada');
  await modalInputs[0].type(NAME);
  await modalInputs[1].type(EMAIL);
  if (modalInputs[2]) await modalInputs[2].type(PHONE);
  log('form terisi:', NAME, EMAIL);

  const saveBtn = await page.evaluateHandle(() => {
    const btns = [...document.querySelectorAll('button')];
    return btns.find((b) => b.textContent.trim() === 'Simpan');
  });
  assert.ok(saveBtn && saveBtn.asElement(), 'tombol Simpan ditemukan');
  await saveBtn.asElement().click();

  // ── 5. Kontak muncul di daftar (react-query invalidate) ──────────────────
  await page.waitForFunction(
    (email) => document.body.textContent.includes(email),
    { timeout: 30_000 },
    EMAIL,
  );
  log('✅ kontak muncul di daftar');

  // ── 6. Reload penuh — kontak HARUS tetap ada (bukti persist di server) ──
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForFunction(
    (email) => document.body.textContent.includes(email),
    { timeout: 30_000 },
    EMAIL,
  );
  log('✅ kontak TETAP ADA setelah reload penuh (persist di server)');

  // ── 7. Cleanup via UI: cari kontak, buka detail, Hapus ───────────────────
  const searchInput = await page.$('input[placeholder*="Cari"], input[type="search"]');
  if (searchInput) {
    await searchInput.type(EMAIL);
    await new Promise((r) => setTimeout(r, 500));
  }
  const row = await page.evaluateHandle(
    (em) => [...document.querySelectorAll('div,button,li')].find((el) => el.textContent?.trim() === em || el.textContent?.includes(em) && el.children.length <= 4),
    EMAIL,
  );
  if (row && row.asElement()) {
    await row.asElement().click();
    await page.waitForFunction(() => document.body.textContent.includes('Hapus Kontak'), { timeout: 15_000 }).catch(() => {});
    const delBtn = await page.evaluateHandle(() => {
      const btns = [...document.querySelectorAll('button')];
      return btns.find((b) => b.textContent.includes('Hapus Kontak'));
    });
    if (delBtn && delBtn.asElement()) {
      await delBtn.asElement().click();
      await page.waitForFunction(
        (em) => !document.body.textContent.includes(em),
        { timeout: 15_000 },
        EMAIL,
      ).catch(() => log('warn: kontak masih terlihat setelah hapus (mungkin perlu verifikasi manual)'));
      log('cleanup via UI selesai');
    }
  }

  // ── 8. Tidak boleh ada error React di console ────────────────────────────
  const realErrors = consoleErrors.filter((e) => !/Download the React DevTools/i.test(e));
  assert.deepEqual(realErrors, [], `tanpa pageerror: ${JSON.stringify(realErrors)}`);

  console.log('✅ e2e-contact-browser: create contact end-to-end lolos (muncul + persist + tanpa error React)');
} catch (err) {
  console.error('❌ e2e-contact-browser GAGAL:', err.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
