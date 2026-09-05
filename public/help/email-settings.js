// Sesuaikan host dengan domain user (?domain=pcpexpress.com) bila tersedia.
// File EKSTERNAL (bukan inline) karena CSP production script-src 'self'
// memblokir <script> inline — sebelumnya fitur ini mati senyap di produksi
// (Sidebar mengandalkan ?domain= untuk menampilkan host IMAP/SMTP yang benar).
(function () {
  try {
    var domain = new URLSearchParams(location.search).get('domain');
    if (domain) {
      var host = 'mail.' + domain;
      document.querySelectorAll('.host').forEach(function (el) {
        if (el.id !== 'mail-host') el.textContent = host;
      });
    }
  } catch (e) { /* abaikan */ }
})();