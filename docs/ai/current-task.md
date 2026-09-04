# Current Task

Status: COMPLETED
Task ID: 20260904-RESET-PW-LOGIN-BROKEN
Updated At: 2026-09-04
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Jawab kenapa reset password mailbox dari control-tower membuat akun tak bisa login dengan pesan "diwajibkan mengganti password" padahal fitur itu tidak diaktifkan.

## Result
Akar masalah ditemukan via eksperimen dinamis end-to-end (diag2, replika request persis jalur control-tower):

- Reset via control-tower (`POST /api/v1/edit/mailbox` attr {password,password2}) TIDAK menyentuh `force_pw_update` — flag tetap "0" (terverifikasi).
- **Akar**: bug upstream mailcow `update_sogo_static_view()` (functions.inc.php:988) — variabel `$password`/`$salt` tidak ada di scope, sehingga setiap edit mailbox menulis `c_password = {SSHA256}+sha256("")` (konstanta `47DEQpj8HBS…`) ke `_sogo_static_view`.
- SOGo auth ke tabel fisik itu → semua password ditolak → 403/LDAPPasswordPolicyError → pesan SPA "diwajibkan mengganti password" (salah interpretasi).
- Cron `*/5 sync_sogo_passwords.sh` memulihkan hash BLF-CRYPT asli → login normal lagi dalam ≤5 menit. Itu sebabnya efeknya terasa sementara.

Bukti berantai: reset via API → login 403 (pw baru & lama) → c_password = {SSHA256}47DEQpj8HBS → repair SQL + flush → login pw baru 200 / pw lama 403.

## Follow-ups (disarankan ke user)
1. **Immediate-sync di control-tower server.js**: setelah edit/mailbox yang mengubah password, jalankan UPDATE-JOIN `_sogo_static_view` + flush memcached (menghilangkan window 5 menit).
2. Patch `update_sogo_static_view()` di container mailcow (catat: hilang saat update mailcow).
3. Pertimbangkan pesan error SPA yang lebih jujur: LDAPPasswordPolicyError ≠ pasti wajib ganti password.
