import React, { useEffect } from 'react';
import { Outlet, Navigate } from 'react-router';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import SmtpHeartbeat from '../SmtpHeartbeat';
import { useAuthStore } from '../../store/authStore';

/** Hue override for each themeColor preset (light-mode hue) */
const THEME_HUES = {
  blue: 221,
  indigo: 239,
  violet: 271,
  green: 142,
  teal: 173,
  orange: 24,
  rose: 346,
  slate: 215,
};

export default function AppLayout() {
  const { isLoggedIn, theme, themeColor, density, readingPane } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = React.useState(false); // Mobile sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(() => {
    try { return localStorage.getItem('pcp_sidebar_collapsed') === '1'; } catch { return false; }
  });
  const toggleSidebarCollapse = React.useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem('pcp_sidebar_collapsed', next ? '1' : '0'); } catch {}
      return next;
    });
  }, []);
  
  // Resolve tema aktual: 'auto' mengikuti prefers-color-scheme sistem, dengan
  // listener perubahan skema agar UI ikut berubah tanpa reload.
  const [systemDark, setSystemDark] = React.useState(
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false
  );
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => setSystemDark(e.matches);
    // Safari <14 tidak support addEventListener di MediaQueryList —
    // pakai addListener/removeListener (deprecated tapi masih.working).
    if (mq.addEventListener) {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);

  const effectiveDark = theme === 'dark' || (theme === 'auto' && systemDark);
  useEffect(() => {
    // Tambah transition sekali agar theme switch tidak flash.
    document.documentElement.style.transition = 'background-color 0.2s, color 0.2s';
    if (effectiveDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }, [effectiveDark]);

  useEffect(() => {
    const hue = THEME_HUES[themeColor] ?? 221;
    document.documentElement.style.setProperty('--theme-hue', String(hue));
  }, [themeColor]);

  // Hook tata letak ala Outlook di <html> (seperti data-theme): CSS global
  // (.density-* di index.css) dan Skeleton membaca atribut ini — komponen
  // tidak perlu membaca store satu per satu. themeInit.js menulis nilai awal
  // sebelum paint pertama; effect ini menyinkronkan saat user mengubahnya.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.density = density === 'compact' ? 'compact' : 'normal';
    root.dataset.readingPane = readingPane === 'bottom' || readingPane === 'off' ? readingPane : 'right';
  }, [density, readingPane]);

  if (!isLoggedIn) return <Navigate to="/login" replace />;

  return (
    <div className="flex h-screen supports-[height:100dvh]:h-dvh w-full max-w-[100vw] overflow-hidden bg-background text-foreground transition-colors duration-200">
      <SmtpHeartbeat />

      {/* Mobile Sidebar Overlay */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 md:hidden ${sidebarOpen ? 'block' : 'hidden'}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Main Sidebar — di mobile lebar dibatasi 85vw agar tidak melebihi layar 320px */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 max-w-[85vw] transform md:relative md:translate-x-0 md:max-w-none transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} ${sidebarCollapsed ? 'md:w-16' : 'md:w-56'} flex shrink-0`}>
        <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebarCollapse} onClose={() => setSidebarOpen(false)} />
      </div>

      {/* min-w-0 + overflow-x-hidden: anak flex tidak boleh memaksa lebar
          melebihi viewport (320px) — scroll horizontal halaman dilarang. */}
      <main className="flex-1 overflow-hidden overflow-x-hidden relative pb-16 md:pb-0 flex flex-col min-w-0 max-w-full">
        {/* Mobile Header for Sidebar Toggle (if needed globally, otherwise pages handle it) */}
        <Outlet context={{ setSidebarOpen }} />
      </main>
      <BottomNav />
    </div>
  );
}
