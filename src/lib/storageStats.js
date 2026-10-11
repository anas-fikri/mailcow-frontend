// ─── Kartu "Penyimpanan" (StatsPage) — logika MURNI, teruji di Node ──────────
// fetchAllStats belum punya sumber data kuota server (MOCK_STORAGE = semua 0).
// Menampilkan "0% · 0/0 · 0 Mailboxes · 0 Domain" seolah-olah data nyata itu
// menyesatkan (QA 2026-10-11) → kartu memakai empty state bila data tidak ada.

const finiteNonNeg = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/**
 * True bila objek storage membawa data NYATA: kapasitas total > 0 (dengan
 * pemakaian terbaca), atau hitungan mailbox/domain > 0. Semua-nol, null,
 * atau nilai non-numerik = tidak tersedia.
 */
export function hasStorageData(storage) {
  if (!storage || typeof storage !== 'object') return false;
  const { used, total, mailboxes, domains } = storage;
  const hasCapacity = finiteNonNeg(total) && total > 0 && finiteNonNeg(used);
  const hasCounts = (finiteNonNeg(mailboxes) && mailboxes > 0) || (finiteNonNeg(domains) && domains > 0);
  return hasCapacity || hasCounts;
}
