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
import { isSafeRecipient, recipientAddress, validateRecipientList, hasControlChars } from './src/lib/emailValidation.js';
import { parseCookies, buildSmtpSessionCookie, clearSmtpSessionCookie, SMTP_SESSION_COOKIE } from './src/lib/smtpCookie.js';
import { fetchRemoteImage } from './src/lib/remoteImage.js';
import { validateAttachments, MAX_ATTACHMENTS, MAX_FILE_MB_DEFAULT, MAX_TOTAL_MB_DEFAULT, MAX_ATTACHMENTS_DEFAULT } from './src/lib/attachmentValidation.js';
import {
  createSendQueue, buildQueueEntry, dueEntries, pendingForUser, canCancel,
  encryptCredentials, decryptCredentials, maxScheduleMs, SEND_QUEUE_STATUS,
} from './src/lib/sendQueue.js';

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
// Body limit utk lampiran base64. Batas akhir tetap divalidasi di
// validateAttachments(). Nilai env: SMTP_MAX_ATTACHMENT_MB (default 20),
// SMTP_MAX_TOTAL_MB (default 60) — sama yg dipakai validateAttachments.
// Body JSON ~ base64 + overhead; alokasikan ~2x total utk aman (JSON escaping,
// field lain, batch).
const MAX_ATTACHMENT_MB = parseInt(process.env.SMTP_MAX_ATTACHMENT_MB || String(MAX_FILE_MB_DEFAULT), 10) || MAX_FILE_MB_DEFAULT;
const MAX_TOTAL_MB     = parseInt(process.env.SMTP_MAX_TOTAL_MB || String(MAX_TOTAL_MB_DEFAULT), 10) || MAX_TOTAL_MB_DEFAULT;
const MAX_ATT_LIMIT    = parseInt(process.env.SMTP_MAX_ATTACHMENTS || String(MAX_ATTACHMENTS_DEFAULT), 10) || MAX_ATTACHMENTS_DEFAULT;
const MAX_FILE_B64     = Math.floor(MAX_ATTACHMENT_MB * 1024 * 1024 * 4 / 3) + 1024;
const MAX_TOTAL_B64    = Math.floor(MAX_TOTAL_MB * 1024 * 1024 * 4 / 3) + 2048;
app.use(express.json({ limit: `${Math.max(MAX_TOTAL_B64 * 2, 32)}mb` }));

// ── Config DB ──────────────────────────────────────────────────────────────────
const MYSQL_CONTAINER = process.env.MYSQL_CONTAINER || 'mailcow-mysql-mailcow-1';
const MYSQL_USER      = process.env.DBUSER || 'mailcow';
const MYSQL_PASS      = process.env.DBPASS;
const MYSQL_DB        = process.env.DBNAME || 'mailcow';
const DB_PORT         = parseInt(process.env.DB_PORT || '3306', 10);

// ── Config API Key (wajib di production) ──────────────────────────────────────
const API_KEY = process.env.API_KEY || '';

// ── Input validation helpers (pure — lihat src/lib/emailValidation.js) ────────
// isSafeEmail / isSafeRecipient / recipientAddress / validateRecipientList /
// hasControlChars diimpor dari src/lib/emailValidation.js (diuji terpisah).

function getHeaderToken(req, name) {
  const value = req.headers[name];
  return typeof value === 'string' ? value : '';
}

// ── SMTP Session Store (server-side, in-memory) ────────────────────────────────
// Key: session token (UUID), Value: { user, pass, createdAt, lastUsed }
// Session expired setelah 8 jam atau 30 menit idle
const smtpSessions = new Map();
// TTL dapat diketatkan via env (menit). Default: 8 jam total, 30 menit idle.
const SESSION_MAX_AGE_MS = (parseInt(process.env.SMTP_SESSION_TTL_MIN || '480', 10) || 480) * 60 * 1000;
const SESSION_IDLE_MS    = (parseInt(process.env.SMTP_SESSION_IDLE_MIN || '30', 10) || 30) * 60 * 1000;
const SESSION_MAX_PER_USER = parseInt(process.env.SMTP_SESSION_MAX_PER_USER || '10', 10) || 10;

