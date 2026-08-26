# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-26T16:15:59Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Fitur riwayat alamat terkirim: semua jalur kirim (compose, reply, forward, quick-reply) melewati ComposeModal.handleSend — rekam di sana cukup (grep sendMessage( memastikan tidak ada pemanggil lain). batchWithLimit (concurrency 5 + allSettled) di MailPage dipakai utk mark-all-read: SOGo tidak punya endpoint batch, Promise.all massal memicu 429/500/timeout dan menggagalkan seluruh operasi walau mayoritas sukses — pola utk batch per-uid lain. Pola parse recipient aman: isSafeRecipient + recipientAddress dari emailValidation (tolak kontrol chars, koma, ganda @). Storage per-akun baru: pcp_emailHistory_v1_<email> (≤200, sort lastUsed di baca).
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 4 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
