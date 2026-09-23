# Current Task

## 2026-09-23 — UX inbox: pencarian lintas folder + empty state pintar (round-58)

Status: DEPLOYED & LIVE (build-version 1790157122393-raf8yk).
Search folder aktif → kosong → otomatis semua folder (maks 12, paralel);
hasil di-merge dgn chip folder, reader buka folder asal, bar "N hasil",
empty state pintar dgn reset filter/bersihkan. test:mail-search 13 OK;
64 suite hijau.

## 2026-09-23 — Fix pratinjau Word: HTML tampil mentah (round-57)

Status: DEPLOYED & LIVE (build-version 1790154373121-z37k8a).
Render docx-preview kini dangerouslySetInnerHTML (HTML tersanitasi di lib);
tipografi tabel MoM dirapikan (p di td/li, align-top, sup kecil).

## 2026-09-23 — Pratinjau PowerPoint + ZIP in-app (round-56)

Status: DEPLOYED & LIVE (deploy PASS; build-version 1790154046218-jqauwi,
MailPage-DjwLX6b- + chunk jszip.min terverifikasi di server).
- PPTX → outline slide (judul + bullet), ZIP → tabel entri (nama/ukuran/tanggal,
  tanpa ekstraksi). `src/lib/packPreview.js` + modal `packPreview` di reader.
- jszip direct dep, chunk lazy 96 kB; bundle entry tak bertambah. Escape:
  lightbox → docx → pack → reader. test:pack-preview 12 OK; 63 suite hijau.

## 2026-09-23 — Pratinjau PDF + Word (.docx) in-app (round-55)

Status: DEPLOYED & LIVE (commit fd69395, deploy PASS, bundle live terverifikasi:
build-version 1790150151641-o7k7rq, MailPage-BMEV4t9A + chunk lib-DSgfseC 200).
- PDF → lightbox iframe (toolbar Unduh/Tab baru), Word .docx → modal konversi
  mammoth + sanitasi DOMPurify ketat (`src/lib/docPreview.js`), post-strip
  `data:` non-image. Chunk dynamic (mammoth cuma ke-load saat preview dibuka).
- Escape: lightbox → docPreview → reader.

## 2026-09-23 — Lampiran: verifikasi "preview gak muncul" (round-54)

Status: TIDAK ADA BUG KODE — stale tab (SPA lama di memori sampai reload).
Nginx log membuktikan user reload & dapat build preview (MailPage-BZWxJK9m)
jam 14:24–14:25; deploy-check auto-reload bekerja (poll ?bv= → reload).

## 2026-09-23 — Lampiran: tombol Unduh per-kartu + filter gambar body — round-53 lanjutan

Status: DEPLOYED & LIVE (commit e6c9973, deploy PASS, bundle live terverifikasi)

- Tombol **Unduh** eksplisit per kartu lampiran non-image (blob, nama file
  terjaga, spinner per-kartu).
- Gambar footer/banner/signature yang ke-refer di body HTML tidak lagi masuk
  daftar Lampiran: `isInlineBodyImage()` (SOGo menandai gambar inline-rewrite
  `shouldDisplayAttachment=1`, filter flag-0 saja tak cukup).
- Validasi: test:attach-fallback +8 kasus, suite penuh hijau, build OK.

## 2026-09-23 — Fix lampiran non-image hilang (fallback card SOGo) — round-53

Status: COMPLETED (menunggu verifikasi live pasca-deploy)

- **Keluhan**: webmail `/webmail/mail` hanya menampilkan lampiran gambar;
  attachment lain (xlsx/pdf) hilang — kasus nyata: ICT.xlsx dari
  herlina.bunyamin (tampil di mail client, hilang di UI).
- **Akar masalah** (diagnosa penuh di repo mailcow-dashboard, round-53):
  serializer JSON SOGo 5.12.9 tidak meng-emit
  `viewURL/downloadURL/size/shouldDisplayAttachment` untuk part top-level
  `application/*` — `extractAttachments` hanya menampung part ber-URL →
  attachment non-image hilang dari daftar Lampiran.
- **Fix repo ini**: `parseAttachmentCard()` (messageHtml.js) — ekstrak URL
  `asAttachment` + ukuran dari card Angular yang SOGo embed di field `content`
  part tanpa-viewer; dipakai sbg fallback saat metadata kosong (part non-text,
  non-html). Perilaku lama (metadata lengkap, flag 0 inline CID) tak berubah.
- **Validasi**: test:attach-fallback baru (sample card produksi asli), seluruh
  suite test:* hijau, build OK.
- **Deploy**: `./deploy.sh` (DEPLOY_SSH_HOST=deploy-mail) → verifikasi
  bundle live + buka pesan herlina di webmail (lampiran ICT.xlsx harus tampil).

---

Status: COMPLETED
Task ID: 20260923-014649-923291
Started At: 2026-09-23T01:46:49Z
Updated At: 2026-09-23T03:20:08Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
20260922-DATA-E2E: E2E live jalur data (restore draft berlampiran via kirim ulang + export .eml) di produksi

## Goal Link
Goal ID: TBD
Sub-goal ID: TBD

## Files Involved
- To be determined

## Next Steps
- Inspect the current code and context
- Execute the task
- Update handoff notes before switching tools

## Risk Analysis
- Status: COMPLETE
- Risk level: MEDIUM (E2E live mengirim email nyata dari akun diag2 ke dirinya sendiri — email uji berlabel E2E, dibersihkan otomatis)
- Impact surface: akun diag2 saja (compose→kirim→INBOX diag2); unduhan .eml via CDP ke /tmp lokal; tidak menyentuh akun user lain.
- Security concerns: lampiran uji = PDF/PNG buatan sendiri (bukan data sensitif); kredensial diag statis baku.
- Compatibility concerns: state UI diag2 (draft folder, tombol aksi) dikembalikan via cleanup expunge + pre-cleanup.
- Failure modes/edge cases: SOGo send bisa lambat/429 (mitigasi: waitForFunction timeout besar + retry cek INBOX); unduhan .eml bisa tak terpicu (mitigasi: await Promise.all dgn waitForTimeout fallback); leftover (mitigasi: expunge by-subject idempoten di finally + runner trap).
- Mitigations: cleanup double-layer; semua asersi pakai ground truth doveadm/MIME, bukan hanya DOM.
- Validation plan: node --check; E2E live PASS; bila bug app ditemukan → fix + test + deploy.
- Open risks/assumptions: delivery SMTP lokal biasanya <5 detik; asumsi tombol 'Unduh .eml' memicu download browser (diverifikasi saat implementasi).

## Risks
- (tercatat di atas)

## Validation
- Risk analysis: COMPLETE
- Tests/checks: Belum dijalankan
