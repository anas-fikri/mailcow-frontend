# Current Task — ai-loop rotasi: PreferencesPage & signatures

## Status
- **Fix race `migratedRef`** di SignatureSection (PreferencesPage): import SOGo signature
  satu-kali sekarang TUNGGU sampai `fetchPreferences` selesai. Sebelumnya `migratedRef`
  di-set duluan → kalau prefs lambat, signature SOGo tidak pernah diimport.
- **Signature sanitize** diverifikasi: HTML signature di-sanitize di chokepoint
  (RichEditor inject + send chokepoint, PURIFY_CONFIG + hardenAnchorNode) — tidak ada XSS.
- **syncToSogo** = aksi manual (tombol) → tidak ada race overwrite antar perangkat.
- Test: test-a11y +2 (119 assertions), 55/55 PASS, build OK.

## Next
- Commit + push + deploy (SERVER=deploy-mail ./deploy.sh)
- ai-close dengan knowledge
