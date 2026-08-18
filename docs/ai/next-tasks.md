# Suggested Next Tasks

Project: sogo-frontend
Generated At: 2026-08-18T07:30:46Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [HIGH] Run or verify validation: `npm run build` ✅ 
- Why:  **14/14 `npm run test:*` PASS** ✅ (termasuk 2 test baru: `test:mailbox-tree`, `test:message-html`) | heuristik: bounce→HTML true, teks biasa (`<`,`>`)→false ✅ | depth flat & nested konsisten (0/1/2) ✅.|Current task contains validation work that still needs explicit confirmation.
- Source: current-task.md

## 2. [MEDIUM] Follow up on discovered knowledge: Batch 2 fitur harian sogo-frontend: (1) auto-advance reader via siblingUids+onNavigateTo (buka pesan berikutnya setelah hapus/arsip); (2) group by tanggal di daftar (dateGroups.js, parser toleran ISO/RFC/epoch/today/yesterday, bucket Hari Ini/Kemarin/Minggu Ini/Bulan Lalu/Lebih Lama, 32 test); (3) tambah ke kontak dari email (POST Contacts/personal/new {c_cn,c_mail,c_telephonenumber}, prefill from[0]/to[0]); (4) kalender: klik sel=pilih  tombol  per sel; (5) rule Jalankan Sekarang = matchRules+fetchMessages INBOX+moveMessages. 20/20 test  build OK. BELUM deploy.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 3. [MEDIUM] Advance goal: Sub-goal G-001.S-002 — Documentation currency
- Why: Goal remains ACTIVE — historical deployment records are complete, but current login delivery status must remain synchronized..
- Source: goals.md

## 4. [LOW] Review and commit current changes
- Why: 10 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
