#!/bin/bash
# deploy.sh — Build, commit, push & deploy SOGo Frontend ke production
# Usage:
#   ./deploy.sh                           # build + deploy (skip commit/push)
#   ./deploy.sh "feat(x): pesan commit"   # build + commit + push + deploy
#
# Prasyarat:
#   - GitLab credential tersimpan di macOS Keychain (sudah ada)
#   - SSH alias 'mailserver' mengarah ke 192.168.10.200 (sudah ada di ~/.ssh/config)
#   - SSH alias 'mail-tunnel' + dashboard/scripts/tunnel-ctl.sh utk fallback
#     (IP publik mailserver flapping/drop — tunnel MikroTik jadi jalur andal)
#   - NPM dependencies sudah diinstall

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$PROJECT_DIR/dist"
REMOTE_DIR="${REMOTE_DIR:-/data/docker-data/mailcow/data/web/webmail}"
NGINX_DIR="${NGINX_DIR:-/data/docker-data/mailcow/data/conf/nginx}"
NGINX_FILE="site.webmail.custom"
# SERVER: SSH alias tujuan. DEPLOY_SSH_HOST diprioritaskan (set DEPLOY_SSH_HOST=mail-tunnel
# utk pakai tunnel manual). Tanpa override: probe mailserver → auto-fallback tunnel.
SERVER="${SERVER:-${DEPLOY_SSH_HOST:-mailserver}}"
BRANCH="${BRANCH:-main}"
SOGO_API_PORT="${SOGO_API_PORT:-3005}"
WEBMAIL_URL="${WEBMAIL_URL:-https://mail.pcpexpress.co.id/webmail/}"
GITLAB_URL="https://${GITLAB_HOST:-gitlab.pcpexpress.com}/${GITLAB_PROJECT:-devops-team/mailcow-frontend}.git"
GITLAB_USER="${GITLAB_USER:-}"

# ── Tunnel MikroTik fallback (IP publik flapping) ─────────────────────────────
# Lokasi tunnel-ctl.sh: cari di project ini dulu, fallback ke dashboard (sibling).
TUNNEL_CTL="${TUNNEL_CTL:-}"
if [ -z "$TUNNEL_CTL" ]; then
    if [ -x "$PROJECT_DIR/scripts/tunnel-ctl.sh" ]; then
        TUNNEL_CTL="$PROJECT_DIR/scripts/tunnel-ctl.sh"
    elif [ -x "$PROJECT_DIR/../dashboard/scripts/tunnel-ctl.sh" ]; then
        TUNNEL_CTL="$PROJECT_DIR/../dashboard/scripts/tunnel-ctl.sh"
    fi
fi
TUNNEL_USED=0

# ── Environment Variables ─────────────────────────────────────────────────────
# SERVER         - SSH host (default: mailserver)
# REMOTE_DIR     - Remote deploy directory (default: /data/docker-data/mailcow/data/web/webmail)
# NGINX_DIR      - Remote nginx config directory (default: /data/docker-data/mailcow/data/conf/nginx)
# BRANCH         - Git branch (default: main)
# GITLAB_HOST    - GitLab host (default: gitlab.pcpexpress.com)
# GITLAB_PROJECT - GitLab project path (default: devops-team/mailcow-frontend)
# GITLAB_USER    - GitLab user (URL-encoded)
# WEBMAIL_URL    - URL for deploy verification (default: https://mail.pcpexpress.co.id/webmail/)
# SOGO_API_PORT  - Host port for sogo-smtp-proxy (default: 3005)
# VITE_API_KEY   - Optional local build key; otherwise read from mailserver .env

# ── Warna ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*"; }

# ── SSH dengan fallback tunnel MikroTik ────────────────────────────────────
ensure_ssh() {
    if [ -n "${DEPLOY_SSH_HOST:-}" ]; then
        info "DEPLOY_SSH_HOST diset — pakai $SERVER langsung (tunnel dikelola manual)."
        return 0
    fi
    if ssh -o ConnectTimeout=8 -o BatchMode=yes "$SERVER" 'true' 2>/dev/null; then
        ok "SSH ke $SERVER OK."
        return 0
    fi
    if [ -z "$TUNNEL_CTL" ] || [ ! -x "$TUNNEL_CTL" ]; then
        err "SSH langsung ke $SERVER gagal dan tunnel-ctl.sh tidak ditemukan."
        err "Cek ~/.ssh/config (mailserver/mail-tunnel) atau set DEPLOY_SSH_HOST."
        return 1
    fi
    warn "SSH langsung $SERVER gagal — pasang tunnel MikroTik (auto)..."
    if ! "$TUNNEL_CTL" on; then
        err "Tunnel gagal aktif. Perbaiki dulu: $TUNNEL_CTL on"
        return 1
    fi
    TUNNEL_USED=1
    SERVER="mail-tunnel"
    ok "SSH via tunnel: mail-tunnel."
}

