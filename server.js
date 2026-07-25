/**
 * SOGo Frontend — Backend Proxy Server
 *
 * Dijalankan bersama Vite dev server di port 3001.
 * Endpoint:
 *   GET  /api/health                - health check
 *   POST /api/send                  - kirim email via SMTP
 *   GET  /api/preferences?email=... - baca SOGo preferences dari database
 *
 * Cara pakai:
 *   node server.js
 * Atau jalankan bersama Vite:
 *   npm run dev:all
 */

import express from 'express';
import cors    from 'cors';
import nodemailer from 'nodemailer';
import { execSync } from 'child_process';

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Config SMTP ────────────────────────────────────────────────────────────────
// Gunakan SMTPS port 465 (SSL) — sudah terbukti tersedia di mail.pcpexpress.co.id
const SMTP_HOST = process.env.SMTP_HOST || 'mail.pcpexpress.co.id';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465');
const SMTP_SECURE = SMTP_PORT === 465;

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(cors({ origin: ['http://localhost:8888', 'http://127.0.0.1:8888'], credentials: true }));
app.use(express.json({ limit: '10mb' }));

// ── Config DB ──────────────────────────────────────────────────────────────────
const MYSQL_CONTAINER = process.env.MYSQL_CONTAINER || 'mailcow-mysql-mailcow-1';
const MYSQL_USER      = process.env.DBUSER || 'mailcow';
const MYSQL_PASS      = process.env.DBPASS || '+DuwfUM1FNfp3FJM2gMSEJ0sR1SOMH7l';
const MYSQL_DB        = process.env.DBNAME || 'mailcow';

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, smtp: SMTP_HOST, port: SMTP_PORT });
});

// ── GET Preferences ────────────────────────────────────────────────────────────
/**
 * GET /api/preferences?email=user@domain.com
 * Membaca preferences SOGo langsung dari database MySQL.
 * SOGo tidak menyediakan JSON REST endpoint untuk GET — selalu mengembalikan HTML.
 */
app.get('/api/preferences', (req, res) => {
  const { email } = req.query;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ message: 'Parameter email tidak valid.' });
  }

  // Sanitasi email: hanya izinkan karakter aman
  const safeEmail = email.replace(/[^a-zA-Z0-9@._+-]/g, '');

  try {
    const query = `SELECT c_defaults, c_settings FROM sogo_user_profile WHERE c_uid='${safeEmail}' LIMIT 1;`;
    const cmd   = `docker exec ${MYSQL_CONTAINER} mysql -u ${MYSQL_USER} -p${MYSQL_PASS} ${MYSQL_DB} -sN -e "${query}"`;

    const output = execSync(cmd, { encoding: 'utf8', timeout: 8000 }).trim();
    if (!output) {
      return res.json({ defaults: {}, settings: {} });
    }

    // output: "col1_value\tcol2_value" (tab-separated)
    const tabs    = output.split('\t');
    const rawDef  = tabs[0] || '{}';
    const rawSet  = tabs[1] || '{}';

    let defaults = {};
    let settings = {};
    try { defaults = JSON.parse(rawDef); } catch {}
    try { settings = JSON.parse(rawSet); } catch {}

    console.log(`[preferences] Loaded for ${safeEmail}: Vacation.enabled=${defaults?.Vacation?.enabled}`);
    return res.json({ defaults, settings });

  } catch (err) {
    console.error('[preferences] ERROR:', err.message);
    return res.status(500).json({ message: 'Gagal membaca preferensi dari database.' });
  }
});


// ── Send email ─────────────────────────────────────────────────────────────────
/**
 * POST /api/send
 * Body: { to, cc, bcc, subject, body, isHTML, from, smtpUser, smtpPass }
 *
 * smtpUser & smtpPass dikirim dari frontend per-request (per-session credential).
 * Ini aman karena hanya digunakan untuk koneksi SMTP internal.
 */
app.post('/api/send', async (req, res) => {
  const {
    to, cc = '', bcc = '',
    subject = '',
    body = '',
    isHTML = true,
    from,
    smtpUser,
    smtpPass,
  } = req.body;

  if (!to)       return res.status(400).json({ message: 'Field "to" wajib diisi.' });
  if (!smtpUser) return res.status(400).json({ message: 'Credential SMTP tidak diberikan.' });
  if (!smtpPass) return res.status(400).json({ message: 'Credential SMTP tidak diberikan.' });

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: smtpUser, pass: smtpPass },
      tls: { rejectUnauthorized: false }, // self-signed cert ok
    });

    const mailOptions = {
      from: from || smtpUser,
      to,
      cc:  cc  || undefined,
      bcc: bcc || undefined,
      subject,
      [isHTML ? 'html' : 'text']: body,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[send] OK: ${info.messageId} → ${to}`);
    return res.json({ ok: true, messageId: info.messageId });

  } catch (err) {
    console.error('[send] ERROR:', err.message);
    return res.status(500).json({ message: err.message || 'Gagal mengirim email via SMTP.' });
  }
});

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend proxy running at http://127.0.0.1:${PORT}`);
  console.log(`SMTP: ${SMTP_HOST}:${SMTP_PORT} (secure=${SMTP_SECURE})`);
});
