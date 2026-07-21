# 04. Implementation, Deployment & Operations Guide
*Panduan teknis eksekusi untuk AI Agent dan Developer Manusia.*

---

## 1. Repository & Workspace Setup

### 1.1. Informasi Repositori
- **Platform Git:** GitLab PCP Express Internal
- **Repo URL:** `https://gitlab.pcpexpress.com/devops-team/mailcow-frontend.git`
- **Branch Utama:** `main`
- **Lokasi Lokal (Mac Dev):** `/Users/anasfikri/Documents/Projects/pcpexpress/mailcow/sogo-frontend`

### 1.2. First Time Setup (Sekali Saja)
```bash
# Clone repositori
git clone https://gitlab.pcpexpress.com/devops-team/mailcow-frontend.git \
  /Users/anasfikri/Documents/Projects/pcpexpress/mailcow/sogo-frontend

cd /Users/anasfikri/Documents/Projects/pcpexpress/mailcow/sogo-frontend

# Install dependencies
npm install

# Jalankan dev server lokal
npm run dev
```

---

## 2. Koneksi ke Server (SSH)

### 2.1. Konfigurasi SSH (Sudah Ada di `~/.ssh/config`)
File `~/.ssh/config` di Mac Dev memiliki entri berikut:
```
Host mailserver
    HostName 10.3.3.210
    User anas.fikri
    IdentityFile ~/.ssh/id_ed25519_agent
    IdentitiesOnly yes
```

### 2.2. Cek Koneksi
```bash
ssh mailserver 'echo "OK"'
```

### 2.3. Credential & Informasi Server
| Property          | Value                                      |
|-------------------|--------------------------------------------|
| **IP Server**     | `10.3.3.210`                               |
| **SSH User**      | `anas.fikri`                               |
| **SSH Key**       | `~/.ssh/id_ed25519_agent`                  |
| **OS**            | Ubuntu 20.04 (Bare Metal)                  |
| **Mailcow Root**  | `/data/docker-data/mailcow/`               |
| **Nginx Config**  | `/data/docker-data/mailcow/data/conf/nginx/`|
| **Web Root**      | `/data/docker-data/mailcow/data/web/`      |
| **Webmail Deploy**| `/data/docker-data/mailcow/data/web/webmail/`|

---

## 3. Konvensi Commit (Git Conventional Commits)

Setiap commit **wajib** menggunakan format berikut agar riwayat Git mudah dibaca oleh AI dan manusia:

```
<type>(<scope>): <deskripsi singkat>
```

| Type       | Kapan Digunakan                                              |
|------------|--------------------------------------------------------------|
| `feat`     | Menambahkan fitur baru                                       |
| `fix`      | Memperbaiki bug                                              |
| `style`    | Perubahan UI/CSS murni (bukan logika)                        |
| `refactor` | Refaktorisasi kode (bukan fitur baru, bukan bug fix)         |
| `docs`     | Mengubah dokumentasi saja                                    |
| `chore`    | Pembaruan dependency, konfigurasi build, dsb.                |

**Contoh commit yang baik:**
```bash
git commit -m "feat(mailer): implement inbox message list with react-query pagination"
git commit -m "fix(auth): handle CSRF token refresh on session expiry"
git commit -m "style(calendar): improve event card UI for mobile screens"
```

---

## 4. Workflow Pengerjaan Harian

Setiap kali memulai task baru, ikuti urutan ini **tanpa terkecuali**:

```bash
# Langkah 1: Selalu mulai dari branch dev yang up-to-date
git checkout dev
git pull origin dev

# Langkah 2: Buat branch fitur baru sesuai task
git checkout -b feat/task-1.3-login-page

# Langkah 3: Kerjakan task, buat perubahan kode...

# Langkah 4: Commit dengan format konvensional
git add .
git commit -m "feat(auth): implement login page UI with mobile-first design"

# Langkah 5: Push ke remote
git push origin feat/task-1.3-login-page

# Langkah 6: Buat Merge Request di GitLab ke branch `dev`
```

---

## 5. Build, Commit, Push & Deployment

> **PENTING:** Deployment dari branch `main`.

### 5.1. Quick Deploy (Rekomendasi)

Gunakan script `deploy.sh` — otomatis build, commit, push & deploy:

```bash
# build + deploy aja (skip commit/push)
./deploy.sh

# build + commit + push + deploy
./deploy.sh "feat(x): pesan perubahan"
```

Script otomatis ambil GitLab credential dari macOS Keychain. Simpan credential:
```bash
security add-internet-password -s gitlab.pcpexpress.com -a "anas.fikri@pcpexpress.com" -w "TOKEN_ANDA"
```

### 5.2. Manual Steps

```bash
# Build
npm run build

# Deploy ke server
rsync -av --delete dist/ mailserver:/data/docker-data/mailcow/data/web/webmail/

# Reload Nginx
ssh mailserver "docker exec mailcow-nginx-mailcow-1 nginx -s reload"
```

### 5.3. Git Push via HTTPS (karena SSH port 22 diblok)

GitLab SSH port 22 diblok firewall. Gunakan HTTPS dengan credential:

```bash
# Set remote
git remote add origin https://gitlab.pcpexpress.com/devops-team/mailcow-frontend.git

# Push (credential dari keychain)
TOKEN=$(security find-internet-password -s gitlab.pcpexpress.com -w)
ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$TOKEN', safe=''))")
git push "https://anas.fikri%40pcpexpress.com:${ENCODED}@gitlab.pcpexpress.com/devops-team/mailcow-frontend.git" main
```

---

## 6. Konfigurasi Nginx Mailcow (Satu Kali Setup)

