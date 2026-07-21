# Migrasi Email pcpexpress.com
## Dari Carbonio SaaS → Mailcow + Synology NAS (Zero-Downtime)

- **Tanggal Mulai:** 20 Juli 2026
- **Target Cutover:** Minggu ke-2 (estimasi: 3–4 Agustus 2026)
- **PIC Admin:** Anas Fikri
- **Total Akun:** ~500 mailbox
- **Total Data:** ~2.5TB
- **Server Mailcow:** `mail.pcpexpress.co.id` | IP Publik: `115.178.128.146`
- **IP Lokal Server:** `10.3.3.210`
- **Akses SSH:** `ssh mailserver` (alias via `~/.ssh/config`)
- **Storage Target:** Synology NAS (di-mount via NFS ke Mailcow Dovecot)

---

> [!IMPORTANT]
> **Prinsip Utama:** MX record `pcpexpress.com` **TIDAK BOLEH** diubah sampai hari-H cutover. Selama setup berlangsung, semua email tetap mengalir ke Carbonio seperti biasa.

---

## FASE 1: Shadow Setup (Hari 1–2)
*Mailcow disiapkan di belakang layar. Carbonio tetap jalan normal.*

### ✅ 1.1. Domain Ditambahkan ke Mailcow
**Status: SELESAI (20 Juli 2026)**

Domain `pcpexpress.com` sudah berhasil ditambahkan ke Mailcow via API:
```bash
curl -s -X POST https://mail.pcpexpress.co.id/api/v1/add/domain \
  -H "X-API-Key: <MAILCOW_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "pcpexpress.com",
    "aliases": 1000,
    "mailboxes": 600,
    "maxquota": 10240,
    "quota": 10240,
    "defquota": 5120,
    "active": 1
  }'
```

### ✅ 1.2. DKIM Key Di-generate
**Status: SELESAI (20 Juli 2026)**

DKIM 2048-bit untuk `pcpexpress.com` sudah di-generate otomatis oleh Mailcow dengan selector `dkim`.

Ambil public key kapan saja dengan:
```bash
curl -s https://mail.pcpexpress.co.id/api/v1/get/dkim/pcpexpress.com \
  -H "X-API-Key: <MAILCOW_API_KEY>"
```

### ⏳ 1.3. Setup NFS Mount Synology NAS
**Status: BELUM (perlu dikerjakan)**

Dovecot Mailcow harus diarahkan menyimpan email ke NAS agar 2.5TB data bisa tertampung.

```bash
# Di server Mailcow (ssh mailserver)
# 1. Buat mount point
sudo mkdir -p /mnt/nas/mailcow-vmail

# 2. Tambahkan ke /etc/fstab (ganti IP_NAS dan SHARE_PATH sesuai Synology)
echo "<IP_NAS>:<SHARE_PATH> /mnt/nas/mailcow-vmail nfs defaults,_netdev,rw,vers=3 0 0" \
  | sudo tee -a /etc/fstab

# 3. Mount sekarang
sudo mount -a

# 4. Set permission agar Dovecot bisa menulis
sudo chown -R 5000:5000 /mnt/nas/mailcow-vmail
sudo chmod 770 /mnt/nas/mailcow-vmail
```

Lalu arahkan Mailcow Dovecot ke NAS di `docker-compose.override.yml`:
```yaml
services:
  dovecot-mailcow:
    volumes:
      - /mnt/nas/mailcow-vmail:/var/vmail
```

Kemudian restart Dovecot:
```bash
cd /data/docker-data/mailcow
sudo docker compose up -d dovecot-mailcow
```

---

## FASE 2: DNS Records (Hari 2)
*Tambahkan ke panel DNS pcpexpress.com. Tidak merusak Carbonio.*

### ✅ 2.1. DKIM Record (BARU — aman ditambahkan kapan saja)

| Type | Name | Value |
|------|------|-------|
| `TXT` | `dkim._domainkey.pcpexpress.com` | `v=DKIM1;k=rsa;t=s;s=email;p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApu6A3igKhOV+JtDtvVKwfSzoArhWQ3SBajrsjWOf+qsvbWLWE+HCxoxI44znNAHsgQ1GDnZnk6aZ1atKhxUU+RyrYYPiiFfW7P78ZvYoWSjsxiPNBaMnnZbSgzesdT0OCQ37Il1kXyebABBwumn8NX6sH0Oi9j4giWU8xnL/f0PI3Lx5N+FaDvMmcqbaS8SYRGV8FGQV+B2wp8N3duFPPhIfUoKwCDJVVrbH+PZDwLzse2i682hBxFdjqI4XTbQU5pnZhBG+Yf8NcZdth8RPf68I3NZVqIZ+uJI3ePHcNobrGCmBEVyNHy49FnSUyZceREKz0bVgHBtV//8Gv+RTWwIDAQAB` |

