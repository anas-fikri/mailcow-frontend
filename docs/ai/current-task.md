# Current Task — Ai-loop: CalendarPage event store + recurring logic

## Status
- **Bug 1 (data loss):** edit/drag event BERULANG bisa menghancurkan pola
  recurrence diam-diam — save tanpa `repeat` → SOGo menimpa recurrence.
  Jalur: detail /view gagal (fallback grid tanpa repeat) & /view tanpa field repeat.
  **Fix:** safety net di handleUpdateEvent — event berulang + repeat null +
  repeatTouched false → resolve repeat via /view; gagal → THROW (jangan save).
  Edit event berulang diblokir bila detail gagal dimuat (bukan fallback diam-diam).
- **Bug 2:** hapus event berulang tanpa peringatan scope — konfirmasi kini
  jujur ("Hapus SELURUH rangkaian...") di EventModal + popup detail.
- EventModal kirim repeatTouched/isRecurring; calendarDrop terusan isRecurring.
- Test: test-a11y +6 (129), test-calendar-drop +3, 55/55 PASS, build OK.

## Next
- Commit + push + deploy + ai-close
