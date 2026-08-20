# Current Task

Status: COMPLETED
Task ID: 20260820-132742-138659
Started At: 2026-08-20T13:27:42Z
Updated At: 2026-08-20T13:27:52Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
deploy.sh: ensure_runtime_env idempotent utk SMTP_SESSION_IDLE_MIN (.env di server)

## Goal Link
Goal ID: G-001
Sub-goal ID: G-001 (webmail — operations)

## Files Involved
- deploy.sh — tambah helper ensure_runtime_env() + panggil di deploy_backend()
- package.json — npm run test:deploy-runtime-env
- scripts/test-deploy-runtime-env.sh — 5 skenario bash test (mocks ssh via tmp dir)

## Summary
Tanpa helper ini, deploy-selanjutnya bisa lupa menyetel SMTP_SESSION_IDLE_MIN di
.env server (atau lupa saat menambah config kritikal lainnya). Helper baru:
- Baca nilai sekarang via `ssh ... awk -F= -v k=K '$1==k {...}' PATH`
- Jika hilang → `printf 'K=V\n' >> PATH`
- Jika beda  → `sed -i.bak '/^K=/d' PATH && printf 'K=V\n' >> PATH`
- Jika sama  → no-op

EXPECTED_SMTP_SESSION_IDLE_MIN=60 di top-of-file (override via env).
Dipanggil di awal deploy_backend() — berjalan walaupun kode backend tidak
berubah (TETAPI restart service TIDAK terjadi otomatis; hanya ketika
server.js / src/lib berubah, sesuai logika md5-hash existing).

## Verifikasi live (no deploy needed)
Smoke test via ssh ke server (dgn backup/rollback):
- `awk -F= -v k=SMTP_SESSION_IDLE_MIN '$1==k {...}' .env` → "60"
- ensure_runtime_env flow: no-op idempotent ✓
- `sed -i.bak '/^K=/d' PATH && printf 'K=V\n' >> PATH` menghasilkan
  baris yang benar (rollback sukses dari .bak)

## Risks
- deploy mengirim beberapa ssh call tambahan ke server. Tidak restart
  service untuk perubahan .env saja — restart tetap hanya pada kode
  berubah. Tidak menambah downtime.
- Mock ssh di test adalah abstraksi; smoke test aktual sudah
  memverifikasi pola remote bekerja. Kombinasi test+c-smoke memberi
  keyakinan penuh.

## Validation
- 17/17 test PASS (baru test:deploy-runtime-env, 5 skenario)
- deploy.sh `bash -n` syntax OK
- npm run build OK
- ssh smoke test live PASS
