#!/bin/bash
# Golden-sample capture — data SOGo produksi ASLI untuk semua parser MailPage.
# Persis endpoint + payload yang dipakai SPA (api.js). Output: /tmp/golden-*.json
set -u
U=diag2@pcpexpress.co.id
PW='DiagTest123!'
H=mail.pcpexpress.co.id
ENC=$(python3 -c "import urllib.parse;print(urllib.parse.quote('$U', safe=''))")
DC=$(docker ps --format '{{.Names}}' | grep -Ei 'dovecot' | head -1)
M=$(docker ps --format '{{.Names}}' | grep -Ei 'mysql|maria' | head -1)
F=$(find /data /root /home -maxdepth 4 -name 'mailcow.conf' 2>/dev/null | head -1)
source "$F" 2>/dev/null

echo "== 0. enable diag2 + static view + flush =="
docker exec "$M" mysql -umailcow -p"$DBPASS" mailcow -N -e "UPDATE mailbox SET active='1' WHERE username='$U';" 2>/dev/null
docker exec "$M" mysql -umailcow -p"$DBPASS" mailcow -N -e "UPDATE sogo_view SET c_password='{PLAIN}$PW' WHERE c_uid='$U';" 2>/dev/null
docker exec "$M" mysql -umailcow -p"$DBPASS" mailcow -N -e "REPLACE INTO _sogo_static_view (c_uid, domain, c_name, c_password, c_cn, mail, aliases, ad_aliases, kind, multiple_bookings, quota) SELECT c_uid, domain, c_name, c_password, c_cn, mail, aliases, ad_aliases, kind, multiple_bookings, quota FROM sogo_view WHERE c_uid='$U';" 2>/dev/null
docker exec "$M" mysql -umailcow -p"$DBPASS" mailcow -N -e "UPDATE _sogo_static_view SET c_password='{PLAIN}$PW' WHERE c_uid='$U';" 2>/dev/null
docker restart memcached-mailcow >/dev/null 2>&1; sleep 2

echo "== 1. seed pesan uji kaya (lampiran, ukuran, konversi, karakter khusus) =="
DAY8=$(date -d '8 days ago' -R); DAY3=$(date -d '3 days ago' -R); YEST=$(date -d 'yesterday 21:38' -R); NOW=$(date -R)
# a) Email dgn lampiran PDF (multipart) + size besar → uji extractAttachments & Size "KiB"
{
printf 'From: Anggota Tim <tim@pcpexpress.co.id>\nTo: %s\nSubject: Laporan Bulanan Tim\nDate: %s\nMessage-ID: <gs-attach@pcpexpress.co.id>\nMIME-Version: 1.0\n' "$U" "$NOW"
printf 'Content-Type: multipart/mixed; boundary="BND1"\n\n--BND1\nContent-Type: text/plain; charset=utf-8\n\nHalo, berikut laporan bulanan tim. Mohon ditinjau segera.\n\n--BND1\nContent-Type: application/pdf; name="laporan.pdf"\nContent-Disposition: attachment; filename="laporan.pdf"\nContent-Transfer-Encoding: base64\n\nJVBERi0xLjQKJcTl8uXrp/Og0MTGCjEgMCBvYmoKPDwvVHlwZS9DYXRhbG9nL1BhZ2VzIDIgMCBSPj4KZW5kb2JqCnRyYWlsZXIKPDwvUm9vdCAxIDAgUj4+CnN0YXJ0eHJlZgo4JSVFT0YK\n--BND1--\n'
} | docker exec -i "$DC" doveadm save -u "$U" -m INBOX 2>/dev/null
# b) Email 8 hari lalu (RelativeDate "dd-Mon-yy") + reply header
{
printf 'From: Finance <finance@pcpexpress.co.id>\nTo: %s\nSubject: Re: Laporan Bulanan Tim\nDate: %s\nMessage-ID: <gs-old@pcpexpress.co.id>\nIn-Reply-To: <gs-attach@pcpexpress.co.id>\n' "$U" "$DAY8"
printf 'X-Mailer: SuspiciousMailer 1.0\nMIME-Version: 1.0\nContent-Type: text/plain; charset=utf-8\n\nAct now! Your account will be suspended. Verify your account immediately: http://bit.ly/suspicious\n'
} | docker exec -i "$DC" doveadm save -u "$U" -m INBOX 2>/dev/null
# c) Email HTML 3 hari lalu (RelativeDate "Wednesday 14:xx")
{
printf 'From: Promo Store <promo@marketing.example>\nTo: %s\nSubject: Diskon 50%% semua produk!\nDate: %s\nMessage-ID: <gs-html@pcpexpress.co.id>\n' "$U" "$DAY3"
printf 'MIME-Version: 1.0\nContent-Type: text/html; charset=utf-8\n\n<html><body><h1>Diskon besar!</h1><p>Klik segera <a href="https://tinyurl.com/xyz">di sini</a>.</p></body></html>\n'
} | docker exec -i "$DC" doveadm save -u "$U" -m INBOX 2>/dev/null
# d) Email kemarin plain + karakter UTF-8 + alamat tanpa nama
{
printf 'From: noreply@servicedesk.example\nTo: %s\nSubject: Notifikasi tiket #4521 ditutup\nDate: %s\nMessage-ID: <gs-utf@pcpexpress.co.id>\nMIME-Version: 1.0\nContent-Type: text/plain; charset=utf-8\n\nTiket Anda ditutup. Terima kasih — tim kami (émoji: 🎫) mengucapkan selamat.\n' "$U" "$YEST"
} | docker exec -i "$DC" doveadm save -u "$U" -m INBOX 2>/dev/null
docker exec "$DC" doveadm force-resync -u "$U" mailbox INBOX >/dev/null 2>&1
echo "seeded, count: $(docker exec "$DC" doveadm search -u "$U" mailbox INBOX ALL | wc -l)"

