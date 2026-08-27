# Current Task

## 2026-08-27 — Audit keamanan pass 2: duplikat Cache-Control index.html

**Status:** selesai, live.

**Temuan:** index.html punya duplikat Cache-Control (`expires -1` → no-cache +
Expires vs add_header no-store). Fix: hapus `expires -1`. Verifikasi: satu
cache-control (no-store), webmail 200.
Status: COMPLETED
Updated At: 2026-08-27T02:48:30Z
