// Rencana toolbar header daftar pesan (ala Outlook): SATU baris ikon yang
// tidak pernah wrap. Bila lebar header tidak cukup, ikon berprioritas rendah
// dipindah ke menu "Lainnya" (⋯) alih-alih menambah baris.

/** Urutan prioritas ikon opsional (paling penting dulu). */
export const TOOLBAR_OPTIONAL = ['unread', 'refresh', 'sort', 'attachment'];

// Ukuran tombol 44px (target sentuh) + gap 2px antar tombol.
export const TOOLBAR_SLOT_PX = 46;
// Lebar minimum yang disisakan utk judul folder + chip jumlah (judul truncate).
// ("Kotak Masuk" + chip "100 / 796" ≈ 170px pada lebar default list 340px.)
export const TITLE_MIN_PX = 170;
// Tombol hamburger (mobile) + gap.
export const HAMBURGER_PX = 52;

/**
 * @param {number} width       lebar konten header (px, tanpa padding)
 * @param {{ hamburger?: boolean, fixedSlots?: number }} [opts]
 *   fixedSlots = tombol yang selalu tampil (toggle percakapan + Lainnya [+ Terjadwal])
 * @returns {{ visible: string[], overflow: string[] }}
 *   visible  = ikon opsional yang tampil di toolbar (selain toggle percakapan
 *              & tombol Lainnya yang selalu tampil)
 *   overflow = ikon opsional yang dipindah ke menu Lainnya
 */
export function planToolbar(width, { hamburger = false, fixedSlots = 2 } = {}) {
  const w = Number(width);
  // Lebar belum terukur (mount awal/SSR) → tampilkan semua; ResizeObserver
  // segera mengoreksi sebelum frame berikutnya.
  if (!Number.isFinite(w) || w <= 0) return { visible: [...TOOLBAR_OPTIONAL], overflow: [] };
  const avail = w - TITLE_MIN_PX - (hamburger ? HAMBURGER_PX : 0);
  // +2: gap terakhir tidak dihitung; slot tetap dikurangkan.
  const slots = Math.floor((avail + 2) / TOOLBAR_SLOT_PX) - Math.max(0, Number(fixedSlots) || 0);
  const n = Math.max(0, Math.min(TOOLBAR_OPTIONAL.length, slots));
  return { visible: TOOLBAR_OPTIONAL.slice(0, n), overflow: TOOLBAR_OPTIONAL.slice(n) };
}

