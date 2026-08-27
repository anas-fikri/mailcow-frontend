# Current Task

## 2026-08-27 — Fix: PageLoader "Memuat..." tidak center (muncul di atas)

**Masalah:** Saat berpindah halaman, animasi loading "Memuat..." tampil di bagian atas, bukan di tengah viewport.

**Akar masalah:** `PageLoader` memakai `h-full`, tapi parent-nya (Suspense/Routes di `App.jsx`) **tidak memiliki tinggi** → `h-full` collapse ke tinggi konten → spinner & teks tampil di tengah div kecil yang menempel di atas.

**Fix (`src/App.jsx`):**
- `PageLoader` diubah dari `h-full` → `min-h-screen` agar selalu setinggi viewport, jadi spinner + teks benar-benar di tengah layar.
- Diperiksa loading state lain (MailPage skeleton, MessageReader, Calendar) — semuanya berada dalam parent ber-tinggi (`AppLayout flex-1` + wrapper `h-full`), jadi aman, tidak diubah.

**Status:** ✅ selesai, build OK, 57/57 PASS. Commit + push + deploy menyusul.
Status: COMPLETED
Updated At: 2026-08-27T03:05:57Z