cleanup_tunnel() {
    if [ "$TUNNEL_USED" = "1" ]; then
        info "Matikan tunnel MikroTik (auto-clean)..."
        "$TUNNEL_CTL" off >/dev/null 2>&1 || true
    fi
}
trap cleanup_tunnel EXIT

# ── Ambil GitLab token dari macOS Keychain ─────────────────────────────────
get_gitlab_token() {
    local gitlab_host="${GITLAB_HOST:-gitlab.pcpexpress.com}"
    security find-internet-password -s "$gitlab_host" -w 2>/dev/null
}

# ── Build ──────────────────────────────────────────────────────────────────
validate_config() {
    if ! [[ "$SOGO_API_PORT" =~ ^[0-9]+$ ]]; then
        err "SOGO_API_PORT harus berupa angka."
        exit 1
    fi
}

preflight_sogo_proxy() {
    info "Preflight SOGo SMTP proxy..."
    if ! ssh "$SERVER" "SOGO_API_PORT=$SOGO_API_PORT bash -s" <<'REMOTE_PREFLIGHT'
set -euo pipefail
api_key="$(awk -F= '/^API_KEY=/{print substr($0, index($0, "=") + 1); exit}' /home/anas.fikri/sogo-proxy/.env)"
[ -n "$api_key" ]
code="$(curl -sS -o /dev/null -w '%{http_code}' -H "X-Api-Key: $api_key" "http://127.0.0.1:${SOGO_API_PORT}/api/health" || true)"
[ "$code" = "200" ]
REMOTE_PREFLIGHT
    then
        err "SOGo SMTP proxy tidak sehat di $SERVER:$SOGO_API_PORT. Deploy dibatalkan; service production tidak diubah."
        exit 1
    fi
    ok "SOGo SMTP proxy sehat."
}

get_production_api_key() {
    if [ -n "${VITE_API_KEY:-}" ]; then
        printf '%s' "$VITE_API_KEY"
        return 0
    fi
    # Read only during build; never print or write the key to the repository.
    # Pakai heredoc (bukan string inline) agar quoting awk tidak rusak oleh shell.
    ssh "$SERVER" bash -s <<'REMOTE_KEY'
awk -F= '/^API_KEY=/{print substr($0, index($0, "=") + 1); exit}' /home/anas.fikri/sogo-proxy/.env
REMOTE_KEY
}

build() {
    info "Building Vite project..."
    cd "$PROJECT_DIR"
    local api_key
    api_key="$(get_production_api_key)"
    if [ -z "$api_key" ]; then
        err "VITE_API_KEY tidak tersedia. Set VITE_API_KEY atau pastikan API_KEY ada di $SERVER:/home/anas.fikri/sogo-proxy/.env."
        exit 1
    fi
    VITE_API_KEY="$api_key" \
        VITE_SOGO_BASE_URL="${VITE_SOGO_BASE_URL:-}" \
        npm run build
    unset api_key
    ok "Build selesai → dist/"
}

# ── Git commit + push ──────────────────────────────────────────────────────
git_commit_push() {
    local msg="$1"
    local token

    token=$(get_gitlab_token)
    if [ -z "$token" ]; then
        err "GitLab credential tidak ditemukan di Keychain."
        err "Jalankan: security add-internet-password -s gitlab.pcpexpress.com -w \"TOKEN_ANDA\""
        exit 1
    fi

    # Gunakan environment variable agar token tidak muncul di ps aux
    cd "$PROJECT_DIR"

    if git diff --quiet && git diff --cached --quiet && test -z "$(git status --porcelain)"; then
        info "Tidak ada perubahan untuk di-commit."
        return
    fi

    git add -A
    git commit -m "$msg"
    info "Push ke GitLab (branch: $BRANCH)..."
    export GIT_TOKEN="$token"
    git -c "credential.helper=!f() { echo 'username=${GITLAB_USER:-git}'; echo \"password=\$GIT_TOKEN\"; }; f" push origin "$BRANCH"
    unset GIT_TOKEN
    ok "Push selesai: $msg"
}

