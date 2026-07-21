import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  base: '/webmail',
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
    strictPort: false,
    host: '0.0.0.0',
    proxy: {
      '/SOGo': {
        target: 'https://mail.pcpexpress.co.id',
        changeOrigin: true,
        secure: false,
        headers: {
          'Origin': 'https://mail.pcpexpress.co.id',
          'Referer': 'https://mail.pcpexpress.co.id/SOGo/',
        },
        cookieDomainRewrite: { '*': 'localhost' },
        cookiePathRewrite: { '/SOGo/': '/' },
        // Strip "secure" flag dari Set-Cookie agar browser terima cookie via HTTP localhost
        configure(proxy) {
          proxy.on('proxyRes', (proxyRes) => {
            const setCookies = proxyRes.headers['set-cookie'];
            if (setCookies) {
              proxyRes.headers['set-cookie'] = (Array.isArray(setCookies) ? setCookies : [setCookies])
                .map(cookie =>
                  cookie
                    .replace(/;\s*secure/gi, '')   // hapus ; secure
                    .replace(/;\s*samesite=[^;]*/gi, '') // hapus samesite juga
                    .replace(/;\s*path=\/SOGo\//gi, '; path=/') // path dari /SOGo/ ke /
                );
            }
          });
        },
      },
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: false,
      },
    },
  },
})
