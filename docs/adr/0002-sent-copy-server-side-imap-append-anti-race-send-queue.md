---
status: accepted
date: 2026-10-08
---

# Sent-copy server-side (IMAP APPEND) + anti-race send queue

- **Decision (sent-copy di server, bukan client):** Salinan Sent dibuat oleh
  `sogo-smtp-proxy` via IMAP APPEND (`src/lib/sentCopy.js`, dep `imapflow`) — bukan oleh
  frontend — supaya berlaku untuk SEMUA jalur kirim (queue undo-send, kirim langsung,
  fallback SOGo 501) dan tetap jalan walau tab ditutup. Message-ID & Date di-set
  eksplisit identik di pesan terkirim dan salinan, agar threading client benar.
- **Decision (best-effort):** Kegagalan sent-copy TIDAK menggagalkan pengiriman —
  appendSentCopy tidak pernah melempar; hanya log `[sent-copy] GAGAL` di journald.
- **Decision (Bcc di salinan):** Salinan Sent memuat header Bcc (standar Gmail/SOGo);
  pesan yang DIKIRIM tetap membawa bcc hanya di envelope — MailComposer selalu strip
  header Bcc, jadi header di-inject kembali hanya untuk buffer salinan.
- **Decision (queue in-memory):** `sendQueue` memakai state in-memory + save
  terserialisasi (tmp+rename); persist tidak pernah melempar ke loop flush — entry
  gagal flush diam-diam (kasus `8b4baf71`) tidak boleh terulang.
- **Decision (E2E ground truth server):** E2E `sentcopy` verifikasi salinan via
  `doveadm` di server, bukan parser UI — kegagalan frontend tidak menutupi bug backend.

