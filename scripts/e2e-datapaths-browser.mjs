/**
 * BROWSER E2E — jalur DATA (bukan hanya tampilan):
 *
 *   A. RESTORE DRAFT BERLAMPIRAN (termasuk inline CID) via kirim ulang:
 *      1. Seed draft ASLI via protokol SOGo (session browser):
 *         compose → multipart save (lampiran: PDF + PNG CID) → JSON save.
 *      2. Buka folder Draf → klik baris draft → compose terbuka
 *         (openDraftForEdit: unduh ulang semua part dgn includeHidden).
 *      3. Klik Kirim → INTERCEPT payload /api/send → ASSERT payload
 *         attachments = 2 part (PDF + PNG CID, base64 non-kosong) + body + to.
 *      4. Klik "Urungkan" di toast (undo queue 3 menit) → ASSERT email TIDAK
 *         pernah di-deliver ke INBOX (poll doveadm).
 *   B. EXPORT .EML:
 *      5. Seed email berlampiran (PDF + CID PNG) di INBOX via doveadm.
 *      6. Buka reader → klik "Unduh sebagai file .eml" (CDP download) →
 *         ASSERT isi file: subjek, marker body, kedua filename, Content-ID CID.
 *
 * Run (opt-in, perlu diag2 aktif):
 *   SERVER=deploy-mail scripts/e2e-browser-runner.sh datapaths
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';

const HOST = process.env.E2E_HOST || 'https://mail.example.com';
const USER = process.env.E2E_USER || 'diag2@example.com';
const PASS = process.env.E2E_PASS || 'DiagTest123!';
const STAMP = Date.now();
const SUBJECT = `E2E Data Path ${STAMP}`;
const MARKER = `DP-MARKER-${STAMP}`;
const PDF_NAME = 'lampiran.pdf';
const PNG_NAME = 'footer.png';

const log = (...a) => console.log('[e2e-datapaths]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browser;

// ── dokumen uji ──────────────────────────────────────────────────────────────
const PDF_B64 = Buffer.from(
  ['%PDF-1.4', '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
   '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
   '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj',
   'trailer<</Root 1 0 R/Size 4>>', '%%EOF', ''].join('\n'), 'utf8').toString('base64');
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// ── doveadm helpers ──────────────────────────────────────────────────────────
const REMOTE_PREAMBLE = `set -e
F=$(find /data /root /home -maxdepth 4 -name 'mailcow.conf' 2>/dev/null | head -1)
[ -n "$F" ] && source "$F" >/dev/null 2>&1 || true
DC=$(docker ps --format '{{.Names}}' | grep -Ei 'dovecot' | head -1)
U='diag2@example.com'
`;

function sshRemote(script, timeoutMs = 120_000) {
  return execSync("ssh -o ConnectTimeout=15 deploy-mail 'bash -s'", {
    input: script, encoding: 'utf8', timeout: timeoutMs,
  });
}

function countMailbox(mailbox, subject) {
  const out = sshRemote(`${REMOTE_PREAMBLE}
docker exec "$DC" doveadm search -u "$U" mailbox ${mailbox} HEADER Subject "${subject}" 2>/dev/null | wc -l
`);
  return parseInt(out.trim(), 10) || 0;
}

function expungeSubject(subject) {
  for (const mb of ['INBOX', 'folderDrafts', 'Drafts', 'Sent']) {
    try {
      sshRemote(`${REMOTE_PREAMBLE}
docker exec "$DC" doveadm expunge -u "$U" mailbox ${mb} HEADER Subject "${subject}" >/dev/null 2>&1 || true
`);
    } catch { /* folder mungkin beda nama — abaikan */ }
  }
}

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
      ? `${libDir}:${process.env.LD_LIBRARY_PATH}` : libDir;
  }
}

