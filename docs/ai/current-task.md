# Current Task

## Task: ai-loop round kombinasi — multi-akun & konflik state antar halaman

**Status: SELESAI (45/45 test PASS, live)** → commit + push + deploy.

## Ringkasan
Bug hunt pass 6+ (rotasi fokus: kombinasi + regresi). Audit menyeluruh:
scoping localStorage per-akun, persist/rehydrate authStore, cache React Query
lintas akun, guard keyboard antar UI, polling/timer multi-tab. 2 bug nyata
ditemukan & diperbaiki.

## Temuan & Perbaikan

### Bug 1 — Cache React Query lintas akun (multi-account)
`queryKey: ['smtp-session-status']` di Sidebar TIDAK di-scope per user.
QueryClient global di tab → countdown sesi SMTP akun SEBELUMNYA tampil
sejenak untuk akun baru (staleTime 30s + cache bertahan sampai
session-expired). Diperbaiki:
```js
queryKey: ['smtp-session-status', user?.sogoToken]
```

### Bug 2 — Shortcut keyboard reader aktif di belakang ComposeModal
Alur reply: MessageReader TETAP ter-mount saat ComposeModal terbuka di
atasnya. Handler keydown reader hanya guard input/contentEditable, bukan
keadaan compose → menekan `r` membuka ulang compose (isi ter-reset), `s`
toggle flag di belakang modal, `Delete` menghapus pesan yang sedang dibalas,
`Escape` menutup reader di balik modal. Diperbaiki:
- Prop baru `shortcutsEnabled` (default true) di MessageReader + guard di
  handler + masuk dependency array
- MailPage mengirim `shortcutsEnabled={!composeOpen}`

### Yang diperiksa & aman (tidak diubah)
- **Scoping localStorage multi-akun**: semua key `*_v2_<email>` (signatures,
  snooze, flagColors, rules, sogo_prefs, pcp_prefs) — tidak ada kebocoran
  lintas akun; `pcp-auth` memuat prefs per-akun via `loadPrefs(email)`.
- **LoginPage multi-akun**: `revokeSmtpSession() + clearUser() +
  resetSessionExpiredFlag()` sebelum login baru ✓
- **Server SMTP**: send terikat `session.user` + anti-spoof From
  (`recipientAddress(from) !== session.user → 403`); register evict sesi lama
  per user (SESSION_MAX_PER_USER) ✓
- **visibleOrderUids** (auto-advance reader) = hasil filter snooze → reader
  tidak pernah membuka pesan tersembunyi ✓
- **Timer/interval**: prune snooze + autoArchive + heartbeat semuanya
  unmount-clean ✓; multi-tab idempotent ✓

## Test
- **Baru `test:state-combination`** (7 assertions static): scoping key
  smtp-session-status per token + SEMUA query key di Sidebar memuat identitas
  user; prop/guard/deps shortcutsEnabled; konteks mount bersama
  ComposeModal+MessageReader.
- **45/45 test PASS** · `npm run build` OK

Status: COMPLETED
Updated At: 2026-08-26T01:15:42Z
