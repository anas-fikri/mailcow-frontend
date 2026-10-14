---
status: accepted
date: 2026-08-17
---

# Round 5 bug hunt decisions

- **Decision (rate limiter):** scope setiap rate-limit bucket per route (`${clientIp}|${method} ${path}`), bukan hanya per IP. Semua `/api/*` sebelumnya berbagi satu bucket per IP, sehingga batas 5/menit `/api/auth/smtp` ikut memblokir `/api/send` dan `/api/preferences`.
- **Decision (password generator):** indeks acak Fisher-Yates harus berasal dari `Uint32Array` yang sama (`array[i]`), bukan `array[i+4]` yang melewati ujung buffer → NaN index menghilangkan karakter password.
- **Decision (stats):** jangan pernah menampilkan nilai mock sebagai data nyata. Fallback `|| 540/180/4/546` diganti `?? 0`; ProgressBar guard `max > 0` agar pct tidak NaN.
- **Decision (UI debug):** semua state debug (mis. `debugVal` Vacation) harus dibuang sebelum produksi — konsisten dengan kebijakan log DEV-only dari audit Round 1.

