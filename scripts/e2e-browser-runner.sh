#!/bin/bash
# e2e-browser-runner.sh — jalankan SEMUA browser E2E dgn otomatisasi akun diag.
#
#   scripts/e2e-browser-runner.sh [contacts|calendar|mail|all]   (default: all)
#   SERVER=deploy-mail scripts/e2e-browser-runner.sh
#
# Lifecycle:
#   1. Preflight: node + puppeteer tersedia.
#   2. ENABLE diag2 di server (mailbox aktif + password statis + flush memcached)
#      + seed email pembanding "kemarin 21:38" utk asersi sort di mail E2E.
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
case "$SELECT" in contacts|calendar|mail|all) ;; *) fail "pilihan: contacts|calendar|mail|all" ;; esac

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
  remote <<'REMOTE' || fail "enable diag2 gagal"
F=$(find /data /root /home -maxdepth 4 -name 'mailcow.conf' 2>/dev/null | head -1)
[ -n "$F" ] && source "$F" 2>/dev/null
DC=$(docker ps --format '{{.Names}}' | grep -Ei 'dovecot' | head -1)
M=$(docker ps --format '{{.Names}}' | grep -Ei 'mysql|maria' | head -1)
U='diag2@pcpexpress.co.id'
PW='DiagTest123!'
docker exec "$M" mysql -umailcow -p"$DBPASS" mailcow -N -e "UPDATE mailbox SET active='1' WHERE username='$U';" 2>/dev/null
docker exec "$M" mysql -umailcow -p"$DBPASS" mailcow -N -e "UPDATE sogo_view SET c_password='{PLAIN}$PW' WHERE c_uid='$U';" 2>/dev/null
docker exec "$M" mysql -umailcow -p"$DBPASS" mailcow -N -e "REPLACE INTO _sogo_static_view (c_uid, domain, c_name, c_password, c_cn, mail, aliases, ad_aliases, kind, multiple_bookings, quota) SELECT c_uid, domain, c_name, c_password, c_cn, mail, aliases, ad_aliases, kind, multiple_bookings, quota FROM sogo_view WHERE c_uid='$U';" 2>/dev/null
docker exec "$M" mysql -umailcow -p"$DBPASS" mailcow -N -e "UPDATE _sogo_static_view SET c_password='{PLAIN}$PW' WHERE c_uid='$U';" 2>/dev/null
docker restart memcached-mailcow >/dev/null 2>&1; sleep 2
# Pembanding "kemarin 21:38" utk asersi sort mail E2E (regresi bug RelativeDate).
# Aman dijalankan berulang — Message-ID unik per run; dibersihkan oleh expunge
# di cleanup.
{
printf 'From: Pembanding E2E <comparer@pcpexpress.co.id>\nTo: %s\nSubject: E2E Pembanding Kemarin\nDate: %s\nMessage-ID: <e2e-comparer-%s@pcpexpress.co.id>\nMIME-Version: 1.0\nContent-Type: text/plain; charset=utf-8\n\nEmail pembanding utk asersi sort E2E.\n' "$U" "$(date -d 'yesterday 21:38' -R)" "$(date +%s)"
} | docker exec -i "$DC" doveadm save -u "$U" -m INBOX 2>/dev/null
docker exec "$DC" doveadm force-resync -u "$U" mailbox INBOX >/dev/null 2>&1
echo "enable OK — INBOX count: $(docker exec "$DC" doveadm search -u "$U" mailbox INBOX ALL 2>/dev/null | wc -l)"
REMOTE
else
  log "SKIP_ENABLE=1 — asumsi diag2 sudah aktif (comparer mungkin tidak ada → asersi sort mail E2E degradasi)"
fi

case "$SELECT" in
  all) TESTS=(contacts calendar mail) ;;
  *)   TESTS=("$SELECT") ;;
esac
declare -A SCRIPT=(
  [contacts]=scripts/e2e-contact-browser.mjs
  [calendar]=scripts/e2e-calendar-browser.mjs
  [mail]=scripts/e2e-mail-browser.mjs
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
