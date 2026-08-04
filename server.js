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
import mysql from 'mysql2/promise';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import crypto from 'crypto';
import { z } from 'zod';

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Node.js version guard ───────────────────────────────────────────────────────
const NODE_MAJOR = parseInt(process.version.slice(1).split('.')[0], 10);
if (NODE_MAJOR < 18) {
  console.error(`❌ Requires Node.js 18+ (current: ${process.version}). Upgrade Node.`);
  process.exit(1);
}

// ── Config SMTP ────────────────────────────────────────────────────────────────
const SMTP_HOST    = process.env.SMTP_HOST;
const SMTP_PORT    = parseInt(process.env.SMTP_PORT || '465');
const SMTP_SECURE  = SMTP_PORT === 465;
const SMTP_TLS_CA  = process.env.SMTP_TLS_CA  || ''; // path to custom CA cert (optional — system CAs always trusted)

// ── Middleware ─────────────────────────────────────────────────────────────────
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:8888,http://127.0.0.1:8888')
  .split(',').map(s => s.trim());
app.use(cors({ origin: CORS_ORIGINS, credentials: true }));
app.use(express.json({ limit: '10mb' }));

// ── Config DB ──────────────────────────────────────────────────────────────────
const MYSQL_CONTAINER = process.env.MYSQL_CONTAINER || 'mailcow-mysql-mailcow-1';
const MYSQL_USER      = process.env.DBUSER || 'mailcow';
const MYSQL_PASS      = process.env.DBPASS;
const MYSQL_DB        = process.env.DBNAME || 'mailcow';
const DB_PORT         = parseInt(process.env.DB_PORT || '3306', 10);

// ── Config API Key (wajib di production) ──────────────────────────────────────
const API_KEY = process.env.API_KEY || '';

// ── Input validation helpers ───────────────────────────────────────────────────

function isSafeEmail(value) {
  if (typeof value !== 'string' || value.length > 254) return false;
  const at = value.indexOf('@');
  return at > 0 && at === value.lastIndexOf('@') && at < value.length - 1 &&
    !value.includes(' ') && !value.includes('<') && !value.includes('>');
}

function isSafeRecipient(value) {
  if (typeof value !== 'string' || /[\r\n]/.test(value)) return false;
  const trimmed = value.trim();
  const open = trimmed.lastIndexOf('<');
  if (open >= 0 && trimmed.endsWith('>')) return isSafeEmail(trimmed.slice(open + 1, -1));
  return isSafeEmail(trimmed);
}

function recipientAddress(value) {
  const trimmed = String(value || '').trim();
  const open = trimmed.lastIndexOf('<');
  return (open >= 0 && trimmed.endsWith('>')
    ? trimmed.slice(open + 1, -1)
    : trimmed).trim().toLowerCase();
}

function validateRecipientList(value) {
  if (!value) return true;
  const recipients = value.split(',').map((item) => item.trim()).filter(Boolean);
  return recipients.length > 0 && recipients.every(isSafeRecipient);
}

function getHeaderToken(req, name) {
  const value = req.headers[name];
  return typeof value === 'string' ? value : '';
}

// ── SMTP Session Store (server-side, in-memory) ────────────────────────────────
// Key: session token (UUID), Value: { user, pass, createdAt, lastUsed }
// Session expired setelah 8 jam atau 30 menit idle
const smtpSessions = new Map();
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;  // 8 jam
const SESSION_IDLE_MS   = 30 * 60 * 1000;        // 30 menit

function getSmtpSession(token) {
  const session = smtpSessions.get(token);
  if (!session) return null;
  const now = Date.now();
  if (now - session.createdAt > SESSION_MAX_AGE_MS) {
    smtpSessions.delete(token);
    return null;
  }
  if (now - session.lastUsed > SESSION_IDLE_MS) {
    smtpSessions.delete(token);
    return null;
  }
  session.lastUsed = now;
  return session;
}

// Bersihkan session expired setiap 5 menit
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of smtpSessions) {
    if (now - session.createdAt > SESSION_MAX_AGE_MS || now - session.lastUsed > SESSION_IDLE_MS) {
      smtpSessions.delete(token);
    }
  }
}, 5 * 60 * 1000);

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

