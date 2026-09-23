# Project Knowledge Log

Record durable findings discovered during completed tasks. Include codebase,
architecture, infrastructure, CI/CD, deployment, operations, constraints,
bugs, and validation knowledge. Do not record secrets or transient debug logs.

## 2026-09-23 — deploy.sh server-side build dari GitLab

- **Problem:** deploy.sh lama build dari dist/ lokal → production bisa beda dari GitLab
  kalau workspace punya WIP atau tidak sinkron.
- **Fix:** Build DI SERVER langsung. `./deploy.sh` → SSH mailserver → git pull dari
  GitLab → npm ci → npm run build → rsync ke nginx web dir → nginx reload.
  GitLab jadi single source of truth. Deploy dari mana saja hasilnya identik.
- **Safety:** workspace bebas WIP tanpa ganggu production. Local dist/ tidak lagi
  dipakai untuk deploy.
- **First run:** mailserver akan git clone pertama kali jika repo belum ada.
- **Prasyarat:** mailserver perlu: nodejs, npm, git, akses ke gitlab.pcpexpress.com.
  Sudah diverifikasi: node v18.19.1, npm 9.2.0, git tersedia.

## 2026-09-23 — Production di-rebuild dari luar git (10 commits baru)

- **Temuan:** Antara 19 Agu dan 23 Sep, ada 10 commits baru di GitLab origin/main
  yang tidak ada di workspace. Build-version production `1790157122393-raf8yk`
  (23 Sep 16:52 WIB). Tidak ada aktivitas git di repo ini dari workspace -
  berarti rebuild dilakukan dari machine lain (mungkin server atau laptop lain).
- **Fitur baru:** pratinjau lampiran in-app (PDF, Word, Excel/CSV, PPT, ZIP, teks),
  unduh per lampiran, filter gambar body dari daftar lampiran, cross-folder search
  dengan smart empty states.
- **Lesson:** Selalu `git fetch` + `git log origin/main` sebelum mulai kerja.
  Production bisa saja di-rebuild dari mana saja.
- **Status sekarang:** Workspace = GitLab (e17d29b). Production tertinggal 1 commit
  (deploy.sh fix) — akan catch up saat deploy.sh dijalankan.

## Entries (sebelumnya)

## 2026-08-18 — React #310 ROOT CAUSE: useRef after early return

- **Root cause sebenarnya:** ...