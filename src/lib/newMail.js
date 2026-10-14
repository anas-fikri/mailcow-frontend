// ─── Deteksi "email baru" di Kotak Masuk ─────────────────────────────────────
// Logika murni agar bisa diuji Node.
//
// BUG LAMA (2026-10-14): "email baru" = unseenCount naik. Padahal unseen juga
// naik saat user MENANDAI BELUM DIBACA (di tab ini, tab lain, Outlook, HP) atau
// saat satu poll gagal (dikembalikan 0) lalu poll berikutnya normal → notifikasi
// & toast palsu, berisi pengirim email TERATAS daftar (bukan email baru).
//
// SEKARANG: email baru = UID tertinggi Kotak Masuk NAIK (IMAP menjamin UID
// pesan yang masuk selalu lebih besar dari semua UID sebelumnya) DAN unseen
// naik (pesan baru itu memang belum dibaca). Tandai-belum-dibaca / poll gagal
// tidak mengubah UID tertinggi → tidak pernah memicu notifikasi.

/** UID tertinggi dari array `uids` respons SOGo /view; null bila tak tersedia. */
export function maxUidOf(uids) {
  if (!Array.isArray(uids) || uids.length === 0) return null;
  let max = null;
  for (const u of uids) {
    const n = typeof u === 'number' ? u : parseInt(String(u), 10);
    if (Number.isFinite(n) && n > 0 && (max === null || n > max)) max = n;
  }
  return max;
}

/**
 * @param {object} p
 * @param {number|null} p.prevUnseen
 * @param {number}      p.unseen
 * @param {number|null} p.prevMaxUid
 * @param {number|null} p.maxUid
 * @returns {boolean} true hanya bila benar-benar ada email baru masuk.
 */
export function isNewMailArrival({ prevUnseen, unseen, prevMaxUid, maxUid }) {
  if (prevUnseen === null || prevUnseen === undefined) return false;
  if (!(unseen > prevUnseen)) return false;
  if (maxUid === null || maxUid === undefined || prevMaxUid === null || prevMaxUid === undefined) return false;
  return maxUid > prevMaxUid;
}

/**
 * Pilih pesan yang benar-benar baru (UID > prevMaxUid) utk isi notifikasi.
 * null → pakai teks umum ("Email baru di Kotak Masuk"), JANGAN pengirim lama.
 */
export function pickNewestArrival(messages, prevMaxUid) {
  if (!Array.isArray(messages) || prevMaxUid === null || prevMaxUid === undefined) return null;
  let best = null;
  for (const m of messages) {
    const n = parseInt(String(m?.uid), 10);
    if (!Number.isFinite(n) || n <= prevMaxUid) continue;
    if (!best || n > parseInt(String(best.uid), 10)) best = m;
  }
  return best;
}