// Cookie sesi SMTP bersifat Secure (HTTPS-only) secara default. Bisa dimatikan
// via env COOKIE_SECURE=false utk pengujian server.js lokal via http.
const COOKIE_SECURE = process.env.COOKIE_SECURE !== 'false';

// ── Delayed/scheduled send queue ──────────────────────────────────────────────
// Undo send (default 3 menit) & Kirim Terjadwal di-server-side: kirim ditahan
// di queue persist (file) sampai due. Kredensial SMTP dienkripsi AES-256-GCM
// dengan kunci turunan dari QUEUE_SECRET (fallback API_KEY — wajib ada).
const SEND_UNDO_SECONDS = parseInt(process.env.SMTP_SEND_UNDO_SECONDS || '180', 10) || 0;
const SEND_QUEUE_FILE  = process.env.SEND_QUEUE_FILE || '';
const QUEUE_SECRET     = process.env.SEND_QUEUE_SECRET || API_KEY;
const SEND_MAX_HORIZON = maxScheduleMs(process.env.SMTP_SEND_MAX_HORIZON_MS);
const SEND_FLUSH_MS    = parseInt(process.env.SMTP_SEND_FLUSH_MS || '5000', 10) || 5000;

const __dirname = new URL('.', import.meta.url).pathname;
const sendQueue = createSendQueue({ filePath: SEND_QUEUE_FILE || `${__dirname}data/pending-sends.json` });

// Bersihkan entry failed lama (>= 24 jam) sekali per jam agar file tidak membengkak.
setInterval(() => sendQueue.pruneStale(24 * 60 * 60 * 1000), 60 * 60 * 1000);

function createSmtpTransporter(user, pass) {
  const tlsOpts = { rejectUnauthorized: true };
  if (SMTP_TLS_CA) {
    tlsOpts.ca = readFileSync(SMTP_TLS_CA);
  }
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user, pass },
    tls: tlsOpts,
  });
}

function buildMailOptions(sessionUser, payload) {
  const att = payload.attachments && payload.attachments.length > 0
    ? payload.attachments.map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        content: Buffer.from(a.data || '', 'base64'),
      }))
    : undefined;
  return {
    from: sessionUser,
    to: payload.to,
    cc: payload.cc || undefined,
    bcc: payload.bcc || undefined,
    subject: payload.subject,
    [payload.isHTML ? 'html' : 'text']: payload.body,
    attachments: att,
  };
}

