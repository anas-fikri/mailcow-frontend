# Current Task

Status: COMPLETED
Task ID: 20260905-LOGIN-403-MSG
Updated At: 2026-09-05T00:00:00Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Improve webmail login error message agar 403 tidak selalu mengklaim "wajib ganti password".

## Result
- `src/lib/loginDiagnostics.js`: 3 titik rewording (fallback 403, PASSWORD_POLICY_MSG multi-kemungkinan + saran retry, hint CTA tanpa klaim flag). Trigger CTA: `password salah`.
- `scripts/test-login-diagnostics.mjs`: assertion baru + guard anti-regresi klaim lama.
- `scripts/test-mail-golden.mjs`: fixture renderDate kini dinamis (time-bomb tanggal diperbaiki).
- Suite **81/81 PASS**; build OK; deploy OK (`api-DsiEmxta.js` live, klaim lama 0 hit).

## Next
- (Opsional, belum dieksekusi) Immediate-sync hash `_sogo_static_view` di control-tower/server.js pasca reset password untuk menghilangkan window ≤5 menit total.
