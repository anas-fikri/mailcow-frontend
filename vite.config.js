import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import https from 'https'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  base: '/webmail/',
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
    strictPort: false,
    host: '0.0.0.0',
    proxy: {
      '/SOGo': {
        target: process.env.VITE_SOGO_BASE_URL || 'https://mail.pcpexpress.co.id',
        changeOrigin: true,
        secure: true, // always verify upstream TLS
        agent: new https.Agent({ keepAlive: false }),
        headers: {
          'Origin': process.env.VITE_SOGO_BASE_URL || 'https://mail.pcpexpress.co.id',
          'Referer': (process.env.VITE_SOGO_BASE_URL || 'https://mail.pcpexpress.co.id') + '/SOGo/',
        },
        // Rewrite cookie domain agar browser terima cookie dari localhost
        cookieDomainRewrite: { '*': 'localhost' },
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
              console.log(`          SogoSession: ${hasSogoSession}`);
              // Never log cookies, authorization headers, or other session material.
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

                  // Cookie values are secrets; never log them.
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