// Flush queue: kirim entry yang sudah due. Retry maks 3x lalu tandai failed.
async function flushDueSends() {
  const entries = dueEntries(sendQueue.list());
  for (const entry of entries) {
    try {
      const cred = decryptCredentials(QUEUE_SECRET, entry.cred);
      const transporter = createSmtpTransporter(cred.user, cred.pass);
      const info = await transporter.sendMail(buildMailOptions(cred.user, entry.payload));
      console.log(`[send] flushed ${entry.id}: ${info.messageId}`);
      sendQueue.remove(entry.id);
    } catch (err) {
      const next = (entry.attempts || 0) + 1;
      console.error(`[send] flush ${entry.id} percobaan ${next} gagal: ${err.message}`);
      if (next >= 3) {
        sendQueue.markFailed(entry.id, err.message);
      } else {
        sendQueue.touchAttempt(entry.id, next);
      }
    }
  }
}

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
    // Scope bucket per route, bukan hanya per IP. Tanpa ini semua endpoint
    // (/api/send, /api/preferences, /api/auth/smtp) berbagi SATU bucket per IP
    // dan windowMs-nya diambil dari route pertama yang membuat bucket —
    // mis. 5x POST /api/auth/smtp dalam 1 menit ikut memblokir /api/send.
    const key = `${keyFn(req)}|${req.method} ${req.path}`;
    const now = Date.now();
    if (!rateLimitBuckets.has(key)) {
      rateLimitBuckets.set(key, { timestamps: [], windowMs });
    }
    const bucket = rateLimitBuckets.get(key);
    bucket.timestamps = bucket.timestamps.filter(t => now - t < windowMs);
    if (bucket.timestamps.length >= max) {
      res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
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
//
// Hanya percaya X-Real-IP bila koneksi datang dari proxy terpercaya. Bisa
// diketatkan via env TRUSTED_PROXY_IPS (koma, exact IP), mis.
// TRUSTED_PROXY_IPS=172.25.1.1. Fallback default: loopback (dev) atau jaringan
// docker bridge 172.16/12 tempat nginx mailcow berada.
const TRUSTED_PROXY_IPS = (process.env.TRUSTED_PROXY_IPS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

function clientIp(req) {
  const peer = (req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
  const isTrustedPeer = peer === '127.0.0.1' || (
    TRUSTED_PROXY_IPS.length > 0
      ? TRUSTED_PROXY_IPS.includes(peer)
      : /^172\.(1[6-9]|2\d|3[01])\./.test(peer)
  );
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

// Ambil token sesi SMTP: cookie httpOnly (jalur baru) → header X-SMTP-Token →
// body.smtpToken (fallback kompatibilitas versi lama saat deploy bertahap).
function getSmtpSessionToken(req) {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[SMTP_SESSION_COOKIE]) return cookies[SMTP_SESSION_COOKIE];
  const header = getHeaderToken(req, 'x-smtp-token');
  if (header) return header;
  if (typeof req.body?.smtpToken === 'string' && req.body.smtpToken) return req.body.smtpToken;
  return '';
}

function requireSmtpSession(req, res, next) {
  const token = getSmtpSessionToken(req);
  const session = token ? getSmtpSession(token) : null;
  if (!session) return res.status(401).json({ message: 'Sesi SMTP sudah berakhir. Silakan login ulang.' });
  req.smtpSession = session;
  next();
}

// Resolve sesi tanpa menolak — dipakai middleware rate-limit utk meng-key
// bucket per AKUN (bukan per IP). Req tanpa sesi sah jatuh ke key IP.
function resolveSmtpSession(req, _res, next) {
  const token = getSmtpSessionToken(req);
  const session = token ? getSmtpSession(token) : null;
  req.smtpSession = session; // mungkin null — handler yang menolak
  next();
}

// ── Remote image proxy (anti tracking-pixel) ────────────────────────────────
// Logika fetch (SSRF guard, hard deadline anti slow-drip, redirect, size cap)
// dipindah ke src/lib/remoteImage.js agar bisa diuji tanpa menyalakan Express.
// <img src> tidak bisa kirim header X-Api-Key, jadi route ini didefinisikan
// SEBELUM requireApiKey.

app.get('/api/image-proxy', rateLimit({ max: 120, windowMs: 60000, keyFn: clientIp }), async (req, res) => {
  // Anti-hotlink: browser menyetel Sec-Fetch-Site: cross-site saat embed lintas origin.
  if (getHeaderToken(req, 'sec-fetch-site') === 'cross-site') {
    return res.status(403).json({ message: 'Forbidden' });
  }
  try {
    const { contentType, buffer } = await fetchRemoteImage(req.query.url);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    return res.send(buffer);
  } catch (err) {
    const status = err && typeof err.status === 'number' ? err.status : 500;
    const message = err && err.message ? err.message : 'Gagal memuat gambar.';
    return res.status(status).json({ message });
  }
});

// ── Security middleware (applied to all /api/* routes) ──────────────────────────
app.use('/api', requireApiKey);
app.use('/api', (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  // HSTS 1 tahun — konsisten dgn nginx /webmail (header nginx level-server mailcow
  // memakai 15768000/6 bln; server.js override supaya /api/* seragam + menang
  // atas duplikat saat keduanya muncul).
  res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  // API mengembalikan data email sensitif (header/body/prefs) — jangan di-cache
  // browser/shared cache (pola OWASP: Cache-Control no-store utk data sensitif).
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  // Strict CSP: only allow resources from same origin + inline styles (Tailwind)
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; object-src 'none'; frame-ancestors 'none';"
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

  // Batasi session per user (evict tertua) — cegah Map tumbuh tanpa batas
  // akibat login berulang / token bocor yang tidak direvoke.
  const userSessions = [];
  for (const [t, s] of smtpSessions) {
    if (s.user === user) userSessions.push({ token: t, createdAt: s.createdAt });
  }
  if (userSessions.length > SESSION_MAX_PER_USER) {
    userSessions.sort((a, b) => a.createdAt - b.createdAt);
    for (let i = 0; i < userSessions.length - SESSION_MAX_PER_USER; i++) {
      smtpSessions.delete(userSessions[i].token);
    }
  }

  // Token kini disimpan sebagai cookie httpOnly (bukan dikembalikan ke JS).
  // XSS tidak bisa membaca token; CSRF dimitigasi SameSite=Strict + X-Api-Key.
  res.setHeader('Set-Cookie', buildSmtpSessionCookie(token, {
    secure: COOKIE_SECURE,
    maxAgeSec: Math.floor(SESSION_MAX_AGE_MS / 1000),
  }));

  // Never log credentials or token material, even partially.
  console.log(`[smtp-session] Registered for ${user}`);
  return res.json({ ok: true });
});

// ── Revoke SMTP Session (logout) ────────────────────────────────────────────
app.delete('/api/auth/smtp', rateLimit({ max: 10, windowMs: 60000, keyFn: clientIp }), (req, res) => {
  const token = getSmtpSessionToken(req);
  if (token) smtpSessions.delete(token);
  res.setHeader('Set-Cookie', clearSmtpSessionCookie({ secure: COOKIE_SECURE }));
  return res.json({ ok: true });
});

// ── SMTP Session Status (countdown timer di header) ──────────────────────────
// Kembalikan sisa waktu sesi proxy (ambil minimum dari max-age dan idle) agar
// frontend bisa menampilkan countdown sebelum sesi berakhir dan memicu
// auto-logout via _onSessionExpired. Tidak mengembalikan pass/token apapun.
app.get('/api/auth/smtp/status', rateLimit({ max: 30, windowMs: 60000, keyFn: clientIp }), requireSmtpSession, (req, res) => {
  const session = req.smtpSession;
  const now = Date.now();
  const remainingAbs  = Math.max(0, SESSION_MAX_AGE_MS - (now - session.createdAt));
  const remainingIdle = Math.max(0, SESSION_IDLE_MS    - (now - session.lastUsed));
  res.json({
    user: session.user,
    createdAt: session.createdAt,
    lastUsed: session.lastUsed,
    maxAgeMs: SESSION_MAX_AGE_MS,
    idleMs: SESSION_IDLE_MS,
    // Sesi berakhir bilamana salah satu habis — minimum yg berlaku.
    remainingMs: Math.min(remainingAbs, remainingIdle),
  });
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
  // Kirim Terjadwal: ISO timestamp (opsional). Tanpa ini, kirim langsung
  // (atau ditahan SEND_UNDO_SECONDS bila > 0 utk fitur undo send).
  sendAt: z.string().max(40).optional(),
  // UI dapat mengirim display-name: "Nama <user@example.com>".
  // Format dan alamat akhirnya divalidasi setelah parsing, sebelum Nodemailer.
  from: z.string().max(998).optional().default(''),
  // Lampiran dikirim sebagai base64 (tanpa prefix data URI). Validasi detail
  // (ukuran, base64, nama file) dilakukan di validateAttachments().
  attachments: z.array(z.object({
    filename: z.string().max(255),
    contentType: z.string().max(255),
    data: z.string(),
  })).max(MAX_ATTACHMENTS).optional().default([]),
});

// Konfigurasi kirim (batas lampiran, dll) utk frontend — agar validasi client
// sinkron dengan nilai env server. Per-route, tanpa sesi SMTP (nilai publik).
app.get('/api/send/config', rateLimit({ max: 60, windowMs: 60000, keyFn: clientIp }), (_req, res) => {
  res.json({
    maxFileMB: MAX_ATTACHMENT_MB,
    maxTotalMB: MAX_TOTAL_MB,
    maxAttachments: MAX_ATT_LIMIT,
    undoSeconds: SEND_UNDO_SECONDS,
  });
});

// Rate-limit kirim per AKUN (bukan per IP): kantor/NAT berbagi satu IP
// publik, key IP membuat 10 kirim/menit tersedot semua user (429 palsu /
// self-DoS). Key = session.user; request tanpa sesi sah fallback ke IP.
app.post('/api/send', resolveSmtpSession, rateLimit({ max: 10, windowMs: 60000, keyFn: (req) => req.smtpSession?.user || clientIp(req) }), async (req, res) => {
  // Zod validation
  const parsed = sendEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    return res.status(400).json({ message: firstError?.message || 'Payload tidak valid.' });
  }
  const { to, cc, bcc, subject, body, isHTML, from } = parsed.data;

  // Validate every address-bearing/header field before passing it to Nodemailer.
  if (!validateRecipientList(to)) {
    return res.status(400).json({ message: 'Field "to" harus berisi email yang valid.' });
  }
  if (!validateRecipientList(cc) || !validateRecipientList(bcc)) {
    return res.status(400).json({ message: 'Cc/Bcc harus berisi email yang valid.' });
  }
  if (hasControlChars(subject)) {
    return res.status(400).json({ message: 'Subjek email tidak valid.' });
  }
  if (from && !isSafeRecipient(from)) {
    return res.status(400).json({ message: 'Alamat pengirim tidak valid.' });
  }

  // Validasi lampiran (ukuran per-file, total, base64, nama file). Batas
  // mengikuti env (SMTP_MAX_ATTACHMENT_MB / SMTP_MAX_TOTAL_MB / SMTP_MAX_ATTACHMENTS).
  const att = validateAttachments(parsed.data.attachments, {
    maxAttachments: MAX_ATT_LIMIT,
    maxFileBase64: MAX_FILE_B64,
    maxFileMB: MAX_ATTACHMENT_MB,
    maxTotalBase64: MAX_TOTAL_B64,
    maxTotalMB: MAX_TOTAL_MB,
  });
  if (!att.ok) {
    return res.status(400).json({ message: att.error });
  }

  // Look up SMTP session — token diambil dari cookie httpOnly (fallback header/body).
  // resolveSmtpSession sudah mengisinya utk rate-limit key; lookup ulang di sini
  // TIDAK dilakukan — pakai req.smtpSession (nilai sama, di-refresh lastUsed).
  const session = req.smtpSession;
  if (!session) {
    // Log 401 with hint untuk monitoring rasio idle expiry (lihat scripts/monitor-smtp.sh).
    // Jangan log token/email — sebelumnya tak ada telemetry, ini hanya counter + ip.
    console.log(`[smtp-session] 401 send: sesi tidak valid (ip=${clientIp(req)})`);
    return res.status(401).json({ message: 'Sesi SMTP sudah berakhir. Silakan login ulang.' });
  }

  if (from && recipientAddress(from) !== session.user.toLowerCase()) {
    return res.status(403).json({ message: 'Alamat pengirim harus sesuai dengan akun yang login.' });
  }

  // ── Kirim Terjadwal / Undo Send: tahan di queue sampai due ────────────────
  // sendAt eksplisit (jadwal) ATAU window undo default (semua kirim ditahan
  // SEND_UNDO_SECONDS detik agar user bisa batal — pola Gmail).
  const now = Date.now();
  let effectiveSendAt = 0;
  if (parsed.data.sendAt) {
    const t = new Date(parsed.data.sendAt).getTime();
    if (!Number.isFinite(t)) {
      return res.status(400).json({ message: 'Waktu terjadwal tidak valid.' });
    }
    effectiveSendAt = t;
  } else if (SEND_UNDO_SECONDS > 0) {
    effectiveSendAt = now + SEND_UNDO_SECONDS * 1000;
  }

  if (effectiveSendAt > now) {
    if (effectiveSendAt - now > SEND_MAX_HORIZON) {
      return res.status(400).json({ message: 'Jadwal kirim terlalu jauh ke depan (maks 7 hari).' });
    }
    if (!QUEUE_SECRET) {
      return res.status(500).json({ message: 'Queue send tidak dikonfigurasi (SEND_QUEUE_SECRET).' });
    }
    const cred = encryptCredentials(QUEUE_SECRET, { user: session.user, pass: session.pass });
    const entry = buildQueueEntry({
      user: session.user,
      sendAt: effectiveSendAt,
      payload: {
        to, cc, bcc, subject, body, isHTML,
        from,
        attachments: att.sanitized,
      },
      cred,
    });
    sendQueue.add(entry);
    console.log(`[send] queued ${entry.id} utk ${session.user} → ${new Date(effectiveSendAt).toISOString()}`);
    return res.json({ ok: true, queued: true, id: entry.id, sendAt: entry.sendAt });
  }

  try {
    const transporter = createSmtpTransporter(session.user, session.pass);
    const mailOptions = buildMailOptions(session.user, {
      to, cc, bcc, subject, body, isHTML, from,
      attachments: att.sanitized,
    });

    const info = await transporter.sendMail(mailOptions);
    console.log(`[send] OK: ${info.messageId}`);
    return res.json({ ok: true, messageId: info.messageId });

  } catch (err) {
    console.error('[send] ERROR:', err.message);
    return res.status(500).json({ message: 'Gagal mengirim email via SMTP.' });
  }
});

// ── Batal kirim yang masih di queue (undo send / batalkan jadwal) ────────────
app.post('/api/send/undo', requireSmtpSession, rateLimit({ max: 30, windowMs: 60000, keyFn: (req) => req.smtpSession?.user || clientIp(req) }), (req, res) => {
  const id = typeof req.body?.id === 'string' ? req.body.id.trim() : '';
  if (!id || id.length > 100) {
    return res.status(400).json({ message: 'ID tidak valid.' });
  }
  const entry = sendQueue.find(id);
  if (!entry || entry.user !== req.smtpSession.user) {
    return res.status(404).json({ message: 'Kiriman tidak ditemukan.' });
  }
  if (!canCancel(entry)) {
    return res.status(409).json({ message: 'Kiriman sudah terkirim atau tidak bisa dibatalkan.' });
  }
  sendQueue.remove(id);
  console.log(`[send] dibatalkan: ${id}`);
  return res.json({ ok: true });
});

// ── Daftar kiriman terjadwal milik user (untuk UI badge + cancel) ────────────
app.get('/api/send/pending', requireSmtpSession, rateLimit({ max: 30, windowMs: 60000, keyFn: (req) => req.smtpSession?.user || clientIp(req) }), (req, res) => {
  const items = pendingForUser(sendQueue.list(), req.smtpSession.user);
  return res.json({ items });
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

  // Flush queue kirim terjadwal/undo-send berkala (mulai setelah server jalan).
  // Interval pendek (5 dtk) agar email yang due tidak tertunda lama; entry yang
  // gagal tetap di-queue (retry 3x) supaya tidak hilang saat crash/restart.
  setInterval(() => { flushDueSends().catch((err) => console.error('[send] flush loop error:', err.message)); }, SEND_FLUSH_MS);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend proxy running at http://127.0.0.1:${PORT}`);
    console.log(`SMTP: ${SMTP_HOST}:${SMTP_PORT} (secure=${SMTP_SECURE})`);
    console.log(`CORS origins: ${CORS_ORIGINS.join(', ')}`);
    console.log('API Key auth: ENABLED');
    console.log(`Rate limit: /api/send=10/min, /api/preferences=30/min`);
    console.log(`Send queue: undo=${SEND_UNDO_SECONDS}s, horizon=${SEND_MAX_HORIZON / 3600000}h, file=${SEND_QUEUE_FILE || (__dirname + 'data/pending-sends.json')}`);
  });
}

start();