# ── Setup Nginx config (pertama kali) ──────────────────────────────────────
setup_nginx() {
    info "Pasang Nginx config (single source: configs/$NGINX_FILE)..."
    local nginx_config src_file
    src_file="$PROJECT_DIR/configs/$NGINX_FILE"
    [ -f "$src_file" ] || { err "Nginx config source tidak ditemukan: $src_file"; exit 1; }
    # Single source of truth = configs/site.webmail.custom. Port disubstitusi
    # dari SOGO_API_PORT (default 3005) agar tetap configurable saat deploy.
    nginx_config="$(sed "s/172\.25\.1\.1:3005/172.25.1.1:${SOGO_API_PORT}/g" "$src_file")"
    local nginx_path_q
    nginx_path_q=$(printf "'%s'" "${NGINX_DIR//\'/\'\\\'\'}/$NGINX_FILE")
    printf '%s\n' "$nginx_config" | ssh "$SERVER" "cat > $nginx_path_q"
    ok "Nginx config diperbarui."
}

# ── Deploy ke server ───────────────────────────────────────────────────────
deploy() {
    info "Buat direktori remote jika belum ada..."
    local remote_dir_q
    remote_dir_q=$(printf "'%s'" "${REMOTE_DIR//\'/\'\\\'\'}")
    ssh "$SERVER" "mkdir -p -- $remote_dir_q"

    info "Sync dist/ ke server..."
    rsync -av --delete "$DIST_DIR/" "${SERVER}:${REMOTE_DIR}/"
    ok "Sync selesai."

    setup_nginx

    info "Restart Nginx Mailcow..."
    ssh "$SERVER" "docker exec mailcow-nginx-mailcow-1 nginx -s reload" 2>/dev/null \
        || ssh "$SERVER" "docker restart mailcow-nginx-mailcow-1"
    ok "Nginx reloaded."
}

# ── Deploy backend (server.js SMTP proxy) ──────────────────────────────────
# server.js + modul lokal yang di-import (src/lib/*.js) berjalan sebagai
# systemd user service `sogo-smtp-proxy` di $REMOTE_BACKEND_DIR. deploy.sh
# sebelumnya TIDAK men-sync ini — backend bisa kedaluwarsa meski frontend live.
REMOTE_BACKEND_DIR="${REMOTE_BACKEND_DIR:-/home/anas.fikri/sogo-proxy}"
BACKEND_LIB_FILES="src/lib/ssrfGuard.js src/lib/emailValidation.js src/lib/smtpCookie.js src/lib/remoteImage.js"

deploy_backend() {
    info "Deploy backend (server.js + src/lib) ke $SERVER:$REMOTE_BACKEND_DIR..."
    local remote_dir_q
    remote_dir_q=$(printf "'%s'" "${REMOTE_BACKEND_DIR//\'/\'\\\'\'}")

    # Deteksi perubahan: hanya sync+restart kalau file backend benar-benar beda.
    # Restart sogo-smtp-proxy menjatuhkan sesi SMTP in-memory (smtpToken), jadi
    # hindari restart pada deploy yang murni frontend.
    local local_hash remote_hash
    local_hash=$(md5sum server.js $BACKEND_LIB_FILES 2>/dev/null | md5sum | awk '{print $1}')
    remote_hash=$(ssh "$SERVER" "cd ${remote_dir_q} && md5sum server.js $BACKEND_LIB_FILES 2>/dev/null | md5sum | awk '{print \$1}'")

    if [ "$local_hash" = "$remote_hash" ]; then
        ok "Backend tidak berubah — skip sync + restart."
        return 0
    fi

    # Backup server.js sebelum menimpa (rollback cepat bila perlu).
    local backup_name="server.js.bak-\$(date +%Y%m%d)"
    ssh "$SERVER" "cp -p ${remote_dir_q}/server.js ${remote_dir_q}/${backup_name}"

    ssh "$SERVER" "mkdir -p -- ${remote_dir_q}/src/lib"
    rsync -av server.js "${SERVER}:${REMOTE_BACKEND_DIR}/server.js"
    rsync -av $BACKEND_LIB_FILES "${SERVER}:${REMOTE_BACKEND_DIR}/src/lib/"

    info "Cek sintaks server.js di remote..."
    ssh "$SERVER" "cd ${remote_dir_q} && node --check server.js"

    info "Restart sogo-smtp-proxy (user service)..."
    ssh "$SERVER" "systemctl --user restart sogo-smtp-proxy"
    ok "Backend selesai + sogo-smtp-proxy direstart."
}

