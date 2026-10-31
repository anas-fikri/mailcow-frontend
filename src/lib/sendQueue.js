/**
 * sendQueue — Delayed/scheduled SMTP send queue (server-side).
 *
 * Mengapa server-side: undo window 2-3 menit (atau jadwal besok) TIDAK aman
 * ditangani frontend — tab bisa ditutup, browser di-refresh, dll. Email yang
 * "sudah dikirim" harus benar-benar menunggu di server sampai due.
 *
 * Design:
 * - Entry disimpan di file JSON (atomic write: tmp + rename) agar survive
 *   restart. Kredensial SMTP user dienkripsi AES-256-GCM (kunci turunan dari
 *   secret) — tidak pernah disimpan plaintext di disk.
 * - flush() mengirim semua entry due (sendAt <= now), dengan retry terbatas.
 * - cancel() hanya bekerja untuk entry yang belum due (status pending).
 *
 * Modul PURE (file + crypto di-inject) agar bisa diuji tanpa server nyata.
 *
 * RIWAYAT BUG (round-59): versi lama membaca file ulang utk SETIAP operasi
 * (load → mutasi → save). Dua operasi yang berjarak dekat saling menimpa
 * (last-writer-wins) → entry antrean HILANG → email user tak pernah
 * terkirim (kasus nyata: 8b4baf71). Race tmp+rename juga melempar ENOENT dan
 * meracuni flush loop (retry atas email yang SUDAH terkirim = risiko ganda).
 * Sekarang: MEMORI sumber kebenaran (proses tunggal), file hanya persistence;
 * save terserialisasi via promise chain; kegagalan save TIDAK PERNAH dilempar
 * ke pemanggil.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const SEND_QUEUE_STATUS = {
  PENDING: 'pending',
  FAILED: 'failed',
};

// Jeda sebelum percobaan ke-2, ke-3, ke-4. Restart postfix/dovecot saat update
// mailcow butuh beberapa menit — retry beruntun 5 dtk dulu langsung "gagal".
export const RETRY_DELAYS_MS = Object.freeze([60 * 1000, 5 * 60 * 1000, 30 * 60 * 1000]);
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

/** sendAt berikutnya setelah percobaan ke-`attempt` gagal, atau null bila habis. */
export function nextRetryAt(attempt, now = Date.now()) {
  const delay = RETRY_DELAYS_MS[attempt - 1];
  return delay === undefined ? null : now + delay;
}

const sameUser = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

function deriveKey(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest();
}

export function encryptCredentials(secret, { user, pass }) {
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plain = Buffer.from(JSON.stringify({ user, pass }), 'utf8');
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: data.toString('base64'),
  };
}

