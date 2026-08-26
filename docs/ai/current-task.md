# Current Task

## Task: ai-loop performance & mobile — hot path render, swipe mobile, pola request

**Status: SELESAI (51/51 test PASS, build OK)** → siap commit + push + deploy.

## Temuan

1. **`getFlagColor` di hot path render per-baris (performa).** MailPage
   memanggil `getFlagColor` beberapa kali PER BARIS pesan (warna flag, filter,
   flag picker, count). Setiap pemanggilan → `getStore()` membaca + JSON.parse
   + normalisasi SELURUH store flag dari localStorage → 50+ baris × beberapa
   kali = puluhan baca/parse per render (jank saat scroll + hit GC).
2. **Swipe mobile membuka pesan sekaligus (bug UX).** SwipeableRow tidak
   menekan synthetic click browser setelah touchend → swipe-to-delete di HP
   MEMBUKA pesan yang sama persis sedang dijadwalkan hapus. Long-press sudah
   pakai suppressClick; swipe belum.
3. Diverifikasi aman: BottomNav `pb-16` di AppLayout (list tidak tertutup),
   polling unseen 60s wajar, `loadPrefs`/signatures tidak di hot path, cache
   React Query staleTime/refetchOnWindowFocus sudah baik.

## Perbaikan

1. **Cache in-memory di `src/lib/flagColors.js`** (`storeCache` Map per email):
   `getStore` hanya baca localStorage sekali per email; di-invalidate saat
   tulis (`setFlagColor`, `setFlagColorsBulk`, `clearAllFlags`). Tambah
   `__resetFlagColorCache()` (internal/test — storage diubah langsung dari
   luar). Semua pemanggilan `getFlagColor` beruntun utk key yang di-cache = 0
   baca localStorage (diverifikasi test dengan spy getItem).
2. **`onSwipe` di SwipeableRow** — dipanggil SEBELUM onSwipeLeft/Right saat
   threshold terlampaui. MailPage: `onSwipe={() => suppressClick.current.add(msg.uid)}`
   → synthetic click setelah swipe ditelan `handleRowClick` (pola sama dgn
   long-press).

## Verifikasi

- `test:flag-colors` diperluas: cache read-count (spy getItem = 0 utk
  getFlagColor beruntun setelah populate), reset cache antar skenario.
- `test:a11y` + 4 assertion statis: prop onSwipe + panggilan left/right +
  suppressClick di MailPage.
- **51/51 test PASS** · build OK.

Status: COMPLETED
Updated At: 2026-08-26T02:50:50Z