Agar React App dapat diakses di `https://mail.pcpexpress.co.id/webmail`, buat file konfigurasi Nginx custom di server:

### 6.1. Buat File Config (Otomatis oleh deploy.sh, atau manual:)
```bash
ssh mailserver 'cat > /data/docker-data/mailcow/data/conf/nginx/site.webmail.custom << '"'"'EOF'"'"'
# site.webmail.custom - SOGo React Frontend
location /webmail {
    root /web;
    index index.html;
    try_files $uri $uri/ /webmail/index.html;

    location ~* \.html$ {
        add_header Cache-Control "no-store, no-cache, must-revalidate";
        expires -1;
    }

    location ~* \.(css|js|woff2?|svg|gif|png|jpe?g|ico)$ {
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
EOF'
```

### 6.2. Restart / Reload Nginx
```bash
# Reload (zero-downtime, prefer this)
ssh mailserver "docker exec mailcow-nginx-mailcow-1 nginx -s reload"

# Atau restart penuh
ssh mailserver "docker restart mailcow-nginx-mailcow-1"
```

### 6.3. Verifikasi
```bash
# Cek HTTP response
curl -skI https://mail.pcpexpress.co.id/webmail/ | head -5
# → HTTP/2 200

# Cek aset statis (cache header harus immutable)
curl -skI https://mail.pcpexpress.co.id/webmail/assets/index-*.js | grep -i cache-control
# → cache-control: public, max-age=31536000, immutable

# Cek dari server
ssh mailserver "curl -sk -o /dev/null -w '%{http_code}' https://mail.pcpexpress.co.id/webmail/"
# → 200
```

---

## 7. Operations & Troubleshooting

### 7.1. Deploy Script (`deploy.sh`)

| Perintah | Aksi |
|----------|------|
| `./deploy.sh` | Build + deploy (skip commit) |
| `./deploy.sh "feat: pesan"` | Build + commit + push + deploy |
| `./deploy.sh --help` | Bantuan |

Script menyimpan credential di `.git/gitlab-creds` (auto-clean setelah push).

### 7.2. GitLab Credential (macOS Keychain)

Credential GitLab disimpan di macOS Keychain — aman, tidak hardcode:

```bash
# Lihat status
security find-internet-password -s gitlab.pcpexpress.com -w

# Update token
security add-internet-password -s gitlab.pcpexpress.com -a "anas.fikri@pcpexpress.com" -w "TOKEN_BARU" -U
```

### 7.3. Remote URLs

```bash
# HTTPS (untuk push — karena SSH port 22 diblok)
origin  https://gitlab.pcpexpress.com/devops-team/mailcow-frontend.git

# SSH config alias (untuk akses server)
Host mailserver → 10.3.3.210 (key: id_ed25519_agent)
```

### 7.4. Server Paths

| Path | Fungsi |
|------|--------|
| `/data/docker-data/mailcow/data/web/webmail/` | Webmail static files (deploy target) |
| `/data/docker-data/mailcow/data/conf/nginx/site.webmail.custom` | Nginx config SOGo frontend |
| `/data/docker-data/mailcow/data/web/` → `/web` (container) | Web root Nginx container |

---

## 8. Struktur Folder Project (Wajib Diikuti AI)

```
sogo-frontend/
├── docs/iso/               # Dokumentasi ISO SDLC
│   ├── 01_PRD_alignment.md
│   ├── 02_ARD_tech_spec.md
│   ├── 03_Roadmap_Tasks.md
│   └── 04_Deployment_Guide.md  ← File ini
├── public/
├── src/
│   ├── lib/
│   │   └── api.js          # Semua fungsi fetch ke SOGo API (SATU FILE TERPUSAT)
│   ├── store/
│   │   └── authStore.js    # Zustand store untuk session & auth state
│   ├── pages/
│   │   ├── LoginPage.jsx
│   │   ├── MailPage.jsx
│   │   ├── CalendarPage.jsx
│   │   ├── ContactsPage.jsx
│   │   └── PreferencesPage.jsx
│   ├── components/
│   │   ├── layout/         # Sidebar, Navbar, BottomNav
│   │   ├── mailer/         # MessageList, MessageReader, Compose
│   │   ├── calendar/       # CalendarGrid, EventCard
│   │   ├── contacts/       # ContactList, ContactForm
│   │   └── ui/             # Komponen generik (Button, Badge, Spinner)
│   ├── App.jsx
│   └── main.jsx
├── deploy.sh                # Build + commit + push + deploy automation
├── .ai-state.json           # State tracking ISO SDLC
├── package.json
├── server.js                # Backend proxy SMTP (port 3001)
└── vite.config.js           # base: "/webmail", proxy /SOGo → mail.pcpexpress.co.id
```

> **ATURAN AI:** Semua pemanggilan API ke SOGo **harus** ditulis di `src/lib/api.js`. Jangan pernah menulis `fetch()` atau `axios()` langsung di dalam komponen React.

---

## 8. Konfigurasi Vite (Wajib)

File `vite.config.js` **harus** dikonfigurasi dengan `base: '/webmail/'` agar semua path aset benar saat di-deploy ke subfolder `/webmail` di server:

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/webmail/',       // KRUSIAL: Tanpa ini, aset tidak akan terbaca di server
  build: {
    outDir: 'dist',
  }
})
```

---

## 9. Environment Variables

Buat file `.env.production` di root project:
```env
VITE_SOGO_BASE_URL=https://mail.pcpexpress.co.id
```

Gunakan di `src/lib/api.js`:
```javascript
const SOGO_BASE = import.meta.env.VITE_SOGO_BASE_URL
```

> **PERHATIAN:** Jangan pernah commit file `.env*` ke Git. Tambahkan ke `.gitignore`.