### ⚠️ 2.2. SPF Record (UPDATE — gabungkan IP Mailcow)

**Record SPF saat ini (Carbonio):**
```
v=spf1 a:mx11.eranyacloud.com a:mx12.eranyacloud.com ip4:160.22.250.192 ip4:103.153.61.171 ip4:103.176.44.77 include:_spf.google.com ~all
```

**Ganti menjadi (tambahkan IP publik Mailcow):**
```
v=spf1 a:mx11.eranyacloud.com a:mx12.eranyacloud.com ip4:160.22.250.192 ip4:103.153.61.171 ip4:103.176.44.77 ip4:115.178.128.146 include:_spf.google.com ~all
```

> [!NOTE]
> IP `115.178.128.146` adalah IP publik server Mailcow `mail.pcpexpress.co.id`. Penambahan ini tidak merusak SPF Carbonio karena bersifat additive.

### 🔴 2.3. MX Record — JANGAN DIUBAH SAMPAI HARI-H

```
# Tetap biarkan seperti ini sampai hari cutover:
5  mx11.eranyacloud.com
10 mx12.eranyacloud.com
```

### ⏳ 2.4. TTL MX — Turunkan H-2 Sebelum Cutover

Di hari **H-2 (2 hari sebelum cutover)**, turunkan TTL MX menjadi 300 detik (5 menit):
```
# MX record (TTL diubah ke 300):
300 IN MX 5  mx11.eranyacloud.com
300 IN MX 10 mx12.eranyacloud.com
```

Ini memastikan saat MX di-switch ke Mailcow nanti, perubahan tersebar ke seluruh internet dalam 5 menit.

---

## FASE 3: Migrasi Akun & Data (Hari 3–11)
*Berjalan di background. Carbonio tetap jalan normal.*

### 3.1. Export Daftar Akun dari Carbonio

Export semua 500 akun dalam format CSV dari admin panel Carbonio:
```
email, display_name, quota_mb
user1@pcpexpress.com, User Satu, 5120
user2@pcpexpress.com, User Dua, 5120
...
```

Simpan sebagai `accounts.csv` di server Mailcow.

### 3.2. Import Akun Massal ke Mailcow (Script Otomatis)

```bash
#!/bin/bash
# Script: import_accounts.sh
# Jalankan di: ssh mailserver

API_KEY="<MAILCOW_API_KEY>"
API_URL="https://mail.pcpexpress.co.id/api/v1"

while IFS=, read -r email name quota; do
  # Generate password acak
  PASS=$(openssl rand -base64 16)
  LOCAL=$(echo "$email" | cut -d@ -f1)

  curl -s -X POST "$API_URL/add/mailbox" \
    -H "X-API-Key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"local_part\": \"$LOCAL\",
      \"domain\": \"pcpexpress.com\",
      \"name\": \"$name\",
      \"password\": \"$PASS\",
      \"password2\": \"$PASS\",
      \"quota\": $quota,
      \"active\": 1,
      \"force_pw_update\": 1
    }"

  echo "$email,$PASS" >> passwords_generated.csv
  echo "✅ Created: $email"
done < accounts.csv
```

> [!CAUTION]
> File `passwords_generated.csv` berisi password sementara semua user. Simpan dengan aman dan hapus setelah didistribusikan.

### 3.3. Sinkronisasi Email via imapsync (Paralel)

imapsync akan menarik semua email dari IMAP Carbonio ke Mailcow secara paralel di background:

```bash
#!/bin/bash
# Script: run_imapsync.sh
# Install dulu: sudo apt install imapsync

CARBONIO_HOST="mail.pcpexpress.com"   # IMAP host Carbonio
MAILCOW_HOST="mail.pcpexpress.co.id"  # IMAP host Mailcow
ADMIN_PASS_CARBONIO="<CARBONIO_ADMIN_PASS>"

while IFS=, read -r email mailcow_pass; do
  LOCAL=$(echo "$email" | cut -d@ -f1)

  # Jalankan setiap akun sebagai background job
  imapsync \
    --host1 "$CARBONIO_HOST" --user1 "$email" --password1 "$ADMIN_PASS_CARBONIO" \
    --host2 "$MAILCOW_HOST"  --user2 "$email" --password2 "$mailcow_pass" \
    --ssl1 --ssl2 \
    --exclude "Junk" \
    --logfile "/var/log/imapsync/$LOCAL.log" &

  # Batasi maks 10 proses paralel
  while [ $(jobs -r | wc -l) -ge 10 ]; do sleep 5; done

done < passwords_generated.csv

wait
echo "✅ Semua sinkronisasi selesai!"
```

