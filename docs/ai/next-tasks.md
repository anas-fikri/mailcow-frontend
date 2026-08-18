# Suggested Next Tasks

Project: sogo-frontend
Generated At: 2026-08-18T13:35:00Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Browser smoke test — visual verification
- Why: Bug hunt loop fix belum diverifikasi di browser (pagination reset, focusIdx clamp, quick reply validation). Hard refresh perlu di production utk clear cache.
- Action: hard refresh https://mail.pcpexpress.co.id/webmail/ → test ganti folder, keyboard nav, quick reply tanpa From.

## 2. [MEDIUM] SOGo session timeout — konfigurasi 8 jam
- Why: SOGoSessionTimeout belum diset → default 30 menit idle → hard refresh = logout. User diminta konfirmasi set 480 (8 jam).
- Source: handoff.md entry 2026-08-17 (Round 9.6)

## 3. [LOW] Migration portal systemd unit — kembalikan ke imapsync-migrate
- Why: Unit systemd masih menunjuk migration-portal (salah) → crash-loop. Butuh sudo utk perbaiki.
- Source: handoff.md entry 2026-08-18

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