# ── Verify ─────────────────────────────────────────────────────────────────
# Host webmail diambil dari WEBMAIL_URL (default mail.pcpexpress.co.id).
webmail_host() {
    printf '%s' "$WEBMAIL_URL" | sed -E 's#^[a-zA-Z]+://([^/:]+).*#\1#'
}

verify() {
    local webmail_url="$WEBMAIL_URL"
    local host
    host="$(webmail_host)"
    info "Verifikasi akses webmail (via 127.0.0.1, bebas DNS publik/hairpin)..."
    local http_code
    local webmail_url_q
    webmail_url_q=$(printf "'%s'" "${webmail_url//\'/\'\\\'\'}")
    # --resolve memaksa koneksi ke nginx lokal — tidak bergantung pada A record
    # publik (sedang migrasi IP) maupun hairpin NAT di firewall.
    http_code=$(ssh "$SERVER" "curl -sk --resolve ${host}:443:127.0.0.1 -o /dev/null -w '%{http_code}' -- $webmail_url_q")
    if [ "$http_code" = "200" ]; then
        ok "Webmail siap: $webmail_url (HTTP $http_code)"
    else
        err "Webmail mengembalikan HTTP $http_code — cek konfigurasi."
    fi

    verify_image_proxy "$host"
}

verify_image_proxy() {
    local host="$1"
    info "Verifikasi /api/image-proxy (route + SSRF guard)..."
    local code_ssrf
    local url_ssrf="https://${host}/api/image-proxy?url=http%3A%2F%2F127.0.0.1%2Fx.png"
    # URL internal (127.0.0.1) WAJIB ditolak 403 oleh SSRF guard — membuktikan
    # route nginx tersambung ke backend DAN guard aktif. Deterministik, tanpa
    # bergantung pada koneksi internet keluar server.
    code_ssrf=$(ssh "$SERVER" "curl -sk --resolve ${host}:443:127.0.0.1 -o /dev/null -w '%{http_code}' -- '$url_ssrf'")
    if [ "$code_ssrf" = "403" ]; then
        ok "/api/image-proxy terpasang + SSRF guard aktif (internal IP → 403)."
    else
        err "/api/image-proxy internal IP → HTTP $code_ssrf (harap 403). Route/guard bermasalah."
    fi

    # Smoke test gambar eksternal (non-fatal: tergantung koneksi keluar server).
    local code_img ctype
    local url_img="https://${host}/api/image-proxy?url=https%3A%2F%2Fwww.google.com%2Fimages%2Fbranding%2Fgooglelogo%2F1x%2Fgooglelogo_color_272x92dp.png"
    local result
    result=$(ssh "$SERVER" "curl -sk --max-time 15 --resolve ${host}:443:127.0.0.1 -o /dev/null -w '%{http_code} %{content_type}' -- '$url_img'")
    code_img="${result%% *}"
    ctype="${result#* }"
    if [ "$code_img" = "200" ] && [[ "$ctype" == image/* ]]; then
        ok "Proxy gambar eksternal OK (200 $ctype)."
    else
        warn "Proxy gambar eksternal → HTTP $code_img ($ctype). Cek koneksi keluar server bila tracking-pixel tidak tampil."
    fi
}

# ── Main ────────────────────────────────────────────────────────────────────
main() {
    local commit_msg="$1"

    echo ""
    echo "╔══════════════════════════════════════════╗"
    echo "║  SOGo Frontend — Build & Deploy          ║"
    echo "╚══════════════════════════════════════════╝"
    echo ""

    ensure_ssh || exit 1
    validate_config
    preflight_sogo_proxy
    build

    if [ -n "$commit_msg" ]; then
        echo ""
        git_commit_push "$commit_msg"
    else
        info "Skip commit/push (tidak ada pesan commit)."
    fi

    echo ""
    deploy

    echo ""
    deploy_backend

    echo ""
    verify

    echo ""
    ok "Deploy selesai! 🚀"
}

main "$@"
