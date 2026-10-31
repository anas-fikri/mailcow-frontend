/**
 * BROWSER E2E — conversation header aggregates (unread/flag/lampiran) LIVE:
 *
 *   1. Seed 3-email thread di INBOX diag2 via doveadm (ssh deploy-mail):
 *      - pesan lama   : plain, \Seen (dibaca)
 *      - pesan tengah : PDF attachment + \Flagged
 *      - pesan terbaru: plain, unread
 *   2. Login UI → aktifkan conversation view.
 *   3. ASSERT collapsed: chip "{n} belum dibaca" (n=2) + chip bintang (flag=1)
 *      + chip paperclip (lampiran=1 — di pesan TENGAH, bukan baris terbaru:
 *      bukti agregat lintas pesan, bukan sekadar properti pesan terbaru).
 *   4. Klik header → expand → ASSERT indikator "📎 Lampiran" per-baris tampil.
 *   Test sengaja TIDAK membuka pesan di reader (buka = otomatis \Seen →
 *   mengubah hitungan unread). Verifikasi reader (fix regresi lampiran
 *   2026-09-22) tercakup di e2e-draft-attachments-browser.mjs + golden.
 *   5. Cleanup: expunge by subject via doveadm — dijamin jalan via finally.
 *
 * Run (opt-in, perlu diag2 aktif — lihat e2e-browser-runner.sh):
 *   SERVER=deploy-mail scripts/e2e-browser-runner.sh conversation
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';

const HOST = process.env.E2E_HOST || 'https://mail.example.com';
const USER = process.env.E2E_USER || 'diag2@example.com';
const PASS = process.env.E2E_PASS || 'DiagTest123!';
const STAMP = Date.now();
const SUBJECT = `E2E Conv Thread ${STAMP}`;
const PDF_NAME = 'lampiran.pdf';

const log = (...a) => console.log('[e2e-conv-header]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browser;

// ── doveadm helpers (ssh deploy-mail) ────────────────────────────────────────
const REMOTE_PREAMBLE = `set -e
F=$(find /data /root /home -maxdepth 4 -name 'mailcow.conf' 2>/dev/null | head -1)
[ -n "$F" ] && source "$F" >/dev/null 2>&1 || true
DC=$(docker ps --format '{{.Names}}' | grep -Ei 'dovecot' | head -1)
U='diag2@example.com'
`;

function sshRemote(script) {
  return execSync("ssh -o ConnectTimeout=15 deploy-mail 'bash -s'", {
    input: script,
    encoding: 'utf8',
    timeout: 90_000,
  });
}

function pdfBase64() {
  const pdf = [
    '%PDF-1.4',
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj',
    'trailer<</Root 1 0 R/Size 4>>',
    '%%EOF',
    '',
  ].join('\n');
  return Buffer.from(pdf, 'utf8').toString('base64');
}

function buildMail({ dateRfc, msgId, attach }) {
  if (!attach) {
    return [
      'From: Thread Seeder <seeder@example.com>',
      `To: ${USER}`,
      `Subject: ${SUBJECT}`,
      `Date: ${dateRfc}`,
      `Message-ID: ${msgId}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Halo — pesan uji thread E2E (tanpa lampiran).',
      '',
    ].join('\n');
  }
  const boundary = `e2econv${STAMP}b`;
  return [
    'From: Thread Seeder <seeder@example.com>',
    `To: ${USER}`,
    `Subject: ${SUBJECT}`,
    `Date: ${dateRfc}`,
    `Message-ID: ${msgId}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Halo — pesan uji thread E2E DENGAN lampiran PDF.',
    '',
    `--${boundary}`,
    `Content-Type: application/pdf; name="${PDF_NAME}"`,
    `Content-Disposition: attachment; filename="${PDF_NAME}"`,
    'Content-Transfer-Encoding: base64',
    '',
    pdfBase64(),
    '',
    `--${boundary}--`,
    '',
  ].join('\n');
}

function saveMail(mail) {
  sshRemote(`${REMOTE_PREAMBLE}docker exec -i "$DC" doveadm save -u "$U" -m INBOX <<'MAILEOF'
${mail}
MAILEOF
`);
}

function flagByMsgId(msgId, flag) {
  sshRemote(`${REMOTE_PREAMBLE}
UIDS=$(docker exec "$DC" doveadm search -u "$U" mailbox INBOX HEADER Message-ID "${msgId}" | awk '{print $NF}')
[ -n "$UIDS" ] || { echo "pesan tidak ditemukan: ${msgId}" >&2; exit 3; }
for uid in $UIDS; do
  docker exec "$DC" doveadm flags add -u "$U" "${flag}" mailbox INBOX uid "$uid" >/dev/null
done
`);
}

function cleanupThread() {
  try {
    sshRemote(`${REMOTE_PREAMBLE}
docker exec "$DC" doveadm expunge -u "$U" mailbox INBOX HEADER Subject "E2E Conv Thread" >/dev/null 2>&1 || true
`);
    log('cleanup: email thread uji di-expunge');
  } catch (e) {
    log('warn cleanup:', e.message);
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
      ? `${libDir}:${process.env.LD_LIBRARY_PATH}`
      : libDir;
  }
}

/** Cari tombol header thread via chip agregat lampiran (selector stabil). */
function headerThreadLocator(page) {
  return page.evaluateHandle((subj) => {
    const btns = [...document.querySelectorAll('button')];
    return btns.find(
      (b) =>
        b.querySelector('span[title*="berlampiran dalam percakapan"]') &&
        b.textContent.includes(subj),
    );
  }, SUBJECT);
}

