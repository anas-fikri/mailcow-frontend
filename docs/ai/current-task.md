# Current Task

Status: COMPLETED
Task ID: 20260905-SCOPE-GUARD-LIB-EXT
Updated At: 2026-09-05
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Extend the module-scope static guard (`scripts/test-module-scope-refs.mjs`) to cover `src/lib` (47 files) and `src/store` (1 file), so the bug class behind the 2026-09-05 /webmail/mail outage cannot reappear anywhere in the SPA — not just in pages/components.

## Result
1. **Cakupan diperluas**: driver kini memindai **60 file** — `src/pages`, `src/components/mailer`, `src/lib`, `src/store`, `App.jsx`, `main.jsx` (sebelumnya 12).
2. **Gap checker ditemukan & diperbaiki**: perluasan memunculkan 72 temuan no-undef palsu — semua konstanta ber-`export` (mis. `export const FLAG_COLORS`, `EMAIL_CATEGORIES`, `SMTP_SESSION_COOKIE`). Penyebab: pass A `scanDecls` hanya mengecek `st.type === 'VariableDeclaration'`, padahal `export const X` ber-type `ExportNamedDeclaration` dengan deklarasi di `st.declaration` → deklarasi ber-export tidak pernah terdaftar. Fix: unwrap export di `scanDecls`.
3. **Self-test diperkuat 3→5**: case baru TDZ pada deklarasi ber-export (mengunci bahwa fix export-handling tidak melemahkan deteksi TDZ kelas CalendarPage) + case export const sehat tanpa false-positive.
4. **Hasil**: 60 file diperiksa, **0 temuan nyata** — seluruh src/lib dan src/store bersih dari bug kelas outage.

## Validasi
- Guard self-test 5/5; scan 60 file tanpa temuan.
- Suite **83/83 PASS**.
- Tidak ada perubahan kode produksi → tidak perlu deploy; bundle live tetap valid.

## Next
- (Opsional) Cakupan bisa ditambah ke `scripts/` bila pola lintas-modul relevan, atau pasang ESLint no-undef penuh bila ingin mengunci kelas error lain.