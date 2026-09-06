#!/bin/bash
# e2e-browser-runner.sh — jalankan SEMUA browser E2E dgn otomatisasi akun diag.
#
#   scripts/e2e-browser-runner.sh [contacts|calendar|mail|notjunk|capture|spaced|all]  (default: all)
#   SERVER=deploy-mail scripts/e2e-browser-runner.sh
#
# Lifecycle:
#   1. Preflight: node + puppeteer tersedia.
#   2. ENABLE diag2 di server (mailbox aktif + row _sogo_static_view dgn hash
#      asli + flush memcached) + seed email pembanding "kemarin 21:38" utk
#      asersi sort di mail E2E.
#   3. Jalankan test terpilih (node scripts/e2e-*-browser.mjs).
#   4. CLEANUP dijamin jalan (trap EXIT): expunge INBOX + disable diag2 —
#      walau test gagal di tengah.
#
# Catatan:
# - Leftover kontak/event dibersihkan oleh pre-cleanup idempoten di dalam
#   masing-masing E2E (butuh session browser SOGo; tak bisa dari SSH murni).
# - SKIP_ENABLE=1: lewati langkah server (diag sudah aktif; comparer mungkin
#   tidak ada → asersi sort mail E2E berjalan dalam mode degradasi).
set -u

SERVER="${SERVER:-deploy-mail}"
SELECT="${1:-all}"
U='diag2@pcpexpress.co.id'

log()  { echo "[runner] $*"; }
fail() { echo "[runner] ❌ $*" >&2; exit 1; }

command -v node >/dev/null || fail "node tidak ditemukan"
[ -d node_modules/puppeteer ] || fail "puppeteer belum ada (npm install dulu)"
case "$SELECT" in contacts|calendar|mail|notjunk|capture|spaced|flagcolor|draft|all) ;; *) fail "pilihan: contacts|calendar|mail|notjunk|capture|spaced|flagcolor|draft|all" ;; esac

remote() { ssh -o ConnectTimeout=15 "$SERVER" 'bash -s'; }

CLEANED=0
cleanup() {
  [ "$CLEANED" = "1" ] && return
  CLEANED=1
  log "cleanup: expunge INBOX diag2 + disable akun..."
  remote <<'REMOTE'
F=$(find /data /root /home -maxdepth 4 -name 'mailcow.conf' 2>/dev/null | head -1)
[ -n "$F" ] && source "$F" 2>/dev/null
DC=$(docker ps --format '{{.Names}}' | grep -Ei 'dovecot' | head -1)
M=$(docker ps --format '{{.Names}}' | grep -Ei 'mysql|maria' | head -1)
U='diag2@pcpexpress.co.id'
docker exec "$DC" doveadm expunge -u "$U" mailbox INBOX ALL 2>/dev/null
docker exec "$DC" doveadm expunge -u "$U" mailbox Junk ALL 2>/dev/null
docker exec "$DC" doveadm expunge -u "$U" mailbox Archive ALL 2>/dev/null
docker exec "$DC" doveadm expunge -u "$U" mailbox Sent ALL 2>/dev/null
if [ -n "${DBPASS:-}" ]; then
  docker exec "$M" mysql -umailcow -p"$DBPASS" mailcow -N -e "UPDATE mailbox SET active='0' WHERE username='$U';" 2>/dev/null
else
  echo "WARN: DBPASS kosong — diag2 tidak di-disable"
fi
echo "INBOX count: $(docker exec "$DC" doveadm search -u "$U" mailbox INBOX ALL 2>/dev/null | wc -l)"
REMOTE
  log "cleanup selesai"
}
trap cleanup EXIT

if [ "${SKIP_ENABLE:-0}" != "1" ]; then
  log "enable diag2 + seed pembanding di $SERVER..."
  # Subjek unik utk email uji flagcolor — diteruskan ke dalam remote via env
  # (heredoc tetap quoted; variabel di-expand oleh bash remote).
  FC_SUBJ="E2E FlagColor $(date +%s)"
  ssh -o ConnectTimeout=15 "$SERVER" "FC_SUBJ='$FC_SUBJ' bash -s" <<'REMOTE' || fail "enable diag2 gagal"
F=$(find /data /root /home -maxdepth 4 -name 'mailcow.conf' 2>/dev/null | head -1)
[ -n "$F" ] && source "$F" 2>/dev/null
DC=$(docker ps --format '{{.Names}}' | grep -Ei 'dovecot' | head -1)
M=$(docker ps --format '{{.Names}}' | grep -Ei 'mysql|maria' | head -1)
U='diag2@pcpexpress.co.id'
PW='DiagTest123!'
# Infra ini: _sogo_static_view = TABEL FISIK (bukan view) — SOGo auth langsung
# ke situ dgn hash BLF-CRYPT asli dari mailbox.password. Row per mailbox WAJIB
# ada; tanpa itu login 403 walau mailbox aktif (kasus nyata 2026-09-04).
# Idempoten: ON DUPLICATE KEY UPDATE. Cron */5 men sync password utk row yg ada.
docker exec "$M" mysql -umailcow -p"$DBPASS" mailcow -N -e "UPDATE mailbox SET active='1' WHERE username='$U';" 2>/dev/null
# Reset password agar E2E selalu memakai $PW (doveadm pw format BLF-CRYPT
# dgn prefix {BLF-CRYPT} = format asli mailbox.password mailcow). Tanpa ini,
# eksperimen/run sebelumnya yang mengubah hash (mis. reset-password E2E)
# akan membuat login 403 diam-diam.
H=$(docker exec "$DC" doveadm pw -s BLF-CRYPT -p "$PW" 2>/dev/null)
if [ -n "$H" ]; then
  docker exec "$M" mysql -umailcow -p"$DBPASS" mailcow -N -e "UPDATE mailbox SET password='$H' WHERE username='$U' AND active='1';" 2>/dev/null
