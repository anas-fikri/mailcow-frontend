# Current Task

Status: COMPLETED
Task ID: 20260906-E2E-REPLY-SCHED
Updated At: 2026-09-06T14:40:41Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Tambah browser E2E untuk alur reply-with-attachment dan scheduled send (+undo).

## Result
- `scripts/e2e-reply-attach-browser.mjs` (scenario `reply`): kirim induk →
  reader → Balas (quote + Re:) → lampir PNG → kirim → balasan tiba dengan
  lampiran ter-render → cleanup. PASS produksi.
- `scripts/e2e-scheduled-send-browser.mjs` (scenario `sched`): jadwalkan
  +2 mnt → toast countdown → badge Terjadwal → panel (server truth) →
  Batalkan → entry hilang → email tidak tiba. PASS produksi.
- Runner kini 10 skenario (`all`). Kedua E2E PASS berulang; unit suite 85/85.
- Insight produk: kirim ber-lampiran/jadwal lewat proxy → queue undo 3 menit
  sebelum flush (tiba ±3,5 menit) — by design, terdokumentasi di handoff.

## Next
- Opsional: kunci flake `spaced` (1x gagal di batch, PASS mandiri) dengan
  retry-if-flake di runner.
