/**
 * sentCopy — simpan salinan email terkirim ke folder Sent (IMAP APPEND).
 *
 * Latar (round-59): seluruh jalur kirim webmail melalui SMTP proxy
 * (/api/send → nodemailer → postfix). Jalur ini TIDAK membuat salinan Sent —
 * berbeda dari alur native SOGo yang otomatis men-APPEND ke Sent setelah kirim.
 * Akibatnya email "terkirim" tidak pernah muncul di folder Sent, sementara
 * draft sisa (flag \Draft) yang dibersihkan user berakhir di Trash — terbaca
 * user sbg "email terkirim masuk Trash, bukan Sent".
 *
 * Solusi: server menyusun pesan RFC822 yang PERSIS sama dgn yang dikirim
 * (Message-ID & Date diset eksplisit di kedua sisi agar threading client
 * tetap benar), lalu IMAP APPEND ke folder Sent dgn flag \Seen.
 *
 * Kontrak penting:
 * - appendSentCopy TIDAK PERNAH melempar error — kegagalan sent-copy TIDAK
 *   BOLEH menggagalkan pengiriman (email tetap terkirim walau copy gagal).
 * - ImapFlow di-import lazy (dynamic import) + bisa di-inject via deps utk
 *   test tanpa dependensi nyata.
 * - Kandidat folder dicocokkan case-insensitive dgn hasil IMAP LIST; folder
 *   pertama yang ada yang dipakai.
 */
import crypto from 'node:crypto';

// Urutan kandidat folder Sent. Dipakai kalau server.js tidak mengirim
// daftarnya sendiri (env IMAP_SENT_MAILBOXES).
export const SENT_MAILBOX_CANDIDATES = ['Sent', 'INBOX/Sent', 'Sent Messages'];

/**
 * Message-ID deterministik utk satu pengiriman — dipakai persis sama oleh
 * pesan yang terkirim (nodemailer) dan salinan di Sent (mail-composer).
 */
export function makeMessageId(user) {
  const domain = String(user || '').split('@')[1] || 'localhost';
  return `<${crypto.randomUUID()}@${domain}>`;
}

function injectBccHeader(raw, bcc) {
  if (!bcc) return raw;
  const value = Array.isArray(bcc) ? bcc.join(', ') : String(bcc);
  const idx = raw.indexOf('\r\n\r\n');
  if (idx === -1) return raw;
  // sisipkan sbg baris header terakhir (sebelum blok body)
  return Buffer.concat([
    raw.subarray(0, idx),
    Buffer.from(`\r\nBcc: ${value}`, 'utf8'),
    raw.subarray(idx),
  ]);
}

/**
 * Susun pesan RFC822 (Buffer) dari mail-options nodemailer — UNTUK SALINAN SENT.
 * - mailOptions.messageId / date eksplisit akan tertulis sbg header (identik
 *   dgn pesan yang terkirim — threading client tetap benar).
 * - Bcc: MailComposer/MimeNode selalu men-strip header Bcc (keepBcc tidak
 *   diteruskan), padahal salinan Sent standarnya MEMUAT Bcc (pola Gmail/SOGo).
 *   Header Bcc disisipkan kembali di sini, hanya di salinan ini — pesan yang
 *   DIKIRIM tetap membawa bcc hanya di envelope (anti-bocor).
 * deps.MailComposer utk injeksi di test (default: nodemailer/lib/mail-composer).
 */
export async function buildSentRaw(mailOptions, deps = {}) {
  const MailComposer = deps.MailComposer
    || (await import('nodemailer/lib/mail-composer/index.js')).default;
  const composer = new MailComposer({ ...mailOptions });
  const node = composer.compile();
  const raw = await node.build(); // Promise<Buffer> di nodemailer 9
  return injectBccHeader(raw, mailOptions.bcc);
}

/**
 * APPEND salinan ke folder Sent milik `user`.
 * Selalu resolve { ok: boolean, ... } — tidak pernah reject.
 *
 * opts: { user, pass, raw (Buffer), host, port, secure, mailboxes? }
 * deps: { ImapFlow? } — injeksi utk test.
 */
export async function appendSentCopy(opts, deps = {}) {
  const {
    user, pass, raw,
    host, port = 993, secure = true,
    mailboxes = SENT_MAILBOX_CANDIDATES,
  } = opts || {};

  if (!user || !pass || !host || !Buffer.isBuffer(raw)) {
    return { ok: false, error: 'Parameter sent-copy tidak lengkap.' };
  }

  const candidates = (Array.isArray(mailboxes) ? mailboxes : SENT_MAILBOX_CANDIDATES)
    .map((s) => String(s).trim()).filter(Boolean);

  let client = null;
  try {
    const ImapFlow = deps.ImapFlow || (await import('imapflow')).default;
    client = new ImapFlow({
      host,
      port,
      secure,
      auth: { user, pass },
      logger: false,
      tls: { rejectUnauthorized: false }, // sertifikat mailcow internal
    });
    await client.connect();

    const list = await client.list();
    let target = null;
    for (const cand of candidates) {
      const found = (list || []).find(
        (mb) => String(mb?.path || '').toLowerCase() === cand.toLowerCase(),
      );
      if (found) { target = found.path; break; }
    }
    if (!target) {
      return { ok: false, error: `Folder Sent tidak ditemukan (${candidates.join(', ')})` };
    }

    const res = await client.append(target, raw, { flags: ['\\Seen'] });
    if (!res) return { ok: false, error: `APPEND ke ${target} tidak dikonfirmasi.` };
    return { ok: true, mailbox: target, uid: res.uid };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  } finally {
    if (client) {
      try { await client.logout(); } catch { /* koneksi mungkin sudah mati */ }
      try { client.close(); } catch { /* noop */ }
    }
  }
}
