---
id: T-5r4v
title: 'Pantau 1-2 mnt: /api/health + 401 dari /api/send; bump idle 90/120 mnt via .env bila perlu'
status: done
profile: standard
goal: G-001
created: "2026-08-20T13:35:21Z"
updated: "2026-08-20T13:35:46Z"
legacy:
  source: docs/ai/tasks/20260820-134013-202650.previous.md
  status: COMPLETED
  v1_id: 20260820-133521-293553
---

## Objective
Pantau 1-2 mnt: /api/health + 401 dari /api/send; bump idle 90/120 mnt via .env bila perlu

## Goal Link
Goal ID: G-001
Sub-goal ID: G-001 (webmail — operability)

## Files Involved
- server.js — log 401 send dgn counter + ip (no PII)
- scripts/monitor-smtp.sh — probe /api/health + count 401/registrations → exit 0/1/2

## Summary
Pengamatan sekarang (runtime):
- 55 registrations dalam 24 jam, 0 ssl 401 → idle 60 mnt cukup
- Bisa dipantau via ./scripts/monitor-smtp.sh (cron-friendly, JSON mode)
- Threshold WARNING>0.20, CRITICAL>0.50 (rasio 401/registrasi)

Cara jalan monitoring:
- Tambahkan ke crontab user yg punya SSH key deploy-mail:
  `*/15 * * * * /home/anas.fikri/mailcow-frontend/scripts/monitor-smtp.sh --json > /var/log/smtp-monitor.json 2>&1 || /home/anas.fikri/.ai-toolkit/bin/notify || true`

Prosedur naik idle jika terbukti kependekan:
  EXPECTED_SMTP_SESSION_IDLE_MIN=90 ./deploy.sh
  ssh deploy-mail 'systemctl --user restart sogo-smtp-proxy'
  (deploy.sh ensure_runtime_env idempotent — script handle .env otomatis)

## Risks
- SSH key required di host yg menjalankan cron — perlu setup satu kali
- Log 401 send mengandung IP bukan email/timestamp — minim PII

## Validation
- 18/18 test PASS
- bash -n deploy.sh + monitor-smtp.sh OK
- Monitor dijalankan lokal: Health 200, 0 401 → OK
