/**
 * SOGo Frontend — Backend Proxy Server
 *
 * Dijalankan bersama Vite dev server di port 3001.
 * Menyediakan endpoint /api/send untuk kirim email via SMTP (workaround SOGo /send yang return 501).
 *
 * Cara pakai:
 *   node server.js
 * Atau jalankan bersama Vite:
 *   npm run dev:all
 */

import express from 'express';
import cors    from 'cors';
import nodemailer from 'nodemailer';

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

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, smtp: SMTP_HOST, port: SMTP_PORT });
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
app.listen(PORT, '127.0.0.1', () => {
  console.log(`Backend proxy running at http://127.0.0.1:${PORT}`);
  console.log(`SMTP: ${SMTP_HOST}:${SMTP_PORT} (secure=${SMTP_SECURE})`);
});
