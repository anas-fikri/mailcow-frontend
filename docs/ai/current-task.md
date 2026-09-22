# Current Task

Status: COMPLETED
Task ID: 20260922-115707-317695
Started At: 2026-09-22T11:57:07Z
Updated At: 2026-09-22T12:02:44Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
20260922-CONV-ATTACH: indikator lampiran per-thread di header conversation (agregat hasAtt)

## Goal Link
Goal ID: TBD
Sub-goal ID: TBD

## Files Involved
- src/lib/conversations.js — agregat hasAttachment/attachmentCount per grup
- src/pages/MailPage.jsx — chip paperclip di header thread conversation
- scripts/test-conversations.mjs + scripts/test-mail-golden.mjs — regresi

## Next Steps
- Inspect the current code and context
- Execute the task
- Update handoff notes before switching tools

## Risk Analysis
- Status: DONE
- Risk level: LOW (render-only, field tambahan pada grup)
- Impact surface: header conversation collapsed saja; baris anggota expanded sudah punya indikator per-pesan
- Security concerns: tidak ada sink baru; ikon dari lucide, teks dari field internal
- Compatibility concerns: field grup tambahan bersifat aditif — tidak mengubah kontrak hasUnread/senders/latest; hasAtt undefined → indicator tidak tampil (fallback aman)
- Failure modes/edge cases: (1) thread tanpa lampiran → tanpa chip; (2) hasAtt string "1"/boolean dari parser → truthy cocok; (3) grup 1 pesan dirender sbg baris biasa (tanpa header) → chip per-baris tetap jalan
- Mitigations: unit test agregat + golden fixture (thread laporan: 1 pesan berlampiran dari 2)
- Validation plan: test:conversations, test-mail-golden, test:conversation-toolbar, test:a11y, build
- Open risks/assumptions: indikator mencakup pesan yang SUDAH dimuat di thread (konsisten dgn count badge pesan)

## Validation
- Risk analysis: REQUIRED
- Tests/checks: Not run
