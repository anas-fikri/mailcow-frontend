# 04. Implementation, Deployment & Operations Guide
*Panduan teknis eksekusi untuk AI Agent dan Developer Manusia.*

---

## 1. Repository & Workspace Setup

### 1.1. Informasi Repositori
- **Platform Git:** GitLab PCP Express Internal
- **Repo URL:** `https://gitlab.pcpexpress.com/devops-team/sogo-frontend.git` *(akan dibuat baru)*
- **Branch Utama:** `main`
- **Branch Development:** `dev` *(semua pekerjaan harus dimulai dari sini)*
- **Lokasi Lokal (Mac Dev):** `/Users/anasfikri/Documents/Projects/pcpexpress/mailcow/sogo-frontend`

### 1.2. First Time Setup (Sekali Saja)
```bash
# Clone repositori
git clone https://gitlab.pcpexpress.com/devops-team/sogo-frontend.git \
  /Users/anasfikri/Documents/Projects/pcpexpress/mailcow/sogo-frontend

cd /Users/anasfikri/Documents/Projects/pcpexpress/mailcow/sogo-frontend

# Inisialisasi project React
npm create vite@latest . -- --template react
npm install

# Install dependencies utama (sesuai ARD)
npm install tailwindcss@next @tailwindcss/vite zustand @tanstack/react-query react-router-dom framer-motion
npm install -D @types/react

# Jalankan dev server lokal
npm run dev
```

---

## 2. Koneksi ke Server (SSH)

### 2.1. Konfigurasi SSH (Sudah Ada di `~/.ssh/config`)
File `~/.ssh/config` di Mac Dev **harus** memiliki entri berikut:
```
Host mailserver
    HostName 10.3.3.210
    User anas.fikri
    IdentityFile ~/.ssh/id_ed25519
    Port 22
```

### 2.2. Cek Koneksi
```bash
# Harus bisa terkoneksi tanpa password
ssh mailserver 'echo "Koneksi berhasil!"'
```

### 2.3. Credential & Informasi Server
| Property          | Value                               |
|-------------------|-------------------------------------|
| **IP Server**     | `10.3.3.210`                        |
| **SSH User**      | `anas.fikri`                        |
| **SSH Key**       | `~/.ssh/id_ed25519`                 |
| **OS**            | Ubuntu 20.04 (Bare Metal)           |
| **Mailcow Root**  | `/data/docker-data/mailcow/`        |
| **Nginx Config**  | `/data/docker-data/mailcow/data/conf/nginx/` |
| **Web Root**      | `/data/docker-data/mailcow/data/web/` |

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

## 5. Build & Deployment ke Server Mailcow

> **PENTING:** Deployment **hanya** dilakukan dari branch `main` yang sudah di-review.

### 5.1. Proses Build
```bash
# Pastikan di root project
cd /Users/anasfikri/Documents/Projects/pcpexpress/mailcow/sogo-frontend

# Build untuk production
npm run build
# Output: folder `dist/` berisi aset statis (HTML/JS/CSS)
```

### 5.2. Deploy ke Server via Rsync
```bash
# Sync folder dist/ ke web root Mailcow
rsync -av --delete dist/ \
  mailserver:/data/docker-data/mailcow/data/web/webmail/
```

### 5.3. Satu Baris Perintah (Build + Commit + Push + Deploy)
```bash
npm run build && \
  git add . && \
  git commit -m "chore(deploy): build and deploy to production" && \
  git push origin main && \
  rsync -av --delete dist/ mailserver:/data/docker-data/mailcow/data/web/webmail/
```

---

## 6. Konfigurasi Nginx Mailcow (Satu Kali Setup)

Agar React App dapat diakses di `https://mail.pcpexpress.co.id/webmail`, buat file konfigurasi Nginx custom di server:

### 6.1. Buat File Config
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

### 6.2. Restart Nginx Mailcow
```bash
ssh mailserver 'docker restart mailcow-nginx-mailcow-1'
```

### 6.3. Verifikasi
```bash
curl -I https://mail.pcpexpress.co.id/webmail/
# Harus mengembalikan HTTP/2 200
```

---

## 7. Struktur Folder Project (Wajib Diikuti AI)

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
├── .ai-state.json           # State tracking ISO SDLC
├── package.json
└── vite.config.js           # Wajib config base: "/webmail"
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
