---
id: T-cpg5
title: Email terkirim tampil di mode percakapan (ala Outlook)
status: in_progress
profile: standard
profile_pinned: true
created: "2026-10-29T04:52:52Z"
updated: "2026-10-29T04:52:52Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-fix-dup-rules
base: fffb2ba00faf0fa0160ffb3c271c442c8fb797bb
---

## Objective
Di tampilan percakapan, gabungkan pesan dari folder Terkirim ke thread yang cocok di folder aktif (mis. Kotak Masuk), ditandai ikon/warna berbeda; aksi pada pesan terkirim memakai folder Terkirim; bisa dimatikan di Tata Letak & Baca.

## Acceptance criteria
- [ ] Given mode percakapan aktif di Kotak Masuk, when ada balasan saya di Terkirim dgn subjek thread yang sama, then pesan itu muncul di thread dgn ikon/warna 'Terkirim'
- [ ] Given pesan terkirim di thread, when dibuka/dihapus/dipindah, then aksi berlaku pada folder Terkirim (bukan Kotak Masuk)
- [ ] Given pesan terkirim, when menghitung belum dibaca/badge, then tidak ikut dihitung; dan pengaturan 'Tampilkan email terkirim dalam percakapan' bisa mematikannya

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
