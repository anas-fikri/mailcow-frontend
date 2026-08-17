/**
 * Hitung persentase progress bar dengan guard pembagian nol.
 * 0/0 dan max<=0 harus menghasilkan 0, bukan NaN/Infinity (yang membuat
 * lebar bar menjadi "NaN%" di UI).
 */
export function progressPercent(value, max) {
  if (!(max > 0)) return 0;
  const pct = Math.round((Number(value) / max) * 100);
  if (!Number.isFinite(pct)) return 0;
  return Math.min(100, Math.max(0, pct));
}
