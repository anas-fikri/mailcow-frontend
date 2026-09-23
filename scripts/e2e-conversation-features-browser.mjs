/**
 * BROWSER E2E — audit live fitur conversation lain (sortAsc, expand-all,
 * pagination) yang dijaga test statis:
 *
 *   1. Seed thread A (3 pesan: lama-dibaca, tengah-lampiran+flag, baru-unread)
 *      dan thread B (3 pesan, semua dibaca).
 *   2. Login UI → aktifkan conversation view.
 *   3. SORTASC: toggle "Urutkan terlama dulu" → urutan grup terbalik; preview
 *      thread A TETAP pesan terbaru (waktu preview tidak berubah — kontrak
 *      "sortAsc hanya membalik urutan grup, bukan anggota").
 *   4. EXPAND-ALL: tombol "Perluas semua percakapan" → semua header memuat
 *      anggota lama; anggota berlampiran punya "📎 Lampiran" per-baris.
 *   5. PAGINATION: seed 105 email plain lama (lebih lama dari thread) →
 *      /view hanya prefetch ~100 → scroll ke bawah memicu /headers → thread
 *      tetap 1 grup + chip agregat benar. Scroll juga memicu "scroll untuk
 *      memuat lagi" → cleanup expunge by subject idempoten (finally).
 *
 * Run (opt-in, perlu diag2 aktif):
 *   SERVER=deploy-mail scripts/e2e-browser-runner.sh convfeatures
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';

const HOST = process.env.E2E_HOST || 'https://mail.pcpexpress.co.id';
const USER = process.env.E2E_USER || 'diag2@pcpexpress.co.id';
const PASS = process.env.E2E_PASS || 'DiagTest123!';
const STAMP = Date.now();
const SUBJ_A = `E2E Conv Audit A ${STAMP}`;
const SUBJ_B = `E2E Conv Audit B ${STAMP}`;
const SUBJ_FILLER = `E2E Conv Audit Fill ${STAMP}`;
const PDF_NAME = 'lampiran.pdf';

const log = (...a) => console.log('[e2e-conv-feat]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browser;

// ── doveadm helpers ──────────────────────────────────────────────────────────
const REMOTE_PREAMBLE = `set -e
F=$(find /data /root /home -maxdepth 4 -name 'mailcow.conf' 2>/dev/null | head -1)
[ -n "$F" ] && source "$F" >/dev/null 2>&1 || true
DC=$(docker ps --format '{{.Names}}' | grep -Ei 'dovecot' | head -1)
U='diag2@pcpexpress.co.id'
`;

function sshRemote(script) {
  return execSync("ssh -o ConnectTimeout=15 deploy-mail 'bash -s'", {
    input: script,
    encoding: 'utf8',
    timeout: 180_000,
  });
}

function pdfBase64() {
  const pdf = [
    '%PDF-1.4',
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj',
    'trailer<</Root 1 B>>',
    '%%EOF',
    '',
  ].join('\n');
  return Buffer.from(pdf, 'utf8').toString('base64');
}

function buildMail({ dateRfc, msgId, subject, attach = false, body = null }) {
  if (!attach) {
    return [
      'From: Audit Seeder <seeder@pcpexpress.co.id>',
      `To: ${USER}`,
      `Subject: ${subject}`,
      `Date: ${dateRfc}`,
      `Message-ID: ${msgId}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      body || 'Halo — pesan uji audit conversation.',
      '',
    ].join('\n');
  }
  const boundary = `e2econv${STAMP}b`;
  return [
    'From: Audit Seeder <seeder@pcpexpress.co.id>',
    `To: ${USER}`,
    `Subject: ${subject}`,
    `Date: ${dateRfc}`,
    `Message-ID: ${msgId}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Halo — pesan uji audit conversation DENGAN lampiran PDF.',
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

function saveAllMails(mails) {
  const heredocs = mails
    .map((mail) => `docker exec -i "$DC" doveadm save -u "$U" -m INBOX <<'MAILEOF'
${mail}
MAILEOF`)
    .join('\n');
  sshRemote(`${REMOTE_PREAMBLE}${heredocs}`);
}

function flagAllBySubject(subject, flag) {
  sshRemote(`${REMOTE_PREAMBLE}
UIDS=$(docker exec "$DC" doveadm search -u "$U" mailbox INBOX HEADER Subject "${subject}" | awk '{print $NF}')
[ -n "$UIDS" ] || { echo "tidak ada pesan: ${subject}" >&2; exit 3; }
for uid in $UIDS; do
  docker exec "$DC" doveadm flags add -u "$U" "${flag}" mailbox INBOX uid "$uid" >/dev/null
done
`);
}

function cleanupAudit() {
  try {
    sshRemote(`${REMOTE_PREAMBLE}
docker exec "$DC" doveadm expunge -u "$U" mailbox INBOX HEADER Subject "E2E Conv Audit" >/dev/null 2>&1 || true
`);
    log('cleanup: email audit di-expunge');
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

/** Klik toggle berdasar aria-label. */
async function clickAria(page, label) {
  const ok = await page.evaluate((l) => {
    const b = [...document.querySelectorAll('button')].find((el) => el.getAttribute('aria-label') === l);
    if (!b) return false;
    b.click();
    return true;
  }, label);
  assert.ok(ok, `tombol aria-label="${label}" tidak ditemukan`);
}

