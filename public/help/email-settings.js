// Sesuaikan host dengan domain user (?domain=example.net) bila tersedia.
// File EKSTERNAL (bukan inline) karena CSP production script-src 'self'
// memblokir <script> inline — sebelumnya fitur ini mati senyap di produksi
// (Sidebar mengandalkan ?domain= untuk menampilkan host IMAP/SMTP yang benar).
(function () {
  try {
    var domain = new URLSearchParams(location.search).get('domain');
    if (domain) {
      var host = 'mail.' + domain;
      document.querySelectorAll('.host').forEach(function (el) {
        // Jangan sentuh: baris canonical (id=mail-host, tetap mail.example.net)
        // dan link relatif (href dimulai '/', mis. <a href="/webmail/">webmail</a> —
        // mengganti textContent-nya jadi 'mail.X' membuat teks link menyesatkan).
        if (el.id !== 'mail-host' && el.tagName !== 'A') el.textContent = host;
      });
    }
  } catch (e) { /* abaikan */ }
})();