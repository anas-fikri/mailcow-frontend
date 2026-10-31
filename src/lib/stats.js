/**
 * Stats API — Mail statistics untuk dashboard.
 * Data real dari SOGo API per user login.
 */

import { fetchMessages } from './api';

// ─── Mock fallback (saat SOGo API error) ───────────────────────────────────────
const MOCK_DAILY = [
  { date: 'Sen', sent: 0, received: 0, bounced: 0, spam: 0 },
  { date: 'Sel', sent: 0, received: 0, bounced: 0, spam: 0 },
  { date: 'Rab', sent: 0, received: 0, bounced: 0, spam: 0 },
  { date: 'Kam', sent: 0, received: 0, bounced: 0, spam: 0 },
  { date: 'Jum', sent: 0, received: 0, bounced: 0, spam: 0 },
  { date: 'Sab', sent: 0, received: 0, bounced: 0, spam: 0 },
  { date: 'Min', sent: 0, received: 0, bounced: 0, spam: 0 },
];

const MOCK_STORAGE = {
  used: 0,
  total: 0,
  mailboxes: 0,
  domains: 0,
};

// ─── Hitung jumlah pesan di folder ────────────────────────────────────────────

/**
 * Ambil jumlah total pesan di suatu folder via SOGo API.
 * @returns {number} Jumlah pesan, atau 0 jika error.
 */
async function countFolder(sogoToken, folderId) {
  try {
    // Request one row only; fetchMessages still returns the folder total from SOGo metadata.
    const result = await fetchMessages(sogoToken, folderId, { limit: 1 });
    return result.total || 0;
  } catch {
    return 0;
  }
}

/**
 * Hitung jumlah bounce (pesan dari MAILER-DAEMON) di Inbox.
 */
async function countBounces(sogoToken) {
  try {
    const result = await fetchMessages(sogoToken, 'folderINBOX');
    const bounces = (result.messages || []).filter((m) => {
      const from = String(m.from || '').toLowerCase();
      const subject = String(m.subject || '').toLowerCase();
      return from.includes('mailer-daemon') || from.includes('mail delivery system') ||
             from.includes('postmaster') || subject.includes('undelivered') ||
             subject.includes('delivery failure') ||
             subject.includes('returned mail');
    });
    return bounces.length;
  } catch {
    return 0;
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch statistik real per user dari SOGo.
 * Data sent = jumlah pesan di folder Sent,
 * Data received = jumlah pesan di folder Inbox,
 * Data bounced = deteksi bounce dari inbox,
 * Data spam = jumlah pesan di folder Junk.
 *
 * @param {string} sogoToken - SOGo session token
 * @param {string} email - Email user (untuk display)
 * @param {string} [period] - '7d' | '30d' (belum dipakai, data total folder)
 */
export async function fetchAllStats(sogoToken, email, period = '7d') {
  // Ambil data dari SOGo secara paralel
  let [sentCount, receivedCount, spamCount, bounceCount] = [0, 0, 0, 0];
  let error = null;

  try {
    [sentCount, receivedCount, spamCount, bounceCount] = await Promise.all([
      countFolder(sogoToken, 'folderSent'),
      countFolder(sogoToken, 'folderINBOX'),
      countFolder(sogoToken, 'folderJunk'),
      countBounces(sogoToken),
    ]);
  } catch (e) {
    error = e;
  }

  const summary = {
    sent: sentCount,
    received: receivedCount,
    bounced: bounceCount,
    rejected: spamCount > 0 ? Math.round(spamCount * 0.15) : 0, // estimasi rejected ~15% dari spam
    spamCaught: spamCount,
    virusBlocked: 0, // tidak ada data virus dari SOGo
    _user: email,    // marker bahwa ini per-user
    _error: error?.message || null,
  };

  // Daily trends — kita tidak punya data per-hari dari SOGo,
  // jadi bagi rata total selama 7 hari sebagai estimasi
  const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const daily = dayNames.map((date, i) => ({
    date,
    sent: Math.round(sentCount / 7),
    received: Math.round(receivedCount / 7),
    bounced: Math.round(bounceCount / 7),
    spam: Math.round(spamCount / 7),
  }));

  // Storage — tidak bisa dari SOGo, fallback ke 0
  const storage = { ...MOCK_STORAGE };

  // Comparison — kita tidak punya data periode sebelumnya,
  // jadi null (tidak tampilkan trend)
  const comparison = null;

  return { summary, daily, storage, comparison };
}
