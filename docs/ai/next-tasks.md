# Suggested Next Tasks

Project: sogo-frontend
Generated At: 2026-09-23T14:30:00Z

## 1. [MEDIUM] Verifikasi 10 fitur baru yang sudah LIVE di production
- Why: Production memiliki 10 commits baru dari rebuild hari ini (pratinjau lampiran
  PDF/Word/Excel/PPT/ZIP/text, unduh per lampiran, cross-folder search).
  Source code ada di GitLab tapi belum diverifikasi dari workspace.
- Source: current-task.md

## 2. [LOW] Jalankan `./deploy.sh` untuk konfirmasi flow GitLab-based
- Why: deploy.sh sudah diubah untuk build di server dari GitLab.
  Perlu test run sekali untuk verifikasi SSH + npm ci + build + rsync jalan.

## 3. [LOW] Update docs/ai konteks dengan 10 fitur baru
- Why: application-map.md, goals.md, knowledge.md belum mencakup fitur
  pratinjau lampiran dan cross-folder search.