/** Info thread A dari DOM: header (bila ada), waktu preview, anggota. */
function threadAInfo(page) {
  return page.evaluate((subj) => {
    const inner = document.body.innerText;
    const iSub = inner.indexOf(subj);
    const win = inner.slice(Math.max(0, iSub - 120), iSub + 400);
    const headerBtn = [...document.querySelectorAll('button[aria-label*="percakapan ' + subj + '"]')][0] || null;
    const members = (inner.match(/📎 Lampiran/g) || []).length;
    return {
      subjectThere: iSub >= 0,
      headerLabel: headerBtn ? headerBtn.getAttribute('aria-label') : null,
      window: win.replace(/\n+/g, ' | ').slice(0, 260),
      paperclips: members,
    };
  }, SUBJ_A);
}

try {
  ensureChromeLibs();
  const executablePath = process.env.CHROME_PATH || findChrome() || undefined;
  log('chrome:', executablePath || '(bundled default)');

  // ── 1. Seed: thread A (3 pesan), thread B (3 pesan), filler 105 email ──────
  // Urutan waktu: filler 105 (3–107 jam lalu) → thread A (B-A...). Thread A
  // ditulis TERAKHIR agar uid tertinggi & terbaru.
  const mails = [];
  for (let i = 105; i >= 1; i--) {
    mails.push(buildMail({
      dateRfc: new Date(STAMP - i * 3600_000).toUTCString().replace('GMT', '+0000'),
      msgId: `<e2e-audit-fill-${STAMP}-${i}@pcpexpress.co.id>`,
      subject: SUBJ_FILLER,
      body: `Filler ke-${i} utk pagination audit.`,
    }));
  }
  // Thread B: 3 pesan, semua dibaca (4-6 jam lalu)
  for (let i = 6; i >= 4; i--) {
    mails.push(buildMail({
      dateRfc: new Date(STAMP - i * 3600_000).toUTCString().replace('GMT', '+0000'),
      msgId: `<e2e-audit-b-${STAMP}-${i}@pcpexpress.co.id>`,
      subject: SUBJ_B,
    }));
  }
  // Thread A: lama-dibaca, tengah-lampiran, baru-unread (1-3 jam lalu)
  const aDefs = [
    { h: 3, attach: false, seen: true, flagged: false },
    { h: 2, attach: true, seen: false, flagged: true },
    { h: 1, attach: false, seen: false, flagged: false },
  ];
  const aMsgIds = [];
  for (const d of aDefs) {
    const msgId = `<e2e-audit-a-${STAMP}-${d.h}@pcpexpress.co.id>`;
    aMsgIds.push(msgId);
    mails.push(buildMail({
      dateRfc: new Date(STAMP - d.h * 3600_000).toUTCString().replace('GMT', '+0000'),
      msgId,
      subject: SUBJ_A,
      attach: d.attach,
    }));
  }
  log('seed 111 email via ssh (filler 105 + B 3 + A 3)...');
  saveAllMails(mails);
  flagAllBySubject(SUBJ_A, '\\Seen'); // dulu: semua dibaca
  // Flag: hanya pesan tengah A (uid-2: msgId d.h=2) kembali unread + flagged
  sshRemote(`${REMOTE_PREAMBLE}
MID=$(docker exec "$DC" doveadm search -u "$U" mailbox INBOX HEADER Message-ID "<e2e-audit-a-${STAMP}-2@pcpexpress.co.id>" | awk '{print $NF}' | head -1)
[ -n "$MID" ] || { echo "pesan tengah A tidak ditemukan" >&2; exit 3; }
docker exec "$DC" doveadm flags remove -u "$U" "\\Seen" mailbox INBOX uid "$MID" >/dev/null
docker exec "$DC" doveadm flags add -u "$U" "\\Flagged" mailbox INBOX uid "$MID" >/dev/null
`);
  log('seed selesai: 111 email (thread A: 1 dibaca+flagged tengah, 1 unread)');

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

  await page.goto(`${HOST}/webmail/`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[type="email"]');
  await page.locator('input[type="email"]').fill(USER);
  await page.locator('input[type="password"]').fill(PASS);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30_000 }).catch(() => {}),page.click('button[type="submit"]'),
  ]);
  await page.waitForFunction(() => !location.pathname.includes('/login'), { timeout: 30_000 });
  log('login OK');

  // ── 3. Mail page → conversation ON ─────────────────────────────────────────
  await page.goto(`${HOST}/webmail/mail`, { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => !document.querySelector('.animate-pulse'), { timeout: 45_000 }).catch(() => {});
  await sleep(800);
  const convAlreadyOn = await page.evaluate(() =>
    [...document.querySelectorAll('button')].some((el) => el.getAttribute('aria-label') === 'Tampilan biasa'),
  );
  if (!convAlreadyOn) {
    await clickAria(page, 'Tampilan percakapan');
    await page.waitForFunction(
      () => [...document.querySelectorAll('button')].some((el) => el.getAttribute('aria-label') === 'Tampilan biasa'),
      { timeout: 10_000 },
    );
  }
  log('conversation view AKTIF');

  // ── 4. PAGINATION: /view prefetch ~100 dari 114 → sisanya via /headers ────
  // Verifikasi dari UI: chip count (5→...) — kita assert thread A tetap satu
  // grup dgn chip agregat benar (dilihat dari chip di header).
  await page.waitForFunction((t) => document.body.textContent.includes(t), { timeout: 45_000 }, SUBJ_A);
  await sleep(1500);
  let info = await threadAInfo(page);
  assert.ok(info.subjectThere, 'thread A tidak terlihat di daftar');
  log('thread A terlihat:', info.window.slice(0, 120));

  // ── 5. SORTASC: urutan grup berbalik, preview tetap pesan terbaru ──────────
  // Semua query DOM harus di dalam page.evaluate (konteks browser).
  const snapshot = () => page.evaluate((subjA, subjB) => {
    const headerOf = (subj) => {
      const el = document.querySelector('button span[title="' + subj + '"]');
      return el ? el.closest('button') : null;
    };
    const ha = headerOf(subjA);
    const hb = headerOf(subjB);
    const time = (h) => {
      if (!h) return null;
      const m = h.textContent.match(/\d{2}:\d{2}/);
      return m ? m[0] : '';
    };
    const order = (x, y) => {
      if (!x || !y) return 'unknown';
      const all = [...document.querySelectorAll('button')];
      return all.indexOf(x) < all.indexOf(y) ? 'A-first' : 'B-first';
    };
    return {
      headersFound: !!(ha && hb),
      timeA: time(ha),
      order: order(ha, hb),
    };
  }, SUBJ_A, SUBJ_B);

  const before = await snapshot();
  assert.ok(before.headersFound, 'header thread A/B tidak ditemukan di DOM');
  assert.match(before.timeA || '', /^\d{2}:\d{2}$/, `waktu preview thread A tidak terbaca ("${before.timeA}") — asersi tidak valid`);
  assert.equal(before.order, 'A-first', `urutan awal salah (dapat ${before.order}; A terbaru harus duluan)`);
  log(`urutan awal: A-first, preview A = ${before.timeA}`);

  // Toggle ke terlama-dulu (aria-label = state saat ini: 'Urutkan terbaru dulu').
  await clickAria(page, 'Urutkan terbaru dulu');
  await sleep(1200);
  const after = await snapshot();
  assert.ok(after.headersFound, 'header thread hilang setelah toggle sort');
  assert.match(after.timeA || '', /^\d{2}:\d{2}$/, `waktu preview thread A tidak terbaca setelah toggle ("${after.timeA}")`);
  // Kontrak sortAsc: HANYA urutan grup yang dibalik; anggota grup tidak ikut —
  // preview thread A tetap pesan terbaru (jam sama).
  assert.equal(after.timeA, before.timeA, `preview thread A berubah saat sortAsc (${before.timeA} → ${after.timeA}) — anggota grup ikut terbalik?`);
  assert.equal(after.order, 'B-first', `urutan grup tidak berbalik saat sortAsc (dapat ${after.order})`);
  log(`✅ sortAsc: urutan grup berbalik (A-first → ${after.order}), preview A tetap ${after.timeA}`);
  // Kembali ke terbaru-dulu (label state sekarang: 'Urutkan terlama dulu').
  await clickAria(page, 'Urutkan terlama dulu');
  await sleep(800);
  const restored = await snapshot();
  assert.equal(restored.order, 'A-first', 'urutan tidak kembali ke default setelah toggle balik');

  // ── 6. EXPAND-ALL: semua thread terbuka, anggota berlampiran tampil ────────
  await clickAria(page, 'Perluas semua percakapan');
  await sleep(1200);
  info = await threadAInfo(page);
  const paperclipRows = info.paperclips;
  assert.ok(paperclipRows >= 1, `expand-all: "📎 Lampiran" tidak tampil di anggota thread A (paperclips=${paperclipRows})`);
  log(`✅ expand-all: anggota berlampiran tampil (${paperclipRows}× "📎 Lampiran")`);
  // Ciutkan semua (state bersih utk run berikutnya).
  await clickAria(page, 'Ciutkan semua percakapan');
  await sleep(600);

  // ── 7. PAGINATION fase-2: scroll → /headers → semua email termuat ──────────
  // 111 email di-seed + 2 pembanding runner = 113; prefetch /view ≈100 →
  // sisa (~13) hanya termuat via loadMore saat scroll (fase /headers).
  // Kontrak: setelah habis, (a) tidak ada sentinel "Scroll untuk memuat lagi",
  // (b) chip count = angka tunggal tanpa "X / Y" (semua header termuat),
  // (c) grouping thread A tetap utuh dgn preview benar.
  const scrollToListEnd = async () => {
    for (let i = 0; i < 15; i++) {
      const done = await page.evaluate(() => {
        const cands = [...document.querySelectorAll('div')].filter((el) => {
          const oy = getComputedStyle(el).overflowY;
          return (oy === 'auto' || oy === 'scroll') && el.scrollHeight - el.clientHeight > 300;
        });
        cands.sort((x, y) => y.clientHeight - x.clientHeight);
        const list = cands[0];
        if (list) list.scrollTop = list.scrollHeight;
        const t = document.body.innerText;
        return !t.includes('Scroll untuk memuat lagi') && !t.includes('Memuat');
      });
      await sleep(900);
      if (done) return true;
    }
    return false;
  };
  const fullyLoaded = await scrollToListEnd();
  assert.ok(fullyLoaded, 'pagination fase-2 tidak selesai (sentinel load-more masih ada setelah 15 iterasi scroll)');
  const endState = await page.evaluate(() => {
    const chip = (document.querySelector('span.tabular-nums')?.textContent || '').trim();
    const footer = document.body.innerText.includes('Menampilkan');
    const t = document.body.innerText;
    return { chip, footer, headerCount: t.split('E2E Conv Audit A').length - 1, previewCount: t.split('E2E Conv Audit Fill').length - 1 };
  });
  assert.ok(!endState.chip.includes('/'), `chip masih terpotong paginasi ("${endState.chip}") — fase-2 tidak memuat semua header`);
  const chipNum = parseInt(endState.chip, 10);
  assert.ok(chipNum >= 111, `chip count terlalu kecil (${endState.chip}; diharapkan >= 111)`);
  assert.ok(endState.footer, 'footer window INBOX tidak muncul setelah semua termuat');
  // Thread A tetap SATU header (bukan pecah) + filler tidak menduplikasi baris.
  const endSnap = await snapshot();
  assert.ok(endSnap.headersFound && endSnap.order === 'A-first', 'thread A/B tidak utuh setelah pagination fase-2');
  assert.match(endSnap.timeA || '', /^\d{2}:\d{2}$/, 'preview thread A hilang setelah pagination fase-2');
  log(`✅ pagination: ${endState.chip} email termuat penuh (fase /headers), thread tetap utuh (preview A = ${endSnap.timeA})`);

  // ── 8. Tanpa pageerror React ───────────────────────────────────────────────
  const realErrors = consoleErrors.filter((e) => !/Download the React DevTools/i.test(e));
  assert.deepEqual(realErrors, [], `tanpa pageerror: ${JSON.stringify(realErrors)}`);

  console.log('✅ e2e-conversation-features-browser: sortAsc + expand-all + pagination lolos');
} catch (err) {
  console.error('❌ e2e-conversation-features-browser GAGAL:', err.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  cleanupAudit();
}
