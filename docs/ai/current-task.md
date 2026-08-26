# Current Task

## Status: SELESAI ✅

**Ai-loop rotasi bulk actions & undo-delete — 1 bug data-kritis diperbaiki**

### Bug — Undo-delete timer fire setelah pindah folder → pesan SALAH terhapus
`scheduleDelete` menunda move-to-trash 6 detik (undo window). Timer bisa fire
SETELAH user pindah folder (toast tetap tampil). `moveMutation.mutationFn`
memakai `selectedFolder` saat ini → UID yang sama di folder baru = pesan
BERBEDA (UID per-folder SOGo) ikut terpindah ke Sampah.

**Fix:**
- `scheduleDelete` mengunci `sourceFolder` saat penjadwalan → timer mengirim
  `{ uids, sourceFolder, targetFolder }`
- `moveMutation.mutationFn` memakai `vars.sourceFolder` (fallback selectedFolder
  utk pemanggil lain)
- `clearSnoozesForMoved(uids, folder)` + invalidasi cache memakai folder asal
- `bulkDeleteMutation.onSuccess` membersihkan seleksi SAAT dijadwalkan (bukan
  saat move sukses) — cegah double-schedule / aksi bulk lain menyentuh uid
  pending delete

### Validasi
- Baru `test:undo-delete` — 8 assertion statis (sourceFolder, fallback,
  snooze/invalidate folder asal, clear seleksi)
- **55/55 PASS** · build OK · deploy live terverifikasi hash