async function login(page) {
  await page.goto(`${HOST}/webmail/`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[type="email"]');
  await page.locator('input[type="email"]').fill(USER);
  await page.locator('input[type="password"]').fill(PASS);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30_000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForFunction(() => !location.pathname.includes('/login'), { timeout: 30_000 });
}

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

try {
  ensureChromeLibs();
  const executablePath = process.env.CHROME_PATH || findChrome() || undefined;
  log('chrome:', executablePath || '(bundled default)');
  browser = await puppeteer.launch({
    headless: 'shell', executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.setDefaultTimeout(45_000);
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  // ── Pre-cleanup idempoten ──────────────────────────────────────────────────
  expungeSubject(SUBJECT);
  log('pre-cleanup OK');

  // ══ A. RESTORE DRAFT → KIRIM (intercept payload) → URUNGKAN ═════════════════
  await login(page);
  log('login OK');

  // ── A1. Seed draft asli via protokol SOGo (session browser) ────────────────
  const draftUid = await page.evaluate(async (args) => {
    const enc = encodeURIComponent(args.user);
    const xsrf = decodeURIComponent((document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/) || [])[1] || '');
    const hdrs = {
      Accept: 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
      ...(xsrf ? { 'X-XSRF-TOKEN': xsrf } : {}),
    };
    const base = `/SOGo/so/${enc}/Mail/0`;
    const comp = await fetch(`${base}/compose`, { credentials: 'include', headers: hdrs });
    if (!comp.ok) throw new Error(`compose ${comp.status}`);
    const { draftId } = await comp.json();
    const saveUrl = `${base}/folderDrafts/${draftId}/save`;
    // 1) multipart: simpan part lampiran (PDF + PNG CID)
    const fd = new FormData();
    const pdfBytes = Uint8Array.from(atob(args.pdfB64), (c) => c.charCodeAt(0));
    const pngBytes = Uint8Array.from(atob(args.pngB64), (c) => c.charCodeAt(0));
    fd.append('attachments', new Blob([pdfBytes], { type: 'application/pdf' }), 'lampiran.pdf');
    fd.append('attachments', new Blob([pngBytes], { type: 'image/png' }), 'footer.png');
    const aRes = await fetch(saveUrl, { method: 'POST', credentials: 'include', headers: hdrs, body: fd });
    if (!aRes.ok) throw new Error(`save attachments ${aRes.status}`);
    // 2) json: simpan headers/text lalu append MIME lengkap
    const jRes = await fetch(saveUrl, {
      method: 'POST', credentials: 'include',
      headers: { ...hdrs, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: args.subject,
        to: [args.user],
        cc: [], bcc: [],
        replyTo: '', inReplyTo: '', references: '',
        text: `<p>Body draft data-path. Marker: ${args.marker}</p>`,
        isHTML: true,
        from: args.user,
      }),
    });
    if (!jRes.ok) throw new Error(`save json ${jRes.status}`);
    const saved = await jRes.json().catch(() => ({}));
    return saved?.uid || draftId;
  }, { user: USER, pdfB64: PDF_B64, pngB64: PNG_B64, subject: SUBJECT, marker: MARKER });
  log('draft di-seed, uid =', draftUid);
  assert.ok(draftUid, 'uid draft tidak diperoleh dari save');

  // ── A2. Buka folder Draf → klik baris draft → compose terbuka ──────────────
  await page.goto(`${HOST}/webmail/mail`, { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => !document.querySelector('.animate-pulse'), { timeout: 45_000 }).catch(() => {});
  await sleep(800);
  assert.ok(await openDraftsFolder(page), 'folder Draf/Drafts tidak ditemukan di sidebar');
  await page.waitForFunction((t) => document.body.textContent.includes(t), { timeout: 45_000 }, SUBJECT);
  await page.evaluate((t) => {
    const rows = [...document.querySelectorAll('div.text-sm.truncate')];
    const row = rows.find((el) => el.textContent?.includes(t));
    if (!row) throw new Error(`baris draft "${t}" tidak ada`);
    row.click();
  }, SUBJECT);
  await page.waitForFunction(() => document.body.textContent.includes('Kepada:'), { timeout: 30_000 });
  // Settle: openDraftForEdit selesai saat modal terbuka, tapi beri jeda agar
  // form benar-benar hidrasi (klik prematur = submit tanpa efek — flaky).
  await sleep(1500);
  log('compose terbuka dari draft');

  // ── A3. Intercept /api/send → klik Kirim → assert payload ──────────────────
  let sendPayload = null;
  page.on('request', (req) => {
    if (req.url().includes('/api/send') && req.method() === 'POST') {
      try { sendPayload = req.postData(); } catch { /* ignore */ }
    }
  });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button[type="submit"]')]
      .find((el) => el.textContent.includes('Kirim'));
    if (!b) throw new Error('tombol Kirim tidak ditemukan');
    b.click();
  });
  for (let i = 0; i < 60 && !sendPayload; i++) await sleep(500);
  if (!sendPayload) {
    // Diagnostik: error validasi? field kosong? dump state modal.
    const diag = await page.evaluate(() => {
      const modal = [...document.querySelectorAll('div')].find((el) => el.textContent?.includes('Kepada:'));
      return {
        modalError: [...document.querySelectorAll('p, span, div')].map((el) => el.textContent?.trim())
          .find((t) => t && (t.includes('wajib') || t.includes('tidak valid') || t.includes('Gagal'))),
        toValue: document.querySelector('input[type="text"], input[type="email"]')?.value || '',
        bodyText: document.body.textContent.includes('Mengirim...') ? 'sending' : 'idle',
      };
    });
    console.error('[e2e-datapaths] DIAG modal:', JSON.stringify(diag));
  }
  assert.ok(sendPayload, 'request /api/send tidak terpicu dalam 30 detik');
  const payload = JSON.parse(sendPayload);
  assert.equal(payload.to, USER, `penerima salah: ${payload.to}`);
  assert.ok(payload.body.includes(MARKER), 'body draft tidak terbawa ke payload kirim');
  const atts = payload.attachments || [];
  assert.equal(atts.length, 2, `restore draft: lampiran = ${atts.length}, diharapkan 2 (PDF + PNG CID)`);
  const byName = Object.fromEntries(atts.map((a) => [a.filename, a]));
  assert.ok(byName['lampiran.pdf'], 'PDF hilang dari restore draft');
  assert.ok(byName['footer.png'], 'PNG inline CID HILANG dari restore draft — includeHidden gagal?');
  assert.equal(byName['lampiran.pdf'].contentType, 'application/pdf');
  assert.equal(byName['footer.png'].contentType, 'image/png');
  assert.ok((byName['lampiran.pdf'].data || '').length > 50, 'data PDF kosong');
  assert.ok((byName['footer.png'].data || '').length > 20, 'data PNG CID kosong');
  log('✅ restore draft: payload kirim membawa', atts.map((a) => a.filename).join(' + '), '(termasuk CID) + body + penerima');

  // ── A4. Urungkan (undo queue) → email tidak pernah di-deliver ─────────────
  // Toast undo baru muncul SETELAH response /api/send (queue diterima) —
  // tunggu hingga tombolnya ada (maks 15s), jangan cek seketika (race).
  let sendResponse = null;
  page.on('response', async (res) => {
    if (res.url().includes('/api/send')) {
      try { sendResponse = { status: res.status(), body: (await res.text()).slice(0, 200) }; } catch { /* abaikan */ }
    }
  });
  let undone = false;
  try {
    await page.waitForFunction(() => {
      const b = [...document.querySelectorAll('button')].find((el) => el.textContent?.trim() === 'Urungkan');
      if (!b) return false;
      b.click();
      return true;
    }, { timeout: 15_000 });
    undone = true;
  } catch {
    undone = false;
  }
  assert.ok(undone, `toast undo (tombol "Urungkan") tidak muncul setelah kirim; response /api/send = ${JSON.stringify(sendResponse)}`);
  await sleep(2000);
  let delivered = 0;
  for (let i = 0; i < 10; i++) {
    delivered = countMailbox('INBOX', SUBJECT);
    if (delivered > 0) break;
    await sleep(2000);
  }
  assert.equal(delivered, 0, `email seharusnya dibatalkan tapi muncul ${delivered}× di INBOX`);
  log('✅ undo send: email dibatalkan — tidak ada delivery ke INBOX');

  // ══ B. EXPORT .EML ══════════════════════════════════════════════════════════
  // Seed email berlampiran (PDF + CID PNG) di INBOX via doveadm.
  const boundary = `dp${STAMP}b`;
  const mail = [
    'From: Data Path Seeder <seeder@example.com>',
    `To: ${USER}`,
    `Subject: ${SUBJECT}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <dp-${STAMP}@example.com>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: multipart/related; boundary="rel' + STAMP + '"',
    '',
    `--rel${STAMP}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    `<p>Body eml data-path. Marker: ${MARKER}</p><img src="cid:footer@e2e">`,
    '',
    `--rel${STAMP}`,
    'Content-Type: image/png',
    'Content-Transfer-Encoding: base64',
    'Content-ID: <footer@e2e>',
    'Content-Disposition: inline; filename="footer.png"',
    '',
    PNG_B64,
    '',
    `--rel${STAMP}--`,
    '',
    `--${boundary}`,
    'Content-Type: application/pdf; name="lampiran.pdf"',
    `Content-Disposition: attachment; filename="${PDF_NAME}"`,
    'Content-Transfer-Encoding: base64',
    '',
    PDF_B64,
    '',
    `--${boundary}--`,
    '',
  ].join('\n');
  sshRemote(`${REMOTE_PREAMBLE}docker exec -i "$DC" doveadm save -u "$U" -m INBOX <<'MAILEOF'
${mail}
MAILEOF
`);
  log('email berlampiran di-seed ke INBOX');

  // CDP: izinkan unduhan ke /tmp.
  const client = await page.target().createCDPSession();
  const cdpBrowser = await browser.target().createCDPSession();
  await cdpBrowser.send('Browser.setDownloadBehavior', {
    behavior: 'allow', downloadPath: tmpdir(), eventsEnabled: true,
  });
  const downloadDone = new Promise((resolve) => {
    cdpBrowser.on('Browser.downloadWillBegin', (e) => resolve(e.suggestedFilename));
  });

  // Buka email di reader.
  await page.goto(`${HOST}/webmail/mail`, { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => !document.querySelector('.animate-pulse'), { timeout: 45_000 }).catch(() => {});
  await page.waitForFunction((t) => document.body.textContent.includes(t), { timeout: 45_000 }, SUBJECT);
  await page.evaluate((t) => {
    const rows = [...document.querySelectorAll('div.text-sm.truncate')];
    const row = rows.find((el) => el.textContent?.includes(t));
    if (!row) throw new Error(`baris email "${t}" tidak ada di INBOX`);
    row.click();
  }, SUBJECT);
  await page.waitForSelector('button[aria-label="Unduh sebagai file .eml"]', { timeout: 30_000 });

  const dlPromise = downloadDone;
  await page.click('button[aria-label="Unduh sebagai file .eml"]');
  const filename = await Promise.race([
    dlPromise,
    sleep(20_000).then(() => null),
  ]);
  assert.ok(filename, 'unduhan .eml tidak terpicu dalam 20 detik');
  log('.eml terunduh:', filename);
  const emlPath = join(tmpdir(), filename);
  // Tunggu file selesai ditulis.
  for (let i = 0; i < 20 && !existsSync(emlPath); i++) await sleep(300);
  assert.ok(existsSync(emlPath), `file .eml tidak ada di ${emlPath}`);
  await sleep(500);
  const eml = readFileSync(emlPath, 'utf8');
  console.error('[e2e-datapaths] EML HEAD:\n' + eml.slice(0, 2200));
  const mSrc = eml.match(/<img[^>]{0,200}/i);
  console.error('[e2e-datapaths] IMG TAG DI EML:', mSrc ? mSrc[0] : '(tidak ada <img>)');
  assert.ok(eml.includes(`Subject: ${SUBJECT}`), 'Subject hilang dari .eml');
  assert.ok(eml.includes(MARKER), 'body (marker) hilang dari .eml');
  assert.ok(eml.includes(`filename="${PDF_NAME}"`), 'lampiran PDF hilang dari .eml');
  assert.ok(eml.includes('footer.png'), 'PNG CID hilang dari .eml');
  assert.ok(eml.includes('Content-ID: <footer@e2e>') || eml.includes('footer@e2e'), 'Content-ID CID tidak dipertahankan di .eml');
  log('✅ export .eml: subjek + body + PDF + PNG CID + Content-ID lengkap');
  try { unlinkSync(emlPath); } catch { /* cleanup best-effort */ }

  // ── Tanpa pageerror React ──────────────────────────────────────────────────
  const realErrors = consoleErrors.filter((e) => !/Download the React DevTools/i.test(e));
  assert.deepEqual(realErrors, [], `tanpa pageerror: ${JSON.stringify(realErrors)}`);

  console.log('✅ e2e-datapaths-browser: restore draft (kirim payload 2 lampiran + undo) + export .eml lolos');
} catch (err) {
  console.error('❌ e2e-datapaths-browser GAGAL:', err.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  expungeSubject(SUBJECT);
}
