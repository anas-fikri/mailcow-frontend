#!/bin/bash
# deploy.sh — Deploy SOGo Frontend dari GitLab ke production
# Aman: build di server langsung dari GitLab, workspace lokal bebas WIP.
#
# Usage:
#   ./deploy.sh                           # deploy dari GitLab main
#   ./deploy.sh "feat(x): pesan commit"   # commit + push + deploy dari GitLab
#
# Prasyarat:
#   - SSH alias 'mailserver' mengarah ke 192.168.10.200
#   - GitLab token di macOS Keychain (untuk commit/push dari workspace)
#   - Mailserver punya: node, npm, git, akses ke gitlab.pcpexpress.com

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE_WEB_DIR="${REMOTE_DIR:-/data/docker-data/mailcow/data/web/webmail}"
NGINX_DIR="${NGINX_DIR:-/data/docker-data/mailcow/data/conf/nginx}"
NGINX_FILE="site.webmail.custom"
SERVER="${SERVER:-${DEPLOY_SSH_HOST:-mailserver}}"
BRANCH="${BRANCH:-main}"
WEBMAIL_URL="${WEBMAIL_URL:-https://mail.pcpexpress.co.id/webmail/}"
GITLAB_URL="https://${GITLAB_HOST:-gitlab.pcpexpress.com}/${GITLAB_PROJECT:-devops-team/mailcow-frontend}.git"
GITLAB_USER="${GITLAB_USER:-}"

