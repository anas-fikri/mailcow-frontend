# Current Task

## 2026-08-27 — Conversation View Expand/Collapse All

### Fitur baru:
Tombol expand/collapse all di header (hanya muncul di conversation view).

### Implementasi:
- `expandAllConversations()` — expand max 50 thread (limit utk cegah lag)
- `collapseAllConversations()` — collapse semua
- Tombol di header: ChevronDown (expand all) / ChevronRight (collapse all)
- Toggle otomatis: kalau semua sudah expand → klik jadi collapse, sebaliknya
- Reset expanded set saat toggle conversation view on/off

### Edge cases verified:
- Hapus pesan dalam conversation → query invalidates → conversationGroups re-render
- Conversation shrink ke 1 pesan → render sebagai baris biasa (bukan group)
- Stale keys di expandedConversations → harmless (tidak match group manapun)

### Status: 58/58 PASS, build OK, deployed.