try {
  ensureChromeLibs();
  const executablePath = process.env.CHROME_PATH || findChrome() || undefined;
  log('chrome:', executablePath || '(bundled default)');

  // ── 1. Seed thread 3 pesan ─────────────────────────────────────────────────
  const mails = [
    { id: 1, hoursAgo: 3, seen: true, flagged: false, attach: false },
    { id: 2, hoursAgo: 2, seen: false, flagged: true, attach: true },
    { id: 3, hoursAgo: 1, seen: false, flagged: false, attach: false },
  ];
  for (const m of mails) {
    const dateRfc = new Date(STAMP - m.hoursAgo * 3600_000).toUTCString().replace('GMT', '+0000');
    const msgId = `<e2e-conv-${STAMP}-${m.id}@example.com>`;
    saveMail(buildMail({ dateRfc, msgId, attach: m.attach }));
    if (m.seen) flagByMsgId(msgId, '\\Seen');
    if (m.flagged) flagByMsgId(msgId, '\\Flagged');
  }
  log('3 pesan thread di-seed (1 dibaca, 1 berlampiran+flag, 1 unread)');

  // ── 2. Login via UI ────────────────────────────────────────────────────────
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

  // Capture semua response /view (daftar pesan) — ground truth yang diterima UI.
  const viewResponses = [];
  page.on('response', async (res) => {
    try {
      const url = res.url();
      if (!url.includes('/Mail/0/') || !url.endsWith('/view')) return;
      const text = await res.text();
      const info = { status: res.status(), len: text.length, uids: null, rows: 0, convRows: 0 };
      try {
        const j = JSON.parse(text);
        info.uids = Array.isArray(j.uids) ? j.uids.length : null;
        const headers = Array.isArray(j.headers) ? j.headers : [];
        const cols = (headers[0] || []).map((c) => String(c).toLowerCase());
        const iSubj = cols.indexOf('subject');
        info.rows = headers.length - 1;
        info.convRows = headers
          .slice(1)
          .filter((row) => Array.isArray(row) && String(row[iSubj]).includes('E2E Conv')).length;
      } catch {}
      viewResponses.push(info);
    } catch {}
  });

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

  // ── 3. Mail page → aktifkan conversation view (idempoten) ─────────────────
  // aria-label tombol: 'Tampilan percakapan' (OFF) / 'Tampilan biasa' (ON).
  await page.goto(`${HOST}/webmail/mail`, { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => !document.querySelector('.animate-pulse'), { timeout: 45_000 }).catch(() => {});
  await sleep(800);
  const convAlreadyOn = await page.evaluate(() =>
    [...document.querySelectorAll('button')].some((el) => el.getAttribute('aria-label') === 'Tampilan biasa'),
  );
  if (!convAlreadyOn) {
    const toggled = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(
        (el) => el.getAttribute('aria-label') === 'Tampilan percakapan',
      );
      if (!b) return false;
      b.click();
      return true;
    });
    assert.ok(toggled, 'tombol conversation (aria-label="Tampilan percakapan") tidak ditemukan di toolbar');
    await page.waitForFunction(
      () => [...document.querySelectorAll('button')].some((el) => el.getAttribute('aria-label') === 'Tampilan biasa'),
      { timeout: 10_000 },
    );
  }
  log('conversation view AKTIF');

  // ── 4. Collapsed: chip agregat di header thread ────────────────────────────
  await page.waitForFunction((t) => document.body.textContent.includes(t), { timeout: 45_000 }, SUBJECT);
  // Beri waktu fetch lanjutan (refetch focus/unseen) mereda sebelum asersi.
  await sleep(1500);
  const header = await headerThreadLocator(page);
  if (!header || !header.asElement()) {
    const diag = await page.evaluate((t, viewResponses) => {
      const inner = document.body.innerText;
      return {
        viewResponses,
        countChip: (document.querySelector('span.tabular-nums')?.textContent || '').trim(),
        threadHeaderButtons: [...document.querySelectorAll('button[aria-label*="percakapan"]')]
          .map((el) => el.getAttribute('aria-label')),
        convOccurrence: inner.split('E2E Conv').length - 1,
        subjectOccurrence: inner.split(t).length - 1,
        anyAttachChip: !!document.querySelector('span[title*="berlampiran dalam percakapan"]'),
        listSnippet: inner.slice(0, 6000),
        sogoViewNote: 'lihat viewResponses di atas',
      };
    }, SUBJECT, viewResponses);
    console.error('[e2e-conv-header] DIAG:', JSON.stringify(diag, null, 2));
    console.error('[e2e-conv-header] PAGEERRORS:', JSON.stringify(consoleErrors));
    await page.screenshot({ path: '/tmp/conv-diag.png' }).catch(() => {});
  }
  assert.ok(header && header.asElement(), 'header thread (dgn chip lampiran) tidak ditemukan');
  const chips = await page.evaluate((el) => {
    const clip = el.querySelector('span[title*="pesan berlampiran dalam percakapan"]');
    const star = el.querySelector('span[title*="pesan ditandai dalam percakapan"]');
    const unread = el.querySelector('span[title*="belum dibaca dalam percakapan"]');
    return {
      clipTitle: clip?.getAttribute('title') || '',
      starTitle: star?.getAttribute('title') || '',
      unreadTitle: unread?.getAttribute('title') || '',
    };
  }, header);
  assert.match(chips.clipTitle, /1 pesan berlampiran dalam percakapan/, `paperclip salah: ${chips.clipTitle}`);
  assert.match(chips.starTitle, /1 pesan ditandai dalam percakapan/, `bintang salah: ${chips.starTitle}`);
  assert.match(chips.unreadTitle, /2 pesan belum dibaca dalam percakapan/, `unread salah: ${chips.unreadTitle}`);
  log('✅ collapsed: chip unread=2, flag=1, lampiran=1 (lampiran di pesan TENGAH terlihat di header)');

  // ── 5. Expand: indikator 📎 per-baris untuk pesan berlampiran ──────────────
  const headerEl = header.asElement();
  await headerEl.click();
  await sleep(800);
  const expanded = await page.evaluate((el) => {
    const wrap = el.parentElement || document.body;
    return { lampiranRows: (wrap.textContent.match(/📎 Lampiran/g) || []).length };
  }, headerEl);
  assert.ok(expanded.lampiranRows >= 1, 'expanded: indikator "📎 Lampiran" per-baris tidak terlihat');
  log(`✅ expanded: indikator per-baris tampil (${expanded.lampiranRows}× "📎 Lampiran")`);

  // ── 6. Tanpa pageerror React ───────────────────────────────────────────────
  const realErrors = consoleErrors.filter((e) => !/Download the React DevTools/i.test(e));
  assert.deepEqual(realErrors, [], `tanpa pageerror: ${JSON.stringify(realErrors)}`);

  console.log('✅ e2e-conversation-header-browser: agregat header thread (unread/flag/lampiran) collapsed+expanded lolos');
} catch (err) {
  console.error('❌ e2e-conversation-header-browser GAGAL:', err.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  cleanupThread();
}
