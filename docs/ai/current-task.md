# Current Task

Status: COMPLETED
Task ID: 20260906-DRAFT-ATTACH-E2E
Updated At: 2026-09-06
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Tambah browser E2E untuk alur edit draft dengan lampiran end-to-end, dan perbaiki bug yang ditemukannya.

## Result
- E2E baru `scripts/e2e-draft-attachments-browser.mjs` (scenario `draft` di
  `e2e-browser-runner.sh`): compose+attach → autosave → close → reopen →
  edit → reload → persist → cleanup. PASS di produksi.
- **Bug 1 (dari E2E)**: autosave draft tidak mengirim lampiran → lampiran
  hilang server-side. Fix `saveDraft` (api.js): protokol 2-fase SOGo
  (multipart `attachments` + JSON headers/text).
- **Bug 2 (dari E2E, kelas data-loss)**: menutup compose edit-draft
  menghapus copy autosave (berisi edit terbaru) & memelihara draft asli
  (stale) → edit pengguna hilang diam-diam. Fix: copy terbaru yang selamat,
  draft asli dihapus; close sebelum autosave → flush save; autosave
  in-flight saat tutup → path closedRef yang selamatkan hasil terbaru.
- Kontrak dikunci di `test-draft-compose.mjs`. Suite 85/85, build bersih,
  deploy live (.co.id & .com md5 chunk identik), E2E draft + mail PASS.

## Next
- Opsional: E2E serupa untuk reply-with-attachment dan scheduled send.
