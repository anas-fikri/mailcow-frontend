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
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
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
        VITE_SOGO_BASE_URL="${VITE_SOGO_BASE_URL:-https://mail.pcpexpress.co.id}" \
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

    # URL encode the password (pakai python3 biar aman semua karakter)
    local encoded_pass
    encoded_pass=$(GITLAB_TOKEN="$token" python3 -c 'import os, urllib.parse; print(urllib.parse.quote(os.environ["GITLAB_TOKEN"], safe=""))')

    local git_url="https://${GITLAB_USER}:${encoded_pass}@${GITLAB_HOST:-gitlab.pcpexpress.com}/${GITLAB_PROJECT:-devops-team/mailcow-frontend}.git"

    cd "$PROJECT_DIR"

    # Cek apakah ada perubahan
    if git diff --quiet && git diff --cached --quiet && test -z "$(git status --porcelain)"; then
        info "Tidak ada perubahan untuk di-commit."
        return
    fi

    git add -A
    git commit -m "$msg"
    info "Push ke GitLab (branch: $BRANCH)..."
    git push "$git_url" "$BRANCH"
    ok "Push selesai: $msg"
}

# ── Setup Nginx config (pertama kali) ──────────────────────────────────────
setup_nginx() {
    info "Pasang Nginx config..."
    local nginx_config
    nginx_config=$(cat <<NGINX_EOF
# site.webmail.custom — SOGo React Frontend (auto-deployed)
# CSP: SPA murni tanpa inline script; email-body pakai inline style (unsafe-inline style)
# dan Google Fonts. connect-src 'self' cukup karena SOGo & /api dilayani origin yang sama.
location /webmail {
    root /web;
    index index.html;
    try_files \$uri \$uri/ /webmail/index.html;

    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; base-uri 'self'; form-action 'self'; frame-ancestors 'none';" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location ~* \.html$ {
        add_header Cache-Control "no-store, no-cache, must-revalidate";
        add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; base-uri 'self'; form-action 'self'; frame-ancestors 'none';" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "DENY" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        expires -1;
    }

    location ~* \.(css|js|woff2?|svg|gif|png|jpe?g|ico)$ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; base-uri 'self'; form-action 'self'; frame-ancestors 'none';" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "DENY" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    }
}

# Exact locations must win over Control Tower's broader /api regex routes.
location = /api/health {
    proxy_pass http://172.25.1.1:${SOGO_API_PORT};
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 120s;
}
location = /api/auth/smtp {
    proxy_pass http://172.25.1.1:${SOGO_API_PORT};
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 120s;
}
location = /api/preferences {
    proxy_pass http://172.25.1.1:${SOGO_API_PORT};
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 120s;
}
location = /api/send {
    proxy_pass http://172.25.1.1:${SOGO_API_PORT};
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 120s;
}
NGINX_EOF
)
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

# ── Verify ─────────────────────────────────────────────────────────────────
verify() {
    local webmail_url="$WEBMAIL_URL"
    info "Verifikasi akses webmail (via 127.0.0.1, bebas DNS publik/hairpin)..."
    local http_code
    local webmail_url_q
    webmail_url_q=$(printf "'%s'" "${webmail_url//\'/\'\\\'\'}")
    # --resolve memaksa koneksi ke nginx lokal — tidak bergantung pada A record
    # publik (sedang migrasi IP) maupun hairpin NAT di firewall.
    http_code=$(ssh "$SERVER" "curl -sk --resolve mail.pcpexpress.co.id:443:127.0.0.1 -o /dev/null -w '%{http_code}' -- $webmail_url_q")
    if [ "$http_code" = "200" ]; then
        ok "Webmail siap: $webmail_url (HTTP $http_code)"
    else
        err "Webmail mengembalikan HTTP $http_code — cek konfigurasi."
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
    verify

    echo ""
    ok "Deploy selesai! 🚀"
}

main "$@"
