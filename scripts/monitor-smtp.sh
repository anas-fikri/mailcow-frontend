#!/usr/bin/env bash
# Monitor SMTP proxy (sogo-smtp-proxy): health probe + 401-rate untuk deteksi
# idle timeout yang terlalu pendek. Cron-friendly — exit code:
#   0 = OK
#   1 = health tidak OK
#   2 = 401 rate melebihi ambang (idle mungkin terlalu pendek)
#
# Usage:
#   ./scripts/monitor-smtp.sh                # output human-readable
#   ./scripts/monitor-smtp.sh --json         # output JSON (untuk alerting)
#   ./scripts/monitor-smtp.sh --since 24h    # window journalctl (default 1d)
#
# Naik idle via .env:  EXPECTED_SMTP_SESSION_IDLE_MIN=90 ./deploy.sh
# lalu restart sogo-smtp-proxy:  ssh deploy-mail 'systemctl --user restart sogo-smtp-proxy'

set -e

SERVER="${SERVER:-deploy-mail}"
API_PORT="${API_PORT:-3005}"
PROXY_DIR="${PROXY_DIR:-/home/anas.fikri/sogo-proxy}"
SINCE="${SINCE:-1 day ago}"
WARN_RATIO="${WARN_RATIO:-0.20}"   # 401/registrations > 20% → warning
CRIT_RATIO="${CRIT_RATIO:-0.50}"   # > 50% → critical

JSON=0
for arg in "$@"; do
    case "$arg" in
        --json)   JSON=1 ;;
        --since=*) SINCE="${arg#--since=}" ;;
        --since)  shift; SINCE="${1:-1 day ago}" ;;
        --warn=*)  WARN_RATIO="${arg#--warn=}" ;;
        --crit=*)  CRIT_RATIO="${arg#--crit=}" ;;
        -h|--help)
            sed -n '2,21p' "$0"; exit 0 ;;
    esac
done

# ── 1. Health probe (selalu lewat SSH biar konsisten dgn log analysis) ─────
probe=$(timeout 5 ssh -o BatchMode=yes "$SERVER" "
    api_key=\$(awk -F= '/^API_KEY=/{print substr(\$0, index(\$0, \"=\") + 1); exit}' $PROXY_DIR/.env)
    curl -sS -o /dev/null -w '%{http_code}' -H \"X-Api-Key: \$api_key\" \
        \"http://127.0.0.1:$API_PORT/api/health\"
" 2>/dev/null || echo "000")
health_status="$probe"

# ── 2. Log analysis (1d window) ────────────────────────────────────────────
log_cmd="journalctl --user -u sogo-smtp-proxy --no-pager --since='$SINCE'"
read_logs=$(timeout 5 ssh -o BatchMode=yes "$SERVER" "$log_cmd" 2>/dev/null || true)
regs=$(printf '%s' "$read_logs" | grep -c "Registered for" 2>/dev/null || true)
regs="${regs:-0}"
errs_401=$(printf '%s' "$read_logs" | grep -c "401 send" 2>/dev/null || true)
errs_401="${errs_401:-0}"

# Jangan bagi dengan 0
ratio=$(awk -v e="$errs_401" -v r="$regs" 'BEGIN { if (r+0 == 0) print 0; else printf "%.4f", e/r }')

# ── 3. Status ──────────────────────────────────────────────────────────────
status="OK"
exit_code=0
if [ "$health_status" != "200" ]; then
    status="UNHEALTHY"
    exit_code=1
fi
crit_thr=$(awk -v r="$ratio" -v t="$CRIT_RATIO" 'BEGIN { print (r+0 > t+0) ? 1 : 0 }')
warn_thr=$(awk -v r="$ratio" -v t="$WARN_RATIO" 'BEGIN { print (r+0 > t+0) ? 1 : 0 }')
if [ "$crit_thr" = "1" ]; then
    status="CRITICAL"
    exit_code=2
elif [ "$warn_thr" = "1" ] && [ "$status" = "OK" ]; then
    status="WARNING"
fi

# ── 4. Output ──────────────────────────────────────────────────────────────
if [ "$JSON" = "1" ]; then
    cat <<EOF
{"status":"$status","window":"$SINCE","health_status":$health_status,
 "registrations":$regs,"send_401":$errs_401,"ratio":$ratio,
 "warn_threshold":$WARN_RATIO,"crit_threshold":$CRIT_RATIO}
EOF
else
    printf '── SMTP Proxy Monitor ──\n'
    printf '  Window         : %s\n' "$SINCE"
    printf '  Health         : %s\n' "$health_status"
    printf '  Registrations  : %s\n' "$regs"
    printf '  401 send count : %s\n' "$errs_401"
    printf '  401 ratio      : %s (warn=%s crit=%s)\n' "$ratio" "$WARN_RATIO" "$CRIT_RATIO"
    printf '  Status         : %s\n' "$status"
    if [ "$status" != "OK" ]; then
        printf '\n  Saran:\n'
        if [ "$status" = "CRITICAL" ] || [ "$status" = "WARNING" ]; then
            printf '    - Idle timeout mungkin kependekan. Naikkan via:\n'
            printf '      EXPECTED_SMTP_SESSION_IDLE_MIN=90 ./deploy.sh\n'
            printf '    - Atau tambahkan heartbeat supaya lastUsed refresh.\n'
        fi
        if [ "$status" = "UNHEALTHY" ]; then
            printf '    - Service unhealthy: ssh %s "systemctl --user status sogo-smtp-proxy"\n' "$SERVER"
        fi
    fi
fi

exit $exit_code
