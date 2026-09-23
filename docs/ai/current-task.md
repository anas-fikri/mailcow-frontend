# Current Task

Status: DONE (2026-09-23)
Task ID: 20260923-130000-deploy-sync
Started At: 2026-09-23T13:00:00Z
Updated At: 2026-09-23T14:30:00Z
Project Root: /Users/anasfikri/Documents/Projects/pcpexpress/mailcow/sogo-frontend

## Objective
Perbandingan workspace vs repo vs production + amankan deploy flow.

## Changes
- **deploy.sh** dirombak: build di server langsung dari GitLab (bukan lokal).
  `./deploy.sh` → SSH mailserver → git pull → npm ci → build → rsync → nginx reload.
  Aman: GitLab = source of truth, workspace bebas WIP, hasil deploy konsisten.
- Conflict resolved: keep tunnel fallback + runtime env config dari HEAD, tambah REMOTE_REPO_DIR.
- Workspace → GitLab synchronized (e17d29b).
- Production (1e9bb59) akan sync saat deploy.sh dijalankan.

## Temuan Penting
- **10 commits baru** di GitLab dari production rebuild hari ini: pratinjau lampiran
  (PDF/Word/Excel/PPT/ZIP/text), unduh per lampiran, cross-folder search.
- Production di-rebuild 23 Sep 16:52 WIB (build-version 1790157122393-raf8yk).
- Semua fitur sudah LIVE, belum pernah diverifikasi dari workspace.

## Next Steps
- Verifikasi live 10 fitur baru (pratinjau lampiran, cross-folder search).
- Jalankan `./deploy.sh` sekali utk konfirmasi flow GitLab-based bekerja.

## Validation
- bash -n deploy.sh ✅
- Git push ke origin/main ✅
- Branch fast-forward dari origin/main ✅