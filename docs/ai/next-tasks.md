# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-09-03T14:10:00Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [HIGH] Push 42 commits ke GitLab saat tunnel wg0 stabil

- Why: Semua fitur (freshness, cross-tab sync penuh termasuk Drafts, fix moveMessages 500, pesan login) sudah LIVE di produksi, tapi `main` ahead 42 commits. `git fetch` sempat sukses 2026-09-03 (tunnel sempat hidup) namun push timeout — tunnel flapping.
- Evidence: handoff.md 2026-09-03T13:40 (push timeout 135s, ping 100% loss); `git rev-list --count origin/main..main` = 42.
- Action: saat jaringan kantor stabil, cukup `git push origin main` (tanpa divergensi).

## 2. [LOW] Pertimbangkan menurunkan poll unseen 60s → 30s

- Why: Latensi email baru muncul otomatis = interval poll unseen (60s). 30s mempercepat separuh, trade-off request 2x ke SOGo `/view` (ringan — metadata unseen saja). Jalankan hanya jika user minta lebih real-time.
- Evidence: MailPage STALE_TIMES.UNSEEN = 60_000; knowledge.md auto-refresh contract (badge = detektor, list mengikuti).

## 3. [LOW] Uji manual multi-tab di produksi (termasuk folder Drafts)

- Why: Cross-tab sync tervalidasi unit test (test-mail-crosstab.mjs kini mencakup saveDraft/deleteDraft) + deploy smoke test, tapi belum ada verifikasi manual 2-tab. Cukup 5 menit: buka 2 tab webmail, hapus/pindah/tandai/simpan-draft di tab A → pastikan tab B refresh daftar + badge.
- Evidence: goals.md G-001.S-011; commit 6ca0b6c (drafts crossTab, deployed + served chunk terverifikasi).
- Catatan: bila ditemukan masalah, periksa dulu apakah storage event fire di browser terkait (lihat knowledge: watcher pattern).

## 4. [INFO] Pantau status tunnel wg0 (opsional otomasi)

- Why: Push tertahan sejak 2026-09-02 ~14:00 UTC; tunnel terbukti flapping (fetch sukses → push timeout dalam 1 jam yang sama). Bila berlanjut, pertimbangkan cron health-check wg0 + notifikasi (pola monitor-smtp.sh).
- Evidence: handoff.md 2026-09-03; scripts/monitor-smtp.sh sebagai pola referensi.
- Catatan: JANGAN hapus rute wg0 permanen — routing via VPN kemungkinan disengaja (GitLab internal).

## Selesai sejak generate sebelumnya (riwayat)

- ~~Tambah bump crossTab di saveDraft/deleteDraft~~ → DONE commit `6ca0b6c`, deployed 2026-09-03, test-mail-crosstab diperluas (bump sukses + gagal tidak bump), 76/76 regression PASS.
- ~~Fix 500 "Cannot copy messages to other account"~~ → DONE commit `c320f20` (destination `/0/folderX`), dibuktikan live via replay alur aturan di server.
- ~~Fix pesan login menyesatkan (force_pw_update)~~ → DONE commit `a6b0142`; 79 flag di-clear.

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:
