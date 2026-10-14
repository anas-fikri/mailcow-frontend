---
status: accepted
date: 2026-08-17
---

# Round 9.6: sesi SOGo & hard-refresh logout

- **Decision (temuan):** `SOGoSessionTimeout` tidak diset → default SOGo 30 menit idle; sesi SOGo terikat cookie per-domain. Keduanya menyebabkan "hard refresh → logout" (403 → kick).
- **Decision (rekomendasi, menunggu konfirmasi):** set `SOGoSessionTimeout = 480` (8 jam) di sogo.conf + restart SOGo — aman & reversibel; alternatif: disiplin satu domain.
- **Reason:** Hard refresh sendiri tidak menghapus cookie; penyebab adalah sesi yang sudah mati (idle) atau domain berbeda dari sesi dibuat.

