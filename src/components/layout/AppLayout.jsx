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
  const { isLoggedIn, theme, themeColor } = useAuthStore();
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
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const effectiveDark = theme === 'dark' || (theme === 'auto' && systemDark);
  useEffect(() => {
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

  if (!isLoggedIn) return <Navigate to="/login" replace />;

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground transition-colors duration-200">
      <SmtpHeartbeat />
      
      {/* Mobile Sidebar Overlay */}
      <div 
        className={`fixed inset-0 bg-black/50 z-40 md:hidden ${sidebarOpen ? 'block' : 'hidden'}`} 
        onClick={() => setSidebarOpen(false)} 
      />

      {/* Main Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 transform md:relative md:translate-x-0 transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} ${sidebarCollapsed ? 'md:w-16' : 'md:w-56'} flex shrink-0`}>
        <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebarCollapse} onClose={() => setSidebarOpen(false)} />
      </div>

      <main className="flex-1 overflow-hidden relative pb-16 md:pb-0 flex flex-col min-w-0">
        {/* Mobile Header for Sidebar Toggle (if needed globally, otherwise pages handle it) */}
        <Outlet context={{ setSidebarOpen }} />
      </main>
      <BottomNav />
    </div>
  );
}
