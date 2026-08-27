# Current Task

## 2026-08-27 — Fix PageLoader: spinner "Memuat..." tidak center vertikal

**Masalah:** PageLoader (Suspense fallback) pakai `h-full w-full`, tapi parent-nya
(Suspense/Routes) TIDAK punya tinggi sendiri → h-full collapse ke tinggi konten →
spinner + "Memuat..." tampil di div kecil yang menempel ke ATAS viewport (center
horizontal, bukan center penuh).

**Fix:** `h-full` → `min-h-screen` di src/App.jsx PageLoader — memaksa setinggi
viewport sehingga spinner benar-benar di tengah layar. Skeleton lain (MailPage/
MessageReader/Calendar) aman — berada dalam parent ber-tinggi (AppLayout flex-1
+ wrapper h-full).

**Test:** 57/57 PASS · build OK.
