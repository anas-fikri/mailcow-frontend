// Apply the persisted/system theme before React renders.
// This is imported before App in main.jsx so Vite bundles it without a
// classic-script warning. Keep the operation side-effect-only and defensive.
(function applyInitialTheme() {
  try {
    var stored = JSON.parse(localStorage.getItem('pcp-auth') || '{}');
    var theme = stored && stored.state ? stored.state.theme : null;
    var dark = theme === 'dark'
      || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var root = document.documentElement;
    root.classList.toggle('dark', dark);
    root.classList.toggle('light', !dark);
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
  } catch (_) {
    // Theme initialization must never prevent the application from starting.
  }
})();
