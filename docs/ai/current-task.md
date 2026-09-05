# Current Task

Status: COMPLETED
Task ID: 20260905-SOGO-IMMEDIATE-SYNC
Updated At: 2026-09-05T02:00:00Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Eliminate the 5-minute auth-broken window after password reset by syncing `_sogo_static_view` immediately in control-tower.

## Result
- `triggerSogoAuthSync()` fire-and-forget di `/opt/control-tower/server.js` (proxy `/api/v1/edit/mailbox`) + `mcp-server.js` (`edit_mailbox`) — menjalankan `/home/anas.fikri/sync_sogo_passwords.sh` (UPDATE JOIN hash + flush memcached kondisional, idempoten).
- E2E produksi: hash dipaksa bogus → reset via proxy → **MATCH +5s** (cron 257s jauh) → login password baru **200**. Journal membuktikan hook terpicu 3× (`changed=1`).
- Backup live files: `*.bak-sogosync-20260905-014225`; services `control-tower-api` + `control-tower-mcp` restarted, active.
- Diag2 dibersihkan (active=0, row auth dihapus, INBOX=0, flush memcached).

## Next
- Push commit docs dari repo ini ke GitLab saat jendela push berikutnya.
- (Opsional) Pantau keluhan user "harus ganti password" pasca reset — seharusnya hilang; jika muncul lagi, cek journal `[sogo-sync]` di server.
