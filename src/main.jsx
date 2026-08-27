import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// PWA: daftarkan service worker HANYA di production. SW hanya menangani GET
// dalam scope /webmail/ (navigasi + asset hashed) dan TIDAK pernah menyentuh
// /api/* — data email & sesi tidak masuk cache browser.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/webmail/sw.js').catch(() => {
      /* SW gagal registrasi — aplikasi tetap berjalan normal tanpa offline shell */
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
