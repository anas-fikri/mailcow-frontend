import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import https from 'https'

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
        agent: new https.Agent({ keepAlive: false }),
        headers: {
          'Origin': 'https://mail.pcpexpress.co.id',
          'Referer': 'https://mail.pcpexpress.co.id/SOGo/',
        },
        // Rewrite cookie domain agar browser terima cookie dari localhost
        cookieDomainRewrite: { 'mail.pcpexpress.co.id': 'localhost', '*': 'localhost' },
        configure(proxy) {
          // ─── Log request yang dikirim ke SOGo ───────────────────────────
          proxy.on('proxyReq', (proxyReq, req) => {
            // Hapus header compress agar SOGo mengirim plain text, mencegah bug proxy/browser hanging saat decompress.
            proxyReq.removeHeader('accept-encoding');

            const cookies = req.headers['cookie'] || '';
            const hasSogoSession = cookies.includes('0xHIGHFLYxSOGo');
            const interesting = req.url?.includes('/Mail/') ||
                                req.url?.includes('/connect') ||
                                req.url?.includes('/logoff');
            if (interesting) {
              console.log(`[PROXY →] ${req.method} ${req.url}`);
              console.log(`          SogoSession: ${hasSogoSession} | Cookies: ${cookies.slice(0, 200) || '(none)'}`);
              // Log semua header yang dikirim ke upstream
              const hdrs = proxyReq.getHeaders();
              console.log(`          upstream headers: host=${hdrs.host} origin=${hdrs.origin}`);
            }
          });

          // ─── Log response dari SOGo ──────────────────────────────────────
          proxy.on('proxyRes', (proxyRes, req) => {
            const setCookies = proxyRes.headers['set-cookie'];
            const interesting = req.url?.includes('/Mail/') ||
                                req.url?.includes('/connect') ||
                                req.url?.includes('/logoff');

            if (interesting) {
              const ct = proxyRes.headers['content-type'] || '';
              console.log(`[PROXY ←] ${proxyRes.statusCode} ${ct.split(';')[0]} | ${req.url}`);
            }

            if (setCookies) {
              // Strip 'Secure' dan 'SameSite' agar browser simpan di localhost (HTTP)
              proxyRes.headers['set-cookie'] = (Array.isArray(setCookies) ? setCookies : [setCookies])
                .map(cookie => {
                  let c = cookie
                    .replace(/;\s*secure/gi, '')       // hapus Secure
                    .replace(/;\s*samesite=[^;]*/gi, ''); // hapus SameSite

                  // Log cookies penting dari SOGo
                  const name = c.split('=')[0].trim();
                  if (name === '0xHIGHFLYxSOGo' || name === 'XSRF-TOKEN' || name === 'SOGoLogin') {
                    console.log(`[COOKIE ←] ${c.slice(0, 150)}`);
                  }
                  return c;
                });
            }
          });

          proxy.on('error', (err, req) => {
            console.error(`[PROXY ERR] ${req.url}: ${err.message}`);
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
