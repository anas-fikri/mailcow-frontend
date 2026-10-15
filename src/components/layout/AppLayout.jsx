import React, { useEffect } from 'react';
import { Outlet, Navigate, useNavigate, useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import SmtpHeartbeat from '../SmtpHeartbeat';
import CommandPalette from '../CommandPalette';
import { buildCommands } from '../../lib/commandRegistry';
import { useAuthStore } from '../../store/authStore';
import { refreshSignaturesFromServer, subscribeSignatureSync } from '../../lib/signatures';
import { toast } from '../../lib/toast';

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
  const {
    isLoggedIn, theme, themeColor, density, readingPane,
    user, conversationView, setTheme, setPref,
  } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
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
  
  // ── Palet perintah (Ctrl/Cmd+K) ───────────────────────────────────────────
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  // Ctrl/Cmd+K ditangkap di FASE CAPTURE pada window — jalan sebelum handler
  // bubble MailPage (keyHandlerRef) & sebelum input mana pun; stopPropagation
  // mencegah keduanya ikut memproses. Shift/Alt tidak dicuri.
  useEffect(() => {
    const onPaletteKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (String(e.key).toLowerCase() !== 'k') return;
      e.preventDefault();
      e.stopPropagation();
      setPaletteOpen((v) => !v);
    };
    window.addEventListener('keydown', onPaletteKey, true);
    return () => window.removeEventListener('keydown', onPaletteKey, true);
  }, []);

  // Signature tersimpan di server (lintas perangkat): muat salinan server ke
  // cache lokal saat login/app start — NON-BLOCKING (compose membaca cache;
  // ComposeModal menunggu sebentar bila cache masih kosong). Gagal simpan
  // (sudah di-rollback oleh signatures.js) diberi tahu lewat toast.
  useEffect(() => {
    const email = user?.email;
    const token = user?.sogoToken;
    if (!email || !token) return undefined;
    refreshSignaturesFromServer(email, token);
    return subscribeSignatureSync((_who, state) => {
      if (state.status === 'error' && state.kind === 'save') {
        toast.error(`Signature gagal disimpan ke server: ${state.error}`);
      }
    });
  }, [user?.email, user?.sogoToken]);

  // Fallback event (keymap OPEN_PALETTE / tombol lain yang ingin membuka palet).
  useEffect(() => {
    const onOpen = () => setPaletteOpen(true);
    window.addEventListener('pcp:open-palette', onOpen);
    return () => window.removeEventListener('pcp:open-palette', onOpen);
  }, []);

  // Aksi spesifik mail dikirim sebagai CustomEvent 'pcp:palette' (pola
  // pcp:open-shortcuts); MailPage punya SATU listener yang memetakan ke
  // handler yang sudah ada. Di luar rute /mail: pindah dulu, beri jeda agar
  // MailPage (lazy chunk) sempat mount listener-nya.
  const onMailRoute = location.pathname === '/' || location.pathname.startsWith('/mail');
  const dispatchMail = React.useCallback((action, extra) => {
    const fire = () => window.dispatchEvent(new CustomEvent('pcp:palette', { detail: { action, ...(extra || {}) } }));
    if (onMailRoute) { fire(); return; }
    navigate('/mail');
    setTimeout(fire, 300);
  }, [onMailRoute, navigate]);

  // Perintah dibangun SAAT palet dibuka — daftar folder dibaca dari cache
  // React Query ['folders', token] (read-only peek; tanpa wiring/store baru).
  const paletteGroups = React.useMemo(() => {
    if (!paletteOpen) return [];
    const folders = queryClient.getQueryData(['folders', user?.sogoToken]);
    return buildCommands({
      navigate,
      dispatchMail,
      openShortcuts: () => dispatchMail('open-shortcuts'),
      setTheme,
      setPref,
      theme,
      density,
      readingPane,
      conversationView,
      folders: Array.isArray(folders) ? folders : null,
    });
  }, [paletteOpen, queryClient, user?.sogoToken, navigate, dispatchMail, setTheme, setPref, theme, density, readingPane, conversationView]);

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

      {/* Palet perintah global — Ctrl/Cmd+K */}
      <CommandPalette open={paletteOpen} groups={paletteGroups} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