# Auto-detect GitLab username dari keychain biar token cocok
# (token terikat ke user, bukan generic 'git').
if [ -z "$GITLAB_USER" ]; then
    GITLAB_USER="$(security find-internet-password -s "${GITLAB_HOST:-gitlab.pcpexpress.com}" 2>/dev/null | grep '"acct"' | sed 's/.*"acct"<blob>="\([^"]*\)".*/\1/')"
fi
if [ -z "$GITLAB_USER" ]; then
    warn "GITLAB_USER tidak terdeteksi dari Keychain. Fallback ke 'git'."
    GITLAB_USER="git"
fi
REMOTE_REPO_DIR="${REMOTE_REPO_DIR:-/home/anas.fikri/mailcow-frontend}"

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
# REMOTE_REPO_DIR - Remote clone path (default: /home/anas.fikri/mailcow-frontend)
# WEBMAIL_URL    - URL for deploy verification (default: https://mail.pcpexpress.co.id/webmail/)

# ── Runtime config maintenance (server .env) ─────────────────────────────────
# Nilai-nilai tertentu harus selalu ada di /home/anas.fikri/sogo-proxy/.env di
# server agar service sogo-smtp-proxy mengambil nilai benar saat restart.
# Helper ensure_runtime_env() di bawah idempotent: hanya menulis jika hilang
# atau berbeda; restart service TIDAK dilakukan otomatis (lihat deploy_backend).
EXPECTED_SMTP_SESSION_IDLE_MIN="${EXPECTED_SMTP_SESSION_IDLE_MIN:-60}"
# override via: EXPECTED_SMTP_SESSION_IDLE_MIN=90 ./deploy.sh
# SOGO_API_PORT  - Host port for sogo-smtp-proxy (default: 3005)
# VITE_API_KEY   - Optional local build key; otherwise read from mailserver .env

# ── Warna ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*"; }

# ── SSH ────────────────────────────────────────────────────────────────────
ensure_ssh() {
    if ssh -o ConnectTimeout=8 -o BatchMode=yes "$SERVER" 'true' 2>/dev/null; then
        ok "SSH ke $SERVER OK."
        return 0
    fi
    err "SSH ke $SERVER gagal. Cek ~/.ssh/config atau koneksi jaringan."
    exit 1
}

# ── Git credential dari Keychain (untuk commit/push lokal) ────────────────
get_gitlab_token() {
    local gitlab_host="${GITLAB_HOST:-gitlab.pcpexpress.com}"
    security find-internet-password -s "$gitlab_host" -w 2>/dev/null
}

# ── Commit + push lokal (opsional) ─────────────────────────────────────────
git_commit_push() {
    local msg="$1"
    local token

    token=$(get_gitlab_token)
    if [ -z "$token" ]; then
        err "GitLab credential tidak ditemukan di Keychain."
        exit 1
    fi

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

# ── Setup Nginx config ───────────────────────────────────────────────────────
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

# ── Build + deploy DI SERVER (dari GitLab) ────────────────────────────────
server_deploy() {
    local git_token
    git_token=$(get_gitlab_token)
    if [ -z "$git_token" ]; then
        err "GitLab token diperlukan untuk clone/pull di server."
        err "Jalankan: security add-internet-password -s gitlab.pcpexpress.com -w \"TOKEN_ANDA\""
        exit 1
    fi

    info "Sync repo + build + deploy di $SERVER..."

    # Token dikirim via env var (GIT_TOKEN). Heredoc quoted → token aman di memory,
    # tidak ke disk server. credential.helper inline dipakai agar URL tetap tanpa
    # credential embed, dan token tidak muncul di ps aux atau .git/config.
    ssh "$SERVER" "GIT_TOKEN='$git_token' GITLAB_URL='https://${GITLAB_HOST:-gitlab.pcpexpress.com}/${GITLAB_PROJECT:-devops-team/mailcow-frontend}.git' GITLAB_USER='${GITLAB_USER:-git}' REMOTE_REPO_DIR='$REMOTE_REPO_DIR' REMOTE_WEB_DIR='$REMOTE_WEB_DIR' NGINX_DIR='$NGINX_DIR' NGINX_FILE='$NGINX_FILE' BRANCH='$BRANCH' bash -s" <<'REMOTE_DEPLOY'
set -euo pipefail

# Load nvm — server punya Node 22 via nvm tapi default system Node 18
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 22 --silent 2>/dev/null || true
echo "  → Node: $(node --version)"

REMOTE_REPO_DIR="${REMOTE_REPO_DIR:-/home/anas.fikri/mailcow-frontend}"
REMOTE_WEB_DIR="${REMOTE_WEB_DIR:-/data/docker-data/mailcow/data/web/webmail}"
NGINX_DIR="${NGINX_DIR:-/data/docker-data/mailcow/data/conf/nginx}"
NGINX_FILE="site.webmail.custom"
BRANCH="${BRANCH:-main}"

# Helper: credential helper inline — token hanya di memory heredoc
GIT_CRED_HELPER="!f() { echo 'username=${GITLAB_USER:-git}'; echo \"password=\$GIT_TOKEN\"; }; f"

# 1. Clone pertama / pull
if [ -d "$REMOTE_REPO_DIR/.git" ]; then
    echo "  → Repo sudah ada: git fetch $BRANCH"
    cd "$REMOTE_REPO_DIR"
    git -c "credential.helper=$GIT_CRED_HELPER" fetch origin "$BRANCH"
    git reset --hard "origin/$BRANCH"
else
    echo "  → Repo belum ada: git clone"
    git -c "credential.helper=$GIT_CRED_HELPER" clone --branch "$BRANCH" "$GITLAB_URL" "$REMOTE_REPO_DIR"
    cd "$REMOTE_REPO_DIR"
fi

unset GIT_CRED_HELPER GIT_TOKEN

echo "  → HEAD: $(git log -1 --oneline)"

# 2. Install dependencies (termasuk devDeps — vite di devDependencies)
# PUPPETEER_SKIP_DOWNLOAD: server tidak punya Chrome dan puppeteer postinstall
# gagal mencoba download. Kita cuma build (tidak pakai puppeteer di runtime).
echo "  → npm ci (PUPPETEER_SKIP_DOWNLOAD=true)..."
PUPPETEER_SKIP_DOWNLOAD=true npm ci 2>&1 | tail -3

# 3. Ambil API_KEY dari sogo-proxy
API_KEY="$(awk -F= '/^API_KEY=/{print substr($0, index($0, "=") + 1); exit}' /home/anas.fikri/sogo-proxy/.env)"
if [ -z "$API_KEY" ]; then
    echo "[ERROR] API_KEY tidak ditemukan di /home/anas.fikri/sogo-proxy/.env"
    exit 1
fi

# 4. Build
echo "  → Build..."
VITE_API_KEY="$API_KEY" VITE_SOGO_BASE_URL="" npm run build 2>&1 | tail -3
echo "  → Build OK: dist/"

# 5. Rsync ke direktori nginx
echo "  → Rsync ke $REMOTE_WEB_DIR"
mkdir -p "$REMOTE_WEB_DIR"
rsync -av --delete dist/ "$REMOTE_WEB_DIR/" 2>&1 | tail -3

# 6. Rsync nginx config
echo "  → Pasang nginx config"
cp -f configs/site.webmail.custom "$NGINX_DIR/$NGINX_FILE" 2>/dev/null || true

# 7. Nginx reload
echo "  → Nginx reload..."
docker exec mailcow-nginx-mailcow-1 nginx -s reload 2>/dev/null || docker restart mailcow-nginx-mailcow-1
echo "  → Nginx reloaded"

REMOTE_DEPLOY

    ok "Server deploy selesai."
    unset git_token
}

# ── Deploy backend (server.js SMTP proxy) ──────────────────────────────────
# server.js + modul lokal yang di-import (src/lib/*.js) berjalan sebagai
# systemd user service `sogo-smtp-proxy` di $REMOTE_BACKEND_DIR. deploy.sh
# sebelumnya TIDAK men-sync ini — backend bisa kedaluwarsa meski frontend live.
REMOTE_BACKEND_DIR="${REMOTE_BACKEND_DIR:-/home/anas.fikri/sogo-proxy}"
BACKEND_LIB_FILES="src/lib/ssrfGuard.js src/lib/emailValidation.js src/lib/smtpCookie.js src/lib/remoteImage.js src/lib/attachmentValidation.js src/lib/sendQueue.js"

# Pastikan KEY=VALUE (atau KEY="value") ada di $env_path pada server.
# Idempotent: jika sudah sama, no-op; jika hilang → append; jika beda → ganti.
# Tidak memicu restart otomatis — restart service baru dilakukan oleh caller
# (deploy_backend) bila server.js / src/lib berubah.
ensure_runtime_env() {
    local server="$1" key="$2" expected="$3" env_path="$4"
    local remote_dir_q
    remote_dir_q=$(printf "'%s'" "${env_path//\'/\'\\\'\'}")
    # Baca nilai saat ini (jika ada). Quoted/unquoted sama-sama ditangani grep.
    local current
    current=$(ssh "$server" "awk -F= -v k=$key '\$1==k {print substr(\$0, length(k)+2)}' ${remote_dir_q} 2>/dev/null | tail -1")
    if [ -z "$current" ]; then
        ssh "$server" "printf '${key}=${expected}\\n' >> ${remote_dir_q}"
        info "${key}=${expected} ditambahkan ke ${server}:${env_path} (berlaku pada restart berikutnya)."
    elif [ "$current" = "$expected" ]; then
        ok "${key} sudah = '$expected' di ${server}:${env_path} — no-op."
    else
        ssh "$server" "sed -i.bak '/^${key}=/d' ${remote_dir_q} && printf '${key}=${expected}\\n' >> ${remote_dir_q}"
        info "${key} pada ${server}:${env_path} diubah '$current' → '$expected' (berlaku pada restart berikutnya)."
    fi
}

deploy_backend() {
    info "Deploy backend (server.js + src/lib) ke $SERVER:$REMOTE_BACKEND_DIR..."
    local remote_dir_q
    remote_dir_q=$(printf "'%s'" "${REMOTE_BACKEND_DIR//\'/\'\\\'\'}")

    # Jaga nilai runtime .env server tetap terkini (idempotent).
    # Tidak restart service — restart hanya bila kode backend berubah (di bawah).
    ensure_runtime_env "$SERVER" "SMTP_SESSION_IDLE_MIN" \
        "$EXPECTED_SMTP_SESSION_IDLE_MIN" "$REMOTE_BACKEND_DIR/.env"
    # Undo send window (detik). 180 = 3 menit (permintaan user: 2-3 mnt).
    # 0 = matikan undo (kirim langsung). Override via EXPECTED_SEND_UNDO_SECONDS.
    ensure_runtime_env "$SERVER" "SMTP_SEND_UNDO_SECONDS" \
        "${EXPECTED_SEND_UNDO_SECONDS:-180}" "$REMOTE_BACKEND_DIR/.env"

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
        ok "Webmail siap: ${WEBMAIL_URL} (HTTP $http_code)"
    else
        err "Webmail mengembalikan HTTP $http_code — cek konfigurasi."
    fi

    verify_image_proxy "$host"
    verify_health "$host"
}

# /api/health butuh API key (dienforce di server.js requireApiKey, bukan di
# nginx — nginx passthrough). Preflight sudah cek backend langsung; di sini
# cek END-TO-END via nginx supaya routing /api/health ikut tervalidasi
# setelah deploy (konsisten dengan preflight yang memakai key yang sama).
verify_health() {
    local host="$1"
    info "Verifikasi /api/health (end-to-end via nginx, butuh API key)..."
    local code
    code=$(ssh "$SERVER" "host=$host bash -s" <<'REMOTE_HEALTH'
set -euo pipefail
api_key="$(awk -F= '/^API_KEY=/{print substr($0, index($0, "=") + 1); exit}' /home/anas.fikri/sogo-proxy/.env)"
[ -n "$api_key" ]
curl -sk --max-time 10 --resolve "${host}:443:127.0.0.1" -o /dev/null -w '%{http_code}' -H "X-Api-Key: $api_key" -- "https://${host}/api/health"
REMOTE_HEALTH
)
    if [ "$code" = "200" ]; then
        ok "/api/health OK (HTTP $code via nginx + API key)."
    else
        err "/api/health -> HTTP $code via nginx (harap 200 dengan API key)."
    fi
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
    echo "║  SOGo Frontend — Deploy dari GitLab       ║"
    echo "╚══════════════════════════════════════════╝"
    echo ""

    ensure_ssh

    # Commit + push lokal dulu (opsional)
    if [ -n "$commit_msg" ]; then
        git_commit_push "$commit_msg"
    else
        info "Skip commit/push. Deploy langsung dari GitLab main."
    fi

    echo ""
    server_deploy

    echo ""
    deploy_backend

    echo ""
    verify

    echo ""
    ok "Deploy selesai! 🚀"
    echo "  Source: GitLab $BRANCH → $SERVER"
}

main "$@"