echo "== 2. login =="
rm -f /tmp/gs.jar
CODE=$(curl -sk -c /tmp/gs.jar -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -H 'Accept: application/json' -d "{\"userName\":\"$U\",\"password\":\"$PW\"}" "https://$H/SOGo/connect")
echo "login: $CODE"; [ "$CODE" = "200" ] || { echo "LOGIN GAGAL — stop"; exit 1; }
XSRF=$(awk '$6=="XSRF-TOKEN" {print $7}' /tmp/gs.jar)

echo "== 3. capture folders (Mail/0/view) =="
curl -sk -b /tmp/gs.jar -H "X-XSRF-TOKEN: $XSRF" -H 'Accept: application/json' "https://$H/SOGo/so/$ENC/Mail/0/view" -o /tmp/golden-folders.json -w 'folders: %{http_code}\n'

echo "== 4. capture list INBOX (POST view, headers SPA) =="
BODY='{"sortby":"date","asc":0,"limit":50,"headers":[["To","hasAttachment","isFlagged","Subject","From","isRead","Priority","RelativeDate","Size","Flags","uid","isAnswered","isForwarded"]]}'
# SPALint: body SPA asli memakai format headers=[...]; lihat buildMessageViewBody
BODY='{"sortby":"date","asc":0,"limit":50,"headers":["To","hasAttachment","isFlagged","Subject","From","isRead","Priority","RelativeDate","Size","Flags","uid","isAnswered","isForwarded"]}'
curl -sk -b /tmp/gs.jar -H "X-XSRF-TOKEN: $XSRF" -H 'Content-Type: application/json' -H 'Accept: application/json' -d "$BODY" "https://$H/SOGo/so/$ENC/Mail/0/folderINBOX/view" -o /tmp/golden-list.json -w 'list: %{http_code}\n'

echo "== 5. capture detail uid teratas (ada lampiran) =="
TOP=$(python3 -c "
import json
d=json.load(open('/tmp/golden-list.json'))
rows=d.get('headers',[[],[]])[1:] if isinstance(d.get('headers'),list) else []
uids=[r[10] for r in rows if isinstance(r,list) and len(r)>10]
print(uids[0] if uids else '')
")
echo "top uid: $TOP"
curl -sk -b /tmp/gs.jar -H "X-XSRF-TOKEN: $XSRF" -H 'Accept: application/json' "https://$H/SOGo/so/$ENC/Mail/0/folderINBOX/$TOP/view" -o /tmp/golden-detail.json -w 'detail: %{http_code}\n'

echo "== 6. restore (expunge semua pesan + disable) =="
docker exec "$DC" doveadm expunge -u "$U" mailbox INBOX ALL 2>/dev/null
docker exec "$M" mysql -umailcow -p"$DBPASS" mailcow -N -e "UPDATE mailbox SET active='0' WHERE username='$U';" 2>/dev/null
echo "restored. count: $(docker exec "$DC" doveadm search -u "$U" mailbox INBOX ALL | wc -l)"
