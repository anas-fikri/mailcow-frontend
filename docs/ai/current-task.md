# Current Task

## 2026-08-27 — Bug Hunt Round 3 + Mobile UX

### Bugs ditemukan & diperbaiki:

1. **`isMobile` detection tidak akurat** — `ontouchstart` aktif di laptop sentuh
   - Fix: pakai `matchMedia('(pointer: coarse)')` + `(hover: none)` — lebih akurat

2. **SwipeableRow inbox: swipe kiri = hapus (terlalu agresif)**
   - Fix: inbox swipe kiri = **quick reply** (sesuai Gmail pattern). Folder lain tetap hapus

3. **Tidak ada pull-to-refresh** — user mobile harus refresh halaman penuh
   - Fix: komponen `PullToRefresh` dengan rubber-band effect + indicator

4. **Pending sends panel tidak re-fetch saat dibuka**
   - Fix: useEffect re-fetch `getPendingSends()` saat `pendingOpen` berubah true

### Mobile UX:
- SwipeableRow sekarang pakai `pointer: coarse` + `hover: none` (bukan ontouchstart)
- Swipe kiri di inbox = Reply (icon + label "Balas")
- Pull-to-refresh: tarik ke bawah → RefreshCw spinning → lepas untuk refresh

### Status: 57/57 PASS, build OK, deployed.