export function decryptCredentials(secret, cred) {
  if (!cred || cred.v !== 1) throw new Error('Format kredensial tidak dikenal.');
  const key = deriveKey(secret);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(cred.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(cred.tag, 'base64'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(cred.data, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(plain.toString('utf8'));
}

// ── Queue store (in-memory + file-backed) ─────────────────────────────────────
export function createSendQueue({ filePath, readFile = null, writeFile = null, onSaveError = null }) {
  const readImpl = readFile || ((p) => {
    try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
  });
  const writeImpl = writeFile || ((p, data) => {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = `${p}.tmp`;
    fs.writeFileSync(tmp, data, 'utf8');
    fs.renameSync(tmp, p);
  });
  const warnSaveError = onSaveError || ((err) => {
    try { console.error(`[sendQueue] persist gagal (antrean tetap jalan di memori): ${err?.message || err}`); } catch { /* noop */ }
  });

  // Sumber kebenaran = memori. File dibaca SEKALI saat init (survive restart).
  function loadFromDisk() {
    const raw = readImpl(filePath);
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }

  let entries = loadFromDisk();
  let saveChain = Promise.resolve();

  function scheduleSave() {
    // Snapshot di-serialize SEKARANG agar file selalu memuat state terbaru,
    // sementara penulisan dijebol berurutan (tanpa race tmp/rename).
    // Tanpa indentasi (lampiran base64 = sebagian besar isi). stringify bisa
    // melempar RangeError bila antrean melebihi batas panjang string V8 —
    // kegagalan persist TIDAK BOLEH lolos ke pemanggil (mutasi sudah terjadi;
    // melempar = /api/send 500 padahal email tetap terkirim → user kirim ulang).
    let snapshot;
    try {
      snapshot = JSON.stringify(entries);
    } catch (err) {
      warnSaveError(err);
      return saveChain;
    }
    saveChain = saveChain
      .then(() => writeImpl(filePath, snapshot)) // promise async pun di tunggu
      .catch((err) => warnSaveError(err));
    return saveChain;
  }

  return {
    list() { return entries.map((e) => ({ ...e })); },

    find(id) { return entries.find((e) => e.id === id) || null; },

    add(entry) {
      entries.push(entry);
      return scheduleSave();
    },

    remove(id) {
      entries = entries.filter((e) => e.id !== id);
      return scheduleSave();
    },

    markFailed(id, error) {
      entries = entries.map((e) => (e.id === id ? {
        ...e,
        status: SEND_QUEUE_STATUS.FAILED,
        lastError: String(error).slice(0, 300),
        failedAt: Date.now(),
      } : e));
      return scheduleSave();
    },

    // Catat percobaan gagal; nextSendAt (opsional) menunda percobaan berikutnya.
    touchAttempt(id, attempt, nextSendAt = null) {
      entries = entries.map((e) => (e.id === id
        ? { ...e, attempts: attempt, ...(nextSendAt ? { sendAt: nextSendAt } : {}) }
        : e));
      return scheduleSave();
    },

    // Ganti kredensial terenkripsi semua entri PENDING milik user (setelah
    // ganti password — kalau tidak, email terjadwal gagal AUTH).
    recredential(user, cred) {
      let changed = 0;
      entries = entries.map((e) => {
        if (e.status !== SEND_QUEUE_STATUS.PENDING || !sameUser(e.user, user)) return e;
        changed++;
        return { ...e, cred };
      });
      if (changed) scheduleSave();
      return changed;
    },

    // Hapus entry failed yang sudah lama (>= staleMs SEJAK GAGAL — bukan sejak
    // dibuat: email terjadwal 3 hari lalu yang gagal hari ini tetap disimpan).
    pruneStale(staleMs) {
      const cutoff = Date.now() - staleMs;
      entries = entries.filter((e) => !(e.status === SEND_QUEUE_STATUS.FAILED && (e.failedAt || e.createdAt) < cutoff));
      return scheduleSave();
    },
  };
}

// ── Logika murni (bisa diuji tanpa file) ──────────────────────────────────────
export function dueEntries(entries, now = Date.now()) {
  return entries.filter((e) => e.status === SEND_QUEUE_STATUS.PENDING && e.sendAt <= now);
}

export function pendingForUser(entries, user, now = Date.now()) {
  return entries
    .filter((e) => sameUser(e.user, user) && e.status === SEND_QUEUE_STATUS.PENDING)
    .map((e) => ({
      id: e.id,
      to: e.payload?.to || '',
      subject: e.payload?.subject || '',
      sendAt: e.sendAt,
      dueSoon: e.sendAt - now <= 60 * 1000, // due dalam <1 mnt → "segera"
    }));
}

/** Entri gagal milik user (agar UI bisa memberi tahu, bukan hilang diam-diam). */
export function failedForUser(entries, user) {
  return entries
    .filter((e) => sameUser(e.user, user) && e.status === SEND_QUEUE_STATUS.FAILED)
    .map((e) => ({
      id: e.id,
      to: e.payload?.to || '',
      subject: e.payload?.subject || '',
      failedAt: e.failedAt || e.createdAt,
    }));
}

export function isQueueOwner(entry, user) {
  return !!entry && sameUser(entry.user, user);
}

export function canCancel(entry, now = Date.now()) {
  return !!entry && entry.status === SEND_QUEUE_STATUS.PENDING && entry.sendAt > now;
}

export function buildQueueEntry({ user, sendAt, payload, cred, id, messageId = '' }) {
  return {
    id: id || crypto.randomUUID(),
    user,
    sendAt,
    createdAt: Date.now(),
    status: SEND_QUEUE_STATUS.PENDING,
    attempts: 0,
    cred,
    // Message-ID ditetapkan SAAT ANTRE dan dipakai ulang di setiap percobaan
    // flush — retry setelah kegagalan ambigu (server sudah menerima, respons
    // hilang) tidak lagi menghasilkan email "baru" dengan ID berbeda.
    messageId,
    payload: {
      // Header threading balasan ikut disimpan (dulu terbuang: kiriman via
      // antrean undo-send — yaitu hampir semua — kehilangan In-Reply-To).
      inReplyTo: payload.inReplyTo || '',
      references: payload.references || '',
      to: payload.to || '',
      cc: payload.cc || '',
      bcc: payload.bcc || '',
      subject: payload.subject || '',
      body: payload.body || '',
      isHTML: payload.isHTML !== false,
      from: payload.from || '',
      attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
    },
  };
}

// Batas horizon jadwal (default 7 hari ke depan).
export function maxScheduleMs(envValue) {
  const parsed = parseInt(envValue || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 7 * 24 * 60 * 60 * 1000;
}
