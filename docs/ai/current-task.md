# Current Task

## 2026-08-27 — Bug Hunt Round 5

### Temuan:
1. **Auto-load folder Sent/Drafts/Junk** — sudah bekerja! Kode auto-load (line 762+) berlaku untuk SEMUA folder. INBOX punya batas 5 bulan; folder lain auto-load sampai habis. Tidak perlu perubahan.

2. **Flag color picker duplikat kode** — if/else punya logic identical (markFlagged + invalidateQueries). 
   - Fix: deduplicate jadi satu jalur, komentar penjelasan.

3. **SuggestionList email chip** — sudah benar: `onMouseDown` + `preventDefault` mencegah blur race. Tidak ada duplikat email.

### Status: 58/58 PASS, build OK, deployed.
