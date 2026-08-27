// Anti-FOUC tema: terapkan .dark/light SEBELUM render. Baca preferensi akun
// dari localStorage (pcp-auth) + fallback prefers-color-scheme sistem.
// File eksternal karena CSP production (script-src 'self') memblokir inline.
(function () {
  try {
    var stored = JSON.parse(localStorage.getItem('pcp-auth') || '{}');
    var theme = stored && stored.state ? stored.state.theme : null;
    var dark = theme === 'dark'
      || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.setAttribute('data-theme', 'light');
    }
  } catch (e) { /* abaikan */ }
})();
