# Current Task

## 2026-08-27 — Bug Hunt Round 4: Dark Mode Safari + Keyboard Shortcuts

### Bugs ditemukan & diperbaiki:

1. **Safari dark mode `addEventListener` tidak support** — Safari <14 tidak punya `addEventListener` di MediaQueryList
   - Fix: fallback ke `addListener`/`removeListener` (deprecated tapi masih work)

2. **Theme switch tanpa transition** — `<html>` element tidak punya `transition-colors`, flash putih/hitam saat ganti tema
   - Fix: `document.documentElement.style.transition = 'background-color 0.2s, color 0.2s'`

3. **`a` shortcut select-all pakai `messages` bukan `sortedMessages`** — konsisten dengan `toggleSelectAll` button
   - Fix: `a` sekarang pakai `sortedMessages` (hanya pilih yang TAMPIL)

4. **Dead code `r`/`f` handler di MailPage** — tidak pernah tercapai karena `isReaderOwnedShortcut` return early
   - Fix: hapus dead code, ganti dengan komentar penjelasan

5. **Send button ComposeModal kurang dari 44px touch target** — `py-2` = ~36px total
   - Fix: tambah `min-h-11 py-2.5` = 44px minimum

### Status: 57/57 PASS, build OK, deployed.