> [!TIP]
> Untuk 2.5TB via internet (asumsi bandwidth 100Mbps dedicated malam hari), estimasi waktu sinkronisasi penuh adalah **3–5 hari**. Jalankan script ini mulai Hari ke-3 agar selesai sebelum cutover.

---

## FASE 4: Pilot Test (Hari 8–11)

### 4.1. Checklist Pilot (10 Akun IT Internal)
- [ ] Login ke SOGo Webmail Mailcow: `https://mail.pcpexpress.co.id/SOGo`
- [ ] Verifikasi email lama muncul (hasil imapsync)
- [ ] Kirim email keluar → cek diterima di Gmail/luar
- [ ] Terima email dari luar → cek masuk ke Mailcow *(perlu test dengan akun relay sementara)*
- [ ] Test IMAP client (Outlook, Thunderbird) → setting: `mail.pcpexpress.co.id`, port 993 SSL

### 4.2. Final Sync Sebelum Cutover
Jalankan ulang `run_imapsync.sh` dengan flag `--delete2` untuk memastikan email terbaru dari Carbonio ikut terbawa:
```bash
# Tambahkan flag --delete2 pada script imapsync untuk sync final
imapsync ... --delete2
```

---

## FASE 5: D-Day Cutover (Malam Hari, Jam Rendah Traffic)

> [!WARNING]
> Lakukan cutover pada **malam hari** (misal: Jumat jam 23.00 WIB) untuk meminimalkan dampak ke user.

### Urutan Eksekusi (Total Waktu: ~15 Menit)

```bash
# LANGKAH 1: Switch MX di panel DNS pcpexpress.com
# Hapus MX lama (Carbonio), tambahkan:
# TTL: 300
# MX 10: mail.pcpexpress.co.id

# LANGKAH 2: Verifikasi MX sudah tersebar (tunggu 5 menit)
dig MX pcpexpress.com +short
# Harus mengembalikan: mail.pcpexpress.co.id

# LANGKAH 3: Test kirim email ke pcpexpress.com dari akun eksternal
# Pastikan email masuk ke Mailcow, bukan Carbonio

# LANGKAH 4: Jalankan imapsync final sekali lagi
# untuk menangkap email yang masuk ke Carbonio di saat-saat terakhir
```

### Rollback Plan (Jika Ada Masalah)
```bash
# Kembalikan MX ke Carbonio dalam waktu 5 menit:
# MX 5:  mx11.eranyacloud.com
# MX 10: mx12.eranyacloud.com
# TTL: 300 (sudah diset rendah sejak H-2)
```

---

## FASE 6: Post-Cutover (Hari 13–14)

### 6.1. Checklist Pasca Cutover
- [ ] Monitor log Postfix Mailcow: `docker logs mailcow-postfix-mailcow-1 -f`
- [ ] Monitor log Dovecot: `docker logs mailcow-dovecot-mailcow-1 -f`
- [ ] Cek antrian email: `docker exec mailcow-postfix-mailcow-1 mailq`
- [ ] Kirim email ke `mail-tester.com` → target skor 10/10
- [ ] Distribusikan panduan update IMAP settings ke semua 500 user

### 6.2. Pengaturan IMAP Baru untuk User
Bagikan informasi berikut ke semua user yang pakai email client:

| Setting | Nilai |
|---------|-------|
| **Server IMAP** | `mail.pcpexpress.co.id` |
| **Port IMAP** | `993` (SSL/TLS) |
| **Server SMTP** | `mail.pcpexpress.co.id` |
| **Port SMTP** | `587` (STARTTLS) |
| **Username** | Email lengkap (`user@pcpexpress.com`) |
| **Password** | Password sementara (kirim secara privat) |
| **Webmail** | `https://mail.pcpexpress.co.id/SOGo` |

### 6.3. Setelah Semua Stabil (2-3 Hari Pasca Cutover)
- [ ] Naikkan TTL MX kembali ke 3600 detik (1 jam)
- [ ] Hapus IP Mailcow dari SPF Carbonio (tidak relevan lagi)
- [ ] Hubungi tim Carbonio untuk menutup kontrak/akun SaaS
