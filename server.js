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
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:8888,http://127.0.0.1:8888')
  .split(',').map(s => s.trim());
app.use(cors({ origin: CORS_ORIGINS, credentials: true }));
app.use(express.json({ limit: '10mb' }));

// ── Config DB ──────────────────────────────────────────────────────────────────
const MYSQL_CONTAINER = process.env.MYSQL_CONTAINER || 'mailcow-mysql-mailcow-1';
const MYSQL_USER      = process.env.DBUSER || 'mailcow';
const MYSQL_PASS      = process.env.DBPASS;  // WAJIB diisi via env — tidak ada default
const MYSQL_DB        = process.env.DBNAME || 'mailcow';

// ── Config API Key (optional) ───────────────────────────────────────────────────
// Jika di-set, semua request ke /api/* WAJIB menyertakan header X-Api-Key.
// Biarkan kosong untuk development (tanpa auth).
const API_KEY = process.env.API_KEY || '';

// ── Simple in-memory rate limiter ───────────────────────────────────────────────
// Sliding window per key. Reset otomatis saat server restart.
const rateLimitBuckets = new Map();
setInterval(() => {
  // Bersihkan bucket expired setiap 60 detik
  const now = Date.now();
  for (const [key, bucket] of rateLimitBuckets) {
    bucket.timestamps = bucket.timestamps.filter(t => now - t < bucket.windowMs);
    if (bucket.timestamps.length === 0) rateLimitBuckets.delete(key);
  }
}, 60000);

function rateLimit({ max = 10, windowMs = 60000, keyFn }) {
  return (req, res, next) => {
    const key = keyFn(req);
    const now = Date.now();
    if (!rateLimitBuckets.has(key)) {
      rateLimitBuckets.set(key, { timestamps: [], windowMs });
    }
    const bucket = rateLimitBuckets.get(key);
    bucket.timestamps = bucket.timestamps.filter(t => now - t < windowMs);
    if (bucket.timestamps.length >= max) {
      return res.status(429).json({ message: 'Terlalu banyak permintaan. Silakan coba lagi nanti.' });
    }
    bucket.timestamps.push(now);
    next();
  };
}

// ── Auth middleware ─────────────────────────────────────────────────────────────
function requireApiKey(req, res, next) {
  if (!API_KEY) return next();
  const key = req.headers['x-api-key'];
  if (!key || key !== API_KEY) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  next();
}

// ── Security middleware (applied to all /api/* routes) ──────────────────────────
app.use('/api', requireApiKey);
app.use('/api', (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');
  next();
});

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, smtp: SMTP_HOST, port: SMTP_PORT });
});

// ── GET Preferences ────────────────────────────────────────────────────────────
// Membaca preferences SOGo langsung dari database MySQL.
// SOGo tidak menyediakan JSON REST endpoint untuk GET — selalu mengembalikan HTML.
app.get('/api/preferences', rateLimit({ max: 30, windowMs: 60000, keyFn: req => req.ip }), (req, res) => {
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
app.post('/api/send', rateLimit({ max: 10, windowMs: 60000, keyFn: req => req.ip }), async (req, res) => {
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

// ── Validation ─────────────────────────────────────────────────────────────────
if (!MYSQL_PASS) {
  console.error('❌ DBPASS environment variable is required. Set it before starting.');
  process.exit(1);
}

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend proxy running at http://127.0.0.1:${PORT}`);
  console.log(`SMTP: ${SMTP_HOST}:${SMTP_PORT} (secure=${SMTP_SECURE})`);
  console.log(`CORS origins: ${CORS_ORIGINS.join(', ')}`);
  console.log(`API Key auth: ${API_KEY ? 'ENABLED' : 'DISABLED (development mode)'}`);
  console.log(`Rate limit: /api/send=10/min, /api/preferences=30/min`);
});
