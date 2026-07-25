#!/bin/bash
# deploy.sh — Build, commit, push & deploy SOGo Frontend ke production
# Usage:
#   ./deploy.sh                           # build + deploy (skip commit/push)
#   ./deploy.sh "feat(x): pesan commit"   # build + commit + push + deploy
#
# Prasyarat:
#   - GitLab credential tersimpan di macOS Keychain (sudah ada)
#   - SSH alias 'mailserver' mengarah ke 192.168.10.200 (sudah ada di ~/.ssh/config)
#   - NPM dependencies sudah diinstall

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$PROJECT_DIR/dist"
REMOTE_DIR="/data/docker-data/mailcow/data/web/webmail"
NGINX_DIR="/data/docker-data/mailcow/data/conf/nginx"
NGINX_FILE="site.webmail.custom"
SERVER="mailserver"
BRANCH="main"
GITLAB_URL="https://gitlab.pcpexpress.com/devops-team/mailcow-frontend.git"
GITLAB_USER="anas.fikri%40pcpexpress.com"

# ── Warna ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*"; }

# ── Ambil GitLab token dari macOS Keychain ─────────────────────────────────
get_gitlab_token() {
    security find-internet-password -s gitlab.pcpexpress.com -w 2>/dev/null
}

# ── Build ──────────────────────────────────────────────────────────────────
build() {
    info "Building Vite project..."
    cd "$PROJECT_DIR"
    npm run build
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
    encoded_pass=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$token', safe=''))")

    local git_url="https://${GITLAB_USER}:${encoded_pass}@gitlab.pcpexpress.com/devops-team/mailcow-frontend.git"

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
    info "Cek Nginx config di server..."
    if ssh "$SERVER" "test -f $NGINX_DIR/$NGINX_FILE"; then
        ok "Nginx config sudah ada."
        return
    fi

    info "Buat Nginx config..."
    ssh "$SERVER" "cat > $NGINX_DIR/$NGINX_FILE << 'NGINX_EOF'
# site.webmail.custom — SOGo React Frontend (auto-deployed)
location /webmail {
    root /web;
    index index.html;
    try_files \$uri \$uri/ /webmail/index.html;

    location ~* \\.html$ {
        add_header Cache-Control \"no-store, no-cache, must-revalidate\";
        expires -1;
    }

    location ~* \\.(css|js|woff2?|svg|gif|png|jpe?g|ico)$ {
        add_header Cache-Control \"public, max-age=31536000, immutable\";
    }
}
NGINX_EOF"
    ok "Nginx config dibuat."
}

# ── Deploy ke server ───────────────────────────────────────────────────────
deploy() {
    info "Buat direktori remote jika belum ada..."
    ssh "$SERVER" "mkdir -p $REMOTE_DIR"

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
    info "Verifikasi akses webmail..."
    local http_code
    http_code=$(ssh "$SERVER" "curl -sk -o /dev/null -w '%{http_code}' https://mail.pcpexpress.co.id/webmail/")
    if [ "$http_code" = "200" ]; then
        ok "Webmail siap: https://mail.pcpexpress.co.id/webmail/ (HTTP $http_code)"
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
