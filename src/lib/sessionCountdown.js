/**
 * Format sisa waktu sesi SMTP proxy dalam format MM:SS (≤59 menit) atau HH:MM:SS.
 * Negatif atau NaN → "0:00".
 */
export function formatRemaining(ms) {
  const total = Number(ms);
  if (!Number.isFinite(total) || total <= 0) return '0:00';
  const sec = Math.floor(total / 1000);
  const hours = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = sec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(mins)}:${pad(secs)}` : `${mins}:${pad(secs)}`;
}

/**
 * Tentukan kategori warning berdasarkan sisa sesi:
 *   'ok'     remainingMs > 5 menit  (tidak ditampilkan di UI)
 *   'warn'   1 menit < remainingMs ≤ 5 menit (warna amber)
 *   'urgent' remainingMs ≤ 1 menit (warna destructive + animate-pulse)
 *
 * Return null kalau tidak perlu ditampilkan (UI default sembunyiikan saat 'ok').
 */
export function sessionWarningLevel(remainingMs) {
  const total = Number(remainingMs);
  if (!Number.isFinite(total) || total <= 0) return 'urgent';
  if (total <= 60_000) return 'urgent';
  if (total <= 5 * 60_000) return 'warn';
  return 'ok';
}

/**
 * Ambang batas tampilkan countdown di header (menit). User melihat timer
 * hanya saat sesi tinggal < SHOW_BELOW_MINUTES menit.
 */
export const SHOW_BELOW_MINUTES = 15;
