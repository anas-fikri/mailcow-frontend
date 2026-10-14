---
status: accepted
date: 2026-08-17
---

# Round 9.4: outbound relay dnet + mitigasi spoofing bounce

- **Decision:** Outbound mailcow memakai relayhost `[smtp-pre.dnet.net.id]:26` dengan SASL sender-dependent (bukan port 25 tanpa auth).
- **Reason:** Port 25 tanpa auth ditolak dnet ("Relay access denied") → seluruh kiriman keluar bounce ke pengirim. :26 + SASL terbukti `status=sent`.
- **Decision:** Bounce dari `smtp.mailchannels.net` (ESA "Sender blocked") diperlakukan sebagai spoofing eksternal — infrastruktur tidak memakai MailChannels; mitigasi via DMARC `p=quarantine` (sudah) dan opsi SPF `~all` → `-all` (menunggu konfirmasi user; semua pengirim sah sudah dalam include dnet/google).
- **Decision:** Verifikasi keamanan akun berbasis bukti server: 0 SMTP AUTH dalam 48 jam = bukan kompromi kirim; IP login IMAP/webmail harus dikonfirmasi pemiliknya sebelum menyimpulkan aman.

