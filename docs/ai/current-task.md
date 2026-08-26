# Current Task

## Task: Ukur dampak cache flagColors (benchmark A/B)

**Status: SELESAI — pengukuran kuantitatif, live build terverifikasi.**

## Konteks
Fix sebelumnya (commit `0a17d12`): `getFlagColor` di hot path render MailPage
(per-baris × per-render) membaca + parse + normalisasi seluruh store flag dari
localStorage utk SETIAP pemanggilan → cache in-memory per email (invalidate
saat tulis).

## Pengukuran (`npm run bench:flag-cache`)

Benchmark memakai modul asli `flagColors.js` (bukan simulasi) — pola hot path
MailPage: N baris × k lookup getFlagColor per baris × banyak siklus (frame
scroll), data realistis (10% pesan berflag, 5 warna).

| Skenario | SEBELUM | SESUDAH | Hemat waktu | Baca localStorage |
|---|---|---|---|---|
| 50 baris × 2 × 120 siklus (12k panggilan) | 8.5 ms / 120 baca | 3.2 ms / **1 baca** | **62–78%** | **99%** |
| 100 baris × 3 × 60 siklus (18k) | 2.3 ms / 60 baca | 0.9 ms / 1 baca | **58–68%** | **98%** |
| 200 baris × 2 × 60 siklus (24k) | 9.0 ms / 60 baca | 1.4 ms / 1 baca | **58–84%** | **98%** |

- Konsisten di 3 run: **58–84% waktu** dan **98–99% baca localStorage**
  berkurang (baca localStorage = baca sinkron di main thread + JSON.parse +
  normalisasi; di browser biayanya lebih besar lagi karena IPC + GC).
- Satu siklus render tipikal (50 baris): SEBELUM = 1 baca + parse per siklus
  (baca sinkron di main thread, bisa setengah frame budget 16.7ms di browser
  dengan store besar), SESUDAH = 0.

## Catatan metodologi
- Benchmark CPU-side Node (modul asli, data realistis) — TIDAK bisa buka
  inbox live (butuh kredensial user; sandbox tidak punya browser login).
- Perbandingan jank scroll browser end-to-end memerlukan sesi login asli —
  disarankan verifikasi manual di produksi (lihat handoff).

Status: COMPLETED
Updated At: 2026-08-26T03:3x:00Z
