# Knowledge inbox

<!-- New entries land here; `aitk knowledge compact` files them by topic. -->

- SOGo GET /Mail/0/<f>/<uid>/view menandai \Seen di server bila SOGoMailAutoMarkAsReadDelay=0 (set -1 agar app memegang kendali); mailcow dovecot 'mailbox Archive { auto = subscribe }' membuat Archive langsung dibuat ulang kosong saat dihapus (isi hilang) — lindungi & hapus folder via withoutTrash:false (pindah ke Trash/<nama>); proses node server.js manual (nohup) di sogo-proxy ikut mem-flush pending-sends.json → kirim ganda, cek: proses dgn cwd sogo-proxy harus 1 dan data/pending-sends.json.flush.lock = MainPID. <!-- aitk:k date=2026-10-14 task=T-z9t6 -->
- Deteksi email baru IMAP harus berbasis UID (UIDNEXT/UID tertinggi naik), bukan unseenCount: unseen naik juga saat tandai-belum-dibaca dari klien mana pun dan saat poll gagal mengembalikan 0. <!-- aitk:k date=2026-10-14 task=T-hk0f -->
- SOGo menyimpan kunci custom di user defaults (c_defaults LONGTEXT) apa adanya, termasuk objek bersarang — terverifikasi live dgn PCPWebmailSignatures; signature hasil tempel Outlook/Word bisa ~50 KB HTML saja, jadi batas ukuran harus ratusan KB, bukan puluhan. <!-- aitk:k date=2026-10-15 task=T-p6fw -->
