#!/bin/bash
# Golden-sample capture Calendar + Contacts — respons SOGo produksi ASLI.
# Replikasi flow SPA: login JSON {userName} → newguid → saveAsContact (guid),
# newguid+saveAsAppointment (event recurring), capture view/eventsblocks/detail.
# Output: /tmp/golden-contacts2.json, /tmp/golden-calendar.json, /tmp/golden-event-detail.json
# Regenerate fixture: scp hasil ke scripts/fixtures/ (rename contacts-golden-view.json,
# calendar-golden-eventsblocks.json, calendar-golden-event-detail.json).
set -u
U=diag2@pcpexpress.co.id
PW='DiagTest123!'
H=mail.pcpexpress.co.id
ENC=$(python3 -c "import urllib.parse;print(urllib.parse.quote('$U', safe=''))")
M=$(docker ps --format '{{.Names}}' | grep -Ei 'mysql|maria' | head -1)
F=$(find /data /root /home -maxdepth 4 -name 'mailcow.conf' 2>/dev/null | head -1)
source "$F" 2>/dev/null
docker exec "$M" mysql -umailcow -p"$DBPASS" mailcow -N -e "UPDATE mailbox SET active='1' WHERE username='$U';" 2>/dev/null
docker exec "$M" mysql -umailcow -p"$DBPASS" mailcow -N -e "UPDATE sogo_view SET c_password='{PLAIN}$PW' WHERE c_uid='$U';" 2>/dev/null
docker exec "$M" mysql -umailcow -p"$DBPASS" mailcow -N -e "REPLACE INTO _sogo_static_view (c_uid, domain, c_name, c_password, c_cn, mail, aliases, ad_aliases, kind, multiple_bookings, quota) SELECT c_uid, domain, c_name, c_password, c_cn, mail, aliases, ad_aliases, kind, multiple_bookings, quota FROM sogo_view WHERE c_uid='$U';" 2>/dev/null
docker restart memcached-mailcow >/dev/null 2>&1; sleep 2
rm -f /tmp/gcc.jar
CODE=$(curl -sk -c /tmp/gcc.jar -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -H 'Accept: application/json' -d "{\"userName\":\"$U\",\"password\":\"$PW\"}" "https://$H/SOGo/connect")
echo "login: $CODE"; [ "$CODE" = "200" ] || exit 1
XSRF=$(awk '$6=="XSRF-TOKEN" {print $7}' /tmp/gcc.jar)

# Kontak via guid flow (bukan _new_ — terbukti data loss)
RAW=$(curl -sk -b /tmp/gcc.jar -H "X-XSRF-TOKEN: $XSRF" -H 'Accept: application/json' "https://$H/SOGo/so/$ENC/Contacts/personal/newguid")
CGUID=$(echo "$RAW" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
curl -sk -b /tmp/gcc.jar -H "X-XSRF-TOKEN: $XSRF" -H 'Content-Type: application/json' \
  -d '{"c_component":"vcard","c_cn":"Golden Sample Kontak","c_mail":"golden.sample@pcpexpress.co.id","emails":[{"type":"pref","value":"golden.sample@pcpexpress.co.id"}],"phones":[{"type":"work","value":"+62-21-555-0199"}],"c_telephonenumber":"+62-21-555-0199","c_sn":"Sample","c_givenname":"Golden","c_screenname":"","c_categories":null}' \
  "https://$H/SOGo/so/$ENC/Contacts/personal/$CGUID/saveAsContact" -o /dev/null -w "contact save: %{http_code}\n"
curl -sk -b /tmp/gcc.jar -H "X-XSRF-TOKEN: $XSRF" -H 'Accept: application/json' \
  "https://$H/SOGo/so/$ENC/Contacts/personal/view" -o /tmp/golden-contacts2.json -w "contacts view: %{http_code}\n"

# Event recurring harian (3 occurrence)
EGUID_RAW=$(curl -sk -b /tmp/gcc.jar -H "X-XSRF-TOKEN: $XSRF" -H 'Accept: application/json' "https://$H/SOGo/so/$ENC/Calendar/personal/newguid")
EGUID=$(echo "$EGUID_RAW" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('id',d) if isinstance(d,dict) else d)")
START=$(date -d tomorrow +%F)
python3 - "$START" > /tmp/gcc-evt.json <<'PY'
import json, sys
d = sys.argv[1]
print(json.dumps({"summary":"Golden Rapat Harian","location":"Ruang Golden","comment":"Uji golden sample kalender","classification":"public","isAllDay":False,"startDate":d,"endDate":d,"startTime":"10:00","endTime":"11:00","attendees":[{"email":"tim@pcpexpress.co.id","name":"tim@pcpexpress.co.id","role":"REQ-PARTICIPANT","partstat":"NEEDS-ACTION"}],"repeat":{"frequency":"daily","interval":1,"count":3}}))
PY
curl -sk -b /tmp/gcc.jar -H "X-XSRF-TOKEN: $XSRF" -H 'Content-Type: application/json' -d @/tmp/gcc-evt.json \
  "https://$H/SOGo/so/$ENC/Calendar/personal/$EGUID/saveAsAppointment" -o /dev/null -w "event save: %{http_code}\n"
S=$(date -d '-7 days' +%s); E=$(date -d '+30 days' +%s)
curl -sk -b /tmp/gcc.jar -H "X-XSRF-TOKEN: $XSRF" -H 'Accept: application/json' \
  "https://$H/SOGo/so/$ENC/Calendar/eventsblocks?startDate=$S&endDate=$E" -o /tmp/golden-calendar.json -w "eventsblocks: %{http_code}\n"
curl -sk -b /tmp/gcc.jar -H "X-XSRF-TOKEN: $XSRF" -H 'Accept: application/json' \
  "https://$H/SOGo/so/$ENC/Calendar/personal/$EGUID/view" -o /tmp/golden-event-detail.json -w "event detail: %{http_code}\n"

# Cleanup
curl -sk -b /tmp/gcc.jar -H "X-XSRF-TOKEN: $XSRF" "https://$H/SOGo/so/$ENC/Calendar/personal/$EGUID/delete" -o /dev/null -w "del event: %{http_code}\n"
curl -sk -b /tmp/gcc.jar -H "X-XSRF-TOKEN: $XSRF" "https://$H/SOGo/so/$ENC/Contacts/personal/$CGUID/delete" -o /dev/null -w "del contact: %{http_code}\n"
docker exec "$M" mysql -umailcow -p"$DBPASS" mailcow -N -e "UPDATE mailbox SET active='0' WHERE username='$U';" 2>/dev/null
rm -f /tmp/gcc.jar /tmp/gcc-evt.json
echo "selesai — ambil hasil: scp deploy-mail:'/tmp/golden-*.json' scripts/fixtures/"