// ── IP klien asli untuk rate limiting ──────────────────────────────────────────
// Nginx selalu menimpa header X-Real-IP dengan alamat remote asli (nilai dari
// client tidak dipercaya), jadi header ini aman dipakai sebagai rate-limit key.
// Tanpa ini, semua user di belakang nginx berbagi satu bucket karena req.ip
// selalu IP proxy — limit 10 kirim/menit akan tersedot oleh satu orang.
function clientIp(req) {
  const peer = (req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
  // Hanya percaya X-Real-IP jika koneksi datang dari proxy terpercaya:
  // loopback (dev) atau jaringan docker bridge tempat nginx mailcow berada.
  // Jika 3005 diakses langsung dari luar, header spoof tidak boleh diterima.
  const isTrustedPeer = peer === '127.0.0.1' || /^172\.(1[6-9]|2\d|3[01])\./.test(peer);
  if (isTrustedPeer && req.headers['x-real-ip']) return req.headers['x-real-ip'];
  return peer || 'unknown';
}

// ── Auth middleware ─────────────────────────────────────────────────────────────
function requireApiKey(req, res, next) {
  const key = getHeaderToken(req, 'x-api-key');
  const expected = API_KEY;
  // Compare byte lengths before timingSafeEqual; string length is not byte length
  // for UTF-8 input and could otherwise produce an avoidable 500 response.
  if (!key || !expected) return res.status(403).json({ message: 'Forbidden' });
  const a = Buffer.from(key, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  next();
}

function requireSmtpSession(req, res, next) {
  const token = getHeaderToken(req, 'x-smtp-token');
  const session = token ? getSmtpSession(token) : null;
  if (!session) return res.status(401).json({ message: 'Sesi SMTP sudah berakhir. Silakan login ulang.' });
  req.smtpSession = session;
  next();
}

// ── Security middleware (applied to all /api/* routes) ──────────────────────────
app.use('/api', requireApiKey);
app.use('/api', (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');
  // Strict CSP: only allow resources from same origin + inline styles (Tailwind)
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; frame-ancestors 'none';"
  );
  next();
});

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// ── Database pool (mysql2) ──────────────────────────────────────────────────────
let pool = null;

async function initDatabase() {
  let dbHost = process.env.DB_HOST;

  if (!dbHost) {
    try {
      // One-time docker inspect to get the MySQL container IP
      dbHost = execFileSync(
        'docker',
        ['inspect', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', MYSQL_CONTAINER],
        { timeout: 5000, encoding: 'utf8' }
      ).trim();
      if (!dbHost) dbHost = '127.0.0.1';
    } catch {
      dbHost = '127.0.0.1';
    }
  }

  pool = mysql.createPool({
    host: dbHost,
    port: DB_PORT,
    user: MYSQL_USER,
    password: MYSQL_PASS,
    database: MYSQL_DB,
    waitForConnections: true,
    connectionLimit: 3,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  });

  // Verify connection works
  await pool.query('SELECT 1');
  console.log(`[DB] Connected to MySQL at ${dbHost}:${DB_PORT} (pool: 3 conns)`);
  return pool;
}

async function queryPreferences(email) {
  const [rows] = await pool.query(
    'SELECT c_defaults, c_settings FROM sogo_user_profile WHERE c_uid = ? LIMIT 1',
    [email]
  );
  if (rows.length === 0) return { defaults: {}, settings: {} };

  const row = rows[0];
  let defaults = {};
  let settings = {};
  try { defaults = JSON.parse(row.c_defaults || '{}'); } catch {}
  try { settings = JSON.parse(row.c_settings || '{}'); } catch {}
  return { defaults, settings };
}

// ── Register SMTP Session ──────────────────────────────────────────────────
const smtpSessionSchema = z.object({
  user: z.string().email('Format email tidak valid.').max(254),
  pass: z.string().min(1, 'Password wajib diisi.').max(1024),
}).strict();

app.post('/api/auth/smtp', rateLimit({ max: 5, windowMs: 60000, keyFn: clientIp }), (req, res) => {
  const parsed = smtpSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Data sesi SMTP tidak valid.' });
  }
  const { user, pass } = parsed.data;

  const token = crypto.randomUUID();
  smtpSessions.set(token, {
    user,
    pass,
    createdAt: Date.now(),
    lastUsed: Date.now(),
  });

  // Never log credentials or token material, even partially.
  console.log(`[smtp-session] Registered for ${user}`);
  return res.json({ token });
});

// ── Revoke SMTP Session (logout) ────────────────────────────────────────────
app.delete('/api/auth/smtp', rateLimit({ max: 10, windowMs: 60000, keyFn: clientIp }), (req, res) => {
  const headerToken = getHeaderToken(req, 'x-smtp-token');
  const bodyToken = typeof req.body?.smtpToken === 'string' ? req.body.smtpToken : '';
  const token = headerToken || bodyToken;
  if (token) smtpSessions.delete(token);
  return res.json({ ok: true });
});

// ── GET Preferences ────────────────────────────────────────────────────────────
app.get('/api/preferences', rateLimit({ max: 30, windowMs: 60000, keyFn: clientIp }), requireSmtpSession, async (req, res) => {
  const sessionEmail = req.smtpSession.user;
  const requestedEmail = typeof req.query.email === 'string' ? req.query.email : '';
  if (requestedEmail && requestedEmail.toLowerCase() !== sessionEmail.toLowerCase()) {
    return res.status(403).json({ message: 'Akun tidak sesuai dengan sesi.' });
  }

  try {
    const prefs = await queryPreferences(sessionEmail);
    console.log(`[preferences] OK ${sessionEmail}`);
    return res.json(prefs);
  } catch (err) {
    console.error('[preferences] ERROR:', err.message);
    return res.status(500).json({ message: 'Gagal membaca preferensi dari database.' });
  }
});


// ── Send email (Zod validated + session-based SMTP) ───────────────────────────
const sendEmailSchema = z.object({
  to: z.string().min(1, 'Field "to" wajib diisi.').max(2000),
  cc: z.string().max(2000).optional().default(''),
  bcc: z.string().max(2000).optional().default(''),
  subject: z.string().max(998).default(''),
  body: z.string().max(10_000_000).default(''),
  isHTML: z.boolean().default(true),
  // UI dapat mengirim display-name: "Nama <user@example.com>".
  // Format dan alamat akhirnya divalidasi setelah parsing, sebelum Nodemailer.
  from: z.string().max(998).optional().default(''),
  smtpToken: z.string().min(32, 'smtpToken tidak valid. Silakan login ulang.'),
});

app.post('/api/send', rateLimit({ max: 10, windowMs: 60000, keyFn: clientIp }), async (req, res) => {
  // Zod validation
  const parsed = sendEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    return res.status(400).json({ message: firstError?.message || 'Payload tidak valid.' });
  }
  const { to, cc, bcc, subject, body, isHTML, from, smtpToken } = parsed.data;

  // Validate every address-bearing/header field before passing it to Nodemailer.
  if (!validateRecipientList(to)) {
    return res.status(400).json({ message: 'Field "to" harus berisi email yang valid.' });
  }
  if (!validateRecipientList(cc) || !validateRecipientList(bcc)) {
    return res.status(400).json({ message: 'Cc/Bcc harus berisi email yang valid.' });
  }
  if (/[\r\n]/.test(subject)) {
    return res.status(400).json({ message: 'Subjek email tidak valid.' });
  }
  if (from && !isSafeRecipient(from)) {
    return res.status(400).json({ message: 'Alamat pengirim tidak valid.' });
  }

  // Look up SMTP session
  const session = getSmtpSession(smtpToken);
  if (!session) {
    return res.status(401).json({ message: 'Sesi SMTP sudah berakhir. Silakan login ulang.' });
  }

  try {
    const tlsOpts = { rejectUnauthorized: true };
    if (SMTP_TLS_CA) {
      tlsOpts.ca = readFileSync(SMTP_TLS_CA);
    }
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: session.user, pass: session.pass },
      tls: tlsOpts,
    });

    if (from && recipientAddress(from) !== session.user.toLowerCase()) {
      return res.status(403).json({ message: 'Alamat pengirim harus sesuai dengan akun yang login.' });
    }

    const mailOptions = {
      // Never allow the browser to spoof the SMTP account in the From header.
      from: session.user,
      to,
      cc: cc || undefined,
      bcc: bcc || undefined,
      subject,
      [isHTML ? 'html' : 'text']: body,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[send] OK: ${info.messageId}`);
    return res.json({ ok: true, messageId: info.messageId });

  } catch (err) {
    console.error('[send] ERROR:', err.message);
    return res.status(500).json({ message: 'Gagal mengirim email via SMTP.' });
  }
});

// ── Error boundary ─────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[api] Unhandled request error:', err.message);
  if (res.headersSent) return;
  res.status(500).json({ message: 'Terjadi kesalahan internal server.' });
});

// ── Start ──────────────────────────────────────────────────────────────────────
async function start() {
  if (!MYSQL_PASS) {
    console.error('❌ DBPASS environment variable is required. Set it before starting.');
    process.exit(1);
  }
  if (!SMTP_HOST) {
    console.error('❌ SMTP_HOST environment variable is required. Set it before starting.');
    process.exit(1);
  }
  if (!API_KEY) {
    console.error('❌ API_KEY environment variable is required. Set it before starting.');
    process.exit(1);
  }

  try {
    await initDatabase();
  } catch (err) {
    console.error('[DB] Failed to connect:', err.message);
    console.error('[DB] Check DB_HOST, DB_PORT, DBUSER, DBPASS, DBNAME');
    process.exit(1);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend proxy running at http://127.0.0.1:${PORT}`);
    console.log(`SMTP: ${SMTP_HOST}:${SMTP_PORT} (secure=${SMTP_SECURE})`);
    console.log(`CORS origins: ${CORS_ORIGINS.join(', ')}`);
    console.log('API Key auth: ENABLED');
    console.log(`Rate limit: /api/send=10/min, /api/preferences=30/min`);
  });
}

start();
