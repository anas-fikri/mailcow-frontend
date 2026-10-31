// Logika seleksi daftar pesan ala Outlook desktop — murni (tanpa React/DOM)
// supaya bisa diuji di Node. Dipakai MailPage untuk klik baris, Ctrl/Cmd+klik,
// Shift+klik, navigasi fokus keyboard, dan penentuan target aksi.
//
// Istilah:
// - `selected`  : daftar uid yang dipilih eksplisit (multi-select → toolbar bulk).
// - `anchor`    : uid jangkar utk Shift+klik (baris terakhir yang diklik).
// - `current`   : uid yang sedang terbuka/fokus (seleksi implisit tunggal).
// - `order`     : urutan uid sebagaimana TAMPIL di daftar (dipakai range).

const same = (a, b) => String(a) === String(b);

/** Toggle satu uid di daftar (immutable). */
export function toggleUid(list, uid) {
  const arr = Array.isArray(list) ? list : [];
  return arr.some((u) => same(u, uid)) ? arr.filter((u) => !same(u, uid)) : [...arr, uid];
}

/** Gabungan dua daftar uid tanpa duplikat, urutan `a` lalu tambahan dari `b`. */
export function unionUids(a, b) {
  const out = [...(Array.isArray(a) ? a : [])];
  const seen = new Set(out.map(String));
  for (const u of Array.isArray(b) ? b : []) {
    if (!seen.has(String(u))) { seen.add(String(u)); out.push(u); }
  }
  return out;
}

/** Buang sekumpulan uid dari daftar. */
export function removeUids(list, uids) {
  const drop = new Set((Array.isArray(uids) ? uids : []).map(String));
  return (Array.isArray(list) ? list : []).filter((u) => !drop.has(String(u)));
}

/**
 * Irisan `order` antara dua uid (inklusif, arah bebas). Bila salah satu tidak
 * ada di `order`, kembalikan [uidB] saja (fallback aman).
 */
export function rangeBetween(order, uidA, uidB) {
  const list = Array.isArray(order) ? order : [];
  const a = list.findIndex((u) => same(u, uidA));
  const b = list.findIndex((u) => same(u, uidB));
  if (a === -1 || b === -1) return [uidB];
  const [from, to] = a < b ? [a, b] : [b, a];
  return list.slice(from, to + 1);
}

/**
 * Resolusi klik pada BARIS pesan (bukan checkbox) — pola Outlook:
 * - klik biasa      : buka pesan; seleksi multi dibersihkan; jadi anchor.
 * - Ctrl/Cmd+klik   : toggle ke seleksi multi (pesan yang sedang terbuka ikut
 *                     masuk bila seleksi masih kosong — seperti Outlook);
 *                     tidak membuka pesan.
 * - Shift+klik      : pilih rentang anchor→uid (ganti seleksi); dengan Ctrl
 *                     juga ditahan → rentang ditambahkan ke seleksi yang ada.
 *
 * @returns {{ selected: Array, anchor: any, open: any|null }}
 */
export function resolveRowClick(state, uid, mods = {}, order = []) {
  const selected = Array.isArray(state?.selected) ? state.selected : [];
  const anchor = state?.anchor ?? null;
  const current = state?.current ?? null;
  const ctrl = !!(mods.ctrl || mods.meta);
  const shift = !!mods.shift;

  if (shift) {
    const base = anchor ?? current;
    if (base == null) return { selected: [uid], anchor: uid, open: null };
    const range = rangeBetween(order, base, uid);
    return {
      selected: ctrl ? unionUids(selected, range) : range,
      anchor: base,
      open: null,
    };
  }

  if (ctrl) {
    const seed = selected.length === 0 && current != null && !same(current, uid) ? [current] : selected;
    return { selected: toggleUid(seed, uid), anchor: uid, open: null };
  }

  return { selected: [], anchor: uid, open: uid };
}

/**
 * Target aksi keyboard/menu: seleksi multi bila ada, kalau tidak pesan yang
 * fokus/terbuka. Selalu array (bisa kosong).
 */
export function resolveTargetUids({ selected, focusedUid, openUid } = {}) {
  if (Array.isArray(selected) && selected.length > 0) return [...selected];
  const single = focusedUid ?? openUid ?? null;
  return single == null ? [] : [single];
}

/**
 * Indeks fokus berikutnya utk navigasi keyboard.
 * @param {number} current  indeks sekarang (-1 = belum ada)
 * @param {number|'home'|'end'} step  ±1 (atau lompat)
 * @param {number} length   jumlah baris
 * @param {number} [fallback] indeks awal bila current -1 (mis. indeks pesan terbuka)
 */
export function nextFocusIndex(current, step, length, fallback = -1) {
  if (!length || length <= 0) return -1;
  if (step === 'home') return 0;
  if (step === 'end') return length - 1;
  const base = current >= 0 ? current : fallback;
  if (base < 0) return step > 0 ? 0 : length - 1;
  return Math.min(length - 1, Math.max(0, base + step));
}

/** Toggle pilih-semua: bila semua sudah terpilih → kosongkan, selain itu pilih semua. */
export function toggleSelectAllUids(selected, visibleUids) {
  const vis = Array.isArray(visibleUids) ? visibleUids : [];
  const sel = new Set((Array.isArray(selected) ? selected : []).map(String));
  const allSelected = vis.length > 0 && vis.every((u) => sel.has(String(u)));
  return allSelected ? [] : [...vis];
}

/**
 * Pesan berikutnya yang dibuka setelah sekumpulan uid dihapus/dipindah
 * (auto-advance ala Outlook): berikutnya setelah posisi terakhir yang hilang,
 * fallback ke sebelumnya, null bila tidak ada.
 */
export function nextAfterRemoval(order, removedUids, currentUid) {
  const list = Array.isArray(order) ? order : [];
  const removed = new Set((Array.isArray(removedUids) ? removedUids : []).map(String));
  if (currentUid == null || !removed.has(String(currentUid))) return currentUid ?? null;
  const idx = list.findIndex((u) => same(u, currentUid));
  if (idx === -1) return null;
  for (let i = idx + 1; i < list.length; i++) if (!removed.has(String(list[i]))) return list[i];
  for (let i = idx - 1; i >= 0; i--) if (!removed.has(String(list[i]))) return list[i];
  return null;
}
