# Current Task

Status: COMPLETED
Task ID: 20260820-131813-225244
Started At: 2026-08-20T13:18:13Z
Updated At: 2026-08-20T13:18:22Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Webmail: idle timeout SMTP 30→60 menit via SMTP_SESSION_IDLE_MIN (.env + service unit)

## Goal Link
Goal ID: G-001
Sub-goal ID: G-001 (webmail — usability/security trade-off)

## Files Involved
- configs/sogo-smtp-proxy.service — tambah Environment=SMTP_SESSION_IDLE_MIN=60 + komentar
- /home/anas.fikri/sogo-proxy/.env (server, runtime) — append SMTP_SESSION_IDLE_MIN=60

## Summary
User minta idle timeout SMTP dilonggarkan dari 30 → 60 menit agar user yang
baca email lama (tanpa aktivitas kirim) tidak logout mendadak. Trade-off
keamanan masih aman karena:
- TTL absolut tetap 8 jam (SMTP_SESSION_TTL_MIN=480) → sesi tidak menggantung
  selamanya walau idle.
- Sesuai dengan alasan user awal "8 jam tapi tetap aman".
- 60 mnt masih jauh dari baseline industri (mis. beberapa aplikasi web
  sentinel 2-4 jam).

Restart sogo-smtp-proxy dilakukan setelah rest .env:
- Probe via /proc/<PID>/environ menunjukkan SMTP_SESSION_IDLE_MIN=60 aktif
- Endpoint /api/auth/smtp POST dengan body invalid → 400 (Zod) — service
  hidup kembali dengan normal.

Tidak ada perubahan kode JavaScript — murni konfigurasi runtime via env var
yang sudah ada di server.js. Config di repo hanya untuk dokumentasi unit
template yang dipakai di tempat lain (atau rollback service unit).

## Risks
- Memory map smtpSessions di server: dengan idle 60m, lebih banyak sesi bisa
  hidup bersamaan untuk user yang baca email lama. Tetap dibatasi
  SESSION_MAX_PER_USER=10 (LRU eviction).
- Restart menjatuhkan sesi in-memory → semua user harus login ulang
  untuk mengirim email (baca email SOGo tidak terganggu).

## Validation
- 16/16 test PASS (frontend, tidak ada perubahan kode)
- ProcEnviron mengonfirmasi SMTP_SESSION_IDLE_MIN=60 aktif di PID baru
