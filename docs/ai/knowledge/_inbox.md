# Knowledge inbox

<!-- New entries land here; `aitk knowledge compact` files them by topic. -->

- SOGo GET /Mail/0/<f>/<uid>/view menandai \Seen di server bila SOGoMailAutoMarkAsReadDelay=0 (set -1 agar app memegang kendali); mailcow dovecot 'mailbox Archive { auto = subscribe }' membuat Archive langsung dibuat ulang kosong saat dihapus (isi hilang) — lindungi & hapus folder via withoutTrash:false (pindah ke Trash/<nama>); proses node server.js manual (nohup) di sogo-proxy ikut mem-flush pending-sends.json → kirim ganda, cek: proses dgn cwd sogo-proxy harus 1 dan data/pending-sends.json.flush.lock = MainPID. <!-- aitk:k date=2026-10-14 task=T-z9t6 -->
