# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-09-02T15:20:42Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [HIGH] Push 33 commits ke GitLab saat tunnel wg0 hidup

- Why: Semua fitur freshness (auto-refresh 3062618, cross-tab sync 4a1e606) sudah LIVE di produksi, tapi `main` ahead 33 commits tanpa divergensi — risiko kehilangan kerja lokal & teman tim tidak melihat perubahan. `git push origin main` cukup; tidak perlu rebase.
- Evidence: knowledge.md 2026-09-02 (rute wg0 down, TCP 22/443 filtered); handoff.md delivery notes; `git status -sb` = `ahead 33`.
- Blocker: tunnel WireGuard `wg0` ke subnet `115.178.128.128/27` harus hidup dulu (hubungi admin jaringan bila perlu).
- Prasyarat selesai: regresi 75/75 PASS, deploy 2x LIVE, docs ai-toolkit tersinkron (ai-state, goals, handoff, knowledge).

## 2. [LOW] Tambah bump crossTab di saveDraft/deleteDraft

- Why: Mutasi draft (10s): semua fungsi mutasi mailbox lain sudah bump versi domain 'mail' setelah sukses — kecuali `saveDraft`/`deleteDraft` (src/lib/api.js line ~888/939). Akibatnya folder Drafts di tab lain basi sampai poll 60s berikutnya. Gap kecil, satu baris per fungsi + extend test-mail-crosstab.mjs.
- Evidence: grep bumpMailVersion di api.js (12 call site) vs fungsi draft; gap terverifikasi 2026-09-02.
- Catatan: bump di layer api.js mengikuti kontrak yang sama (hanya setelah res.ok / sukses).

## 3. [LOW] Pertimbangkan menurunkan poll unseen 60s → 30s

- Why: Latensi email baru muncul otomatis = interval poll unseen (60s). 30s mempercepat separuh, dengan trade-off request volume 2x ke SOGo `/view` (sudah ringan — metadata unseen saja). Jalankan hanya jika user minta lebih real-time; deploy mudah via jalur yang sama.
- Evidence: MailPage STALE_TIMES.UNSEEN = 60_000; knowledge.md auto-refresh contract (badge = detektor, list mengikuti).

## 4. [LOW] Uji manual multi-tab di produksi

- Why: Cross-tab sync sudah tervalidasi via unit test (test-mail-crosstab.mjs) + deploy smoke test, tapi belum ada verifikasi manual 2-tab di produksi. Cukup 5 menit: buka 2 tab webmail, hapus/pindah/tandai email di tab A → pastikan tab B refresh daftar + badge.
- Evidence: goals.md G-001.S-011 (deployed LIVE); handoff.md 2026-09-02.
- Catatan: bila ditemukan masalah, periksa dulu apakah storage event fire di browser terkait (lihat knowledge: watcher pattern).

## 5. [INFO] Pantau status tunnel wg0 (opsional otomasi)

- Why: Push tertahan sejak 2026-09-02 ~14:00 UTC. Bila sering terjadi, pertimbangkan cron health-check wg0 + notifikasi (pola sama dengan monitor-smtp.sh yang sudah ada di scripts/) agar push tidak tertunda tanpa disadari.
- Evidence: knowledge.md 2026-09-02 — GitLab unreachable via WireGuard policy routing; scripts/monitor-smtp.sh sebagai pola referensi.
- Catatan: JANGAN hapus rute wg0 permanen — routing via VPN kemungkinan disengaja (GitLab internal).

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
