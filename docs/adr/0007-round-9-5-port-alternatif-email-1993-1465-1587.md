---
status: accepted
date: 2026-08-17
---

# Round 9.5: port alternatif email (1993/1465/1587)

- **Decision:** Panduan email menyajikan dua set port — standar (993 IMAP/465 SMTP/587 STARTTLS) utk jaringan internal, dan alternatif (1993 IMAP/1465 SMTP SSL/1587 submission STARTTLS) utk akses dari internet.
- **Reason:** Verifikasi koneksi: standar diblokir ISP di internet (closed), alternatif terbuka; di IP internal kebalikannya. Kedua set sama-sama SSL/TLS → aman; tidak ada alasan menonaktifkan verifikasi sertifikat.
- **Decision:** Konfigurasi per-klien (Outlook Win/macOS, Apple Mail, Thunderbird) didokumentasikan eksplisit dgn host dinamis `mail.<domain>` + username email lengkap.