fi
docker exec "$M" mysql -umailcow -p"$DBPASS" mailcow -N -e "INSERT INTO _sogo_static_view (c_uid, domain, c_name, c_password, c_cn, mail, aliases, ad_aliases, ext_acl, kind, multiple_bookings) SELECT m.username, m.domain, m.username, m.password, m.name, m.username, '', '', '', m.kind, m.multiple_bookings FROM mailbox m WHERE m.username='$U' AND m.active='1' ON DUPLICATE KEY UPDATE c_password=VALUES(c_password), c_cn=VALUES(c_cn), mail=VALUES(mail), kind=VALUES(kind), multiple_bookings=VALUES(multiple_bookings), domain=VALUES(domain), c_name=VALUES(c_name);" 2>/dev/null
docker exec "$M" mysql -umailcow -p"$DBPASS" mailcow -N -e "DELETE FROM _sogo_static_view WHERE c_uid NOT IN (SELECT username FROM mailbox WHERE active='1');" 2>/dev/null
docker exec mailcow-memcached-mailcow-1 sh -c 'echo flush_all | nc 127.0.0.1 11211' >/dev/null 2>&1; sleep 2
# Pembanding "kemarin 21:38" utk asersi sort mail E2E (regresi bug RelativeDate).
# WAJIB: subjek mengandung "Yesterday" — asersi E2E mencari /Yesterday/i pada
# TEKS SUBJEK baris (bukan tanggal). Subjek Indonesia → asersi degradasi.
# Aman dijalankan berulang — Message-ID unik per run; dibersihkan oleh expunge
# di cleanup.
{
printf 'From: Pembanding E2E <comparer@pcpexpress.co.id>\nTo: %s\nSubject: E2E Yesterday Comparer\nDate: %s\nMessage-ID: <e2e-comparer-%s@pcpexpress.co.id>\nMIME-Version: 1.0\nContent-Type: text/plain; charset=utf-8\n\nEmail pembanding utk asersi sort E2E.\n' "$U" "$(date -d 'yesterday 21:38' -R)" "$(date +%s)"
} | docker exec -i "$DC" doveadm save -u "$U" -m INBOX 2>/dev/null
# Email uji flagcolor (diarsipkan/dibersihkan E2E itu sendiri; expunge cleanup
# runner juga menghapus bila tersisa)
{
printf 'From: Pembanding E2E <comparer@pcpexpress.co.id>\nTo: %s\nSubject: %s\nDate: %s\nMessage-ID: <e2e-flagcolor-%s@pcpexpress.co.id>\nMIME-Version: 1.0\nContent-Type: text/plain; charset=utf-8\n\nEmail uji flag-color E2E.\n' "$U" "$FC_SUBJ" "$(date -R)" "$(date +%s)"
} | docker exec -i "$DC" doveadm save -u "$U" -m INBOX 2>/dev/null
docker exec "$DC" doveadm force-resync -u "$U" mailbox INBOX >/dev/null 2>&1
echo "enable OK — INBOX count: $(docker exec "$DC" doveadm search -u "$U" mailbox INBOX ALL 2>/dev/null | wc -l)"
REMOTE
  export E2E_FC_SUBJECT="$FC_SUBJ"
else
  log "SKIP_ENABLE=1 — asumsi diag2 sudah aktif (comparer mungkin tidak ada → asersi sort mail E2E degradasi)"
fi

case "$SELECT" in
  all) TESTS=(contacts calendar mail notjunk capture spaced flagcolor draft) ;;
  *)   TESTS=("$SELECT") ;;
esac
declare -A SCRIPT=(
  [contacts]=scripts/e2e-contact-browser.mjs
  [calendar]=scripts/e2e-calendar-browser.mjs
  [mail]=scripts/e2e-mail-browser.mjs
  [notjunk]=scripts/e2e-notjunk-browser.mjs
  [capture]=scripts/e2e-contact-capture-browser.mjs
  [spaced]=scripts/e2e-spaced-folder-browser.mjs
  [flagcolor]=scripts/e2e-flagcolor-browser.mjs
  [draft]=scripts/e2e-draft-attachments-browser.mjs
)

FAILED=""
for t in "${TESTS[@]}"; do
  log "════════ E2E: $t ════════"
  if node "${SCRIPT[$t]}"; then
    log "✅ $t PASS"
  else
    log "❌ $t FAIL"
    FAILED="$FAILED $t"
  fi
done

cleanup

if [ -n "$FAILED" ]; then
  fail "E2E gagal:$FAILED"
fi
log "✅ semua E2E browser PASS (${TESTS[*]})"
