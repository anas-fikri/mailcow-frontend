# Current Task — Audit overlap putaran 3 (width-budget baris pesan)

## Status: Selesai (menunggu commit/push/deploy)

## Temuan & Perbaikan

### Bug — 4 tombol aksi invisible menyedot 104px di baris pesan
Width-budget baris pesan di lebar list 240px:
- padding 24px + avatar 40px → konten 176px
- cluster kanan: filter+snooze+archive+star+date ≈ 163px — TAPI filter/snooze/archive/star saat idle hanya `opacity-0 pointer-events-none` → **tetap reserve ruang 104px tak terlihat** → pengirim terpotong jadi ~13px ("…").

**Fix (pola Gmail):** aksi hover kini `hidden group-hover:flex` (tidak reserve ruang saat idle), dan **date `group-hover:hidden`** — saat hover aksi menggantikan posisi tanggal, bukan menimpa pengirim. Star: `starVisible` (berflag/touch) selalu tampil; tidak berflag di desktop → `hidden group-hover:flex`. Checkbox avatar tetap overlay absolute (tidak reserve).

## Test
- `test-a11y` +3 (hidden cluster, date group-hover:hidden, star conditional) → **117 assertions**
- **55/55 PASS** · build OK

## Next
- Commit + push (tunnel) + deploy.
