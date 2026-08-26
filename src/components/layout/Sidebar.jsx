import React, { useEffect, useState } from 'react'
import { Mail, LogOut, ChevronRight, HelpCircle, Timer } from 'lucide-react'
import { NavLink, useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../store/authStore'
import { logout, fetchSmtpSessionStatus } from '../../lib/api'
import { Sun, Moon, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { NAV_ITEMS } from '../../constants/navigation'
import { formatRemaining, sessionWarningLevel, SHOW_BELOW_MINUTES } from '../../lib/sessionCountdown'

export default function Sidebar({ collapsed, onToggleCollapse, onClose }) {
  const { user, clearUser, theme, toggleTheme } = useAuthStore()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // ── Countdown sesi SMTP proxy ───────────────────────────────────────────────
  // Poll /api/auth/smtp/status setiap 60 dtk (rate-limit server 30/menit cukup)
  // SELAMA tab aktif; pause saat tab hidden supaya tidak refresh lastUsed secara
  // diam-diam (SmtpHeartbeat terpisah menyegarkan lastUsed saat tab aktif).
  // Hanya render badge saat sisa sesi < SHOW_BELOW_MINUTES menit.
  const { data: sessionStatus } = useQuery({
    // Scope per akun: cache React Query bersifat global di tab, dan key tanpa
    // identitas user membuat countdown sesi akun SEBELUMNYA tampil sejenak
    // untuk akun baru (staleTime 30s) saat ganti akun / logout-login.
    queryKey: ['smtp-session-status', user?.sogoToken],
    queryFn: () => fetchSmtpSessionStatus(),
    refetchInterval: () => (
      typeof document !== 'undefined' && document.visibilityState === 'visible'
        ? 60 * 1000
        : false
    ),
    enabled: Boolean(user?.sogoToken),
    staleTime: 30 * 1000,
  });
  const [remainingMs, setRemainingMs] = useState(null);
  useEffect(() => {
    if (!sessionStatus?.remainingMs) { setRemainingMs(null); return; }
    setRemainingMs(sessionStatus.remainingMs);
    const tick = setInterval(() => {
      setRemainingMs((prev) => (prev == null ? null : Math.max(0, prev - 1000)));
    }, 1000);
    return () => clearInterval(tick);
  }, [sessionStatus?.remainingMs]);

  async function handleLogout() {
    await logout().catch(() => {})
    // Bersihkan cache react-query (pesan, kontak, kalender, prefs) — data
    // sensitif akun ini tidak boleh tersisa di memori saat akun lain login
    // di perangkat yang sama (data leak antar role di memori).
    queryClient.clear()
    clearUser()
    navigate('/login')
  }

  return (
    <aside className={`flex flex-col h-full bg-card border-r border-border w-full transition-all`}>
      {/* Brand */}
      <div className="px-4 py-5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <Mail size={16} className="text-primary-foreground" />
          </div>
          {!collapsed && (
            <span className="font-bold text-foreground text-sm truncate capitalize">
              {user?.email ? user.email.split('@')[1] : 'Webmail'}
            </span>
          )}
        </div>
        
        {/* Toggle buttons */}
        <div className="flex items-center">
          {/* Mobile close */}
          <button className="md:hidden min-w-11 min-h-11 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" onClick={onClose} aria-label="Tutup menu">
            <X size={18} />
          </button>
          {/* Desktop collapse */}
          <button className="hidden md:flex min-w-11 min-h-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" onClick={onToggleCollapse} aria-label={collapsed ? 'Buka sidebar' : 'Ciutkan sidebar'}>
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 flex flex-col gap-1 overflow-y-auto overflow-x-hidden">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => { if(window.innerWidth < 768) onClose(); }}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                collapsed ? 'justify-center' : ''
              } ${isActive
                 ? 'bg-primary/20 text-primary border border-primary/20'
                 : 'text-muted-foreground hover:text-foreground hover:bg-muted'
               }`
            }
            title={collapsed ? label : undefined}
          >
            {({ isActive }) => (
              <>
                <Icon size={17} className="shrink-0" />
                {!collapsed && (
                  <>
                    <span className="flex-1 truncate">{label}</span>
                    {isActive && <ChevronRight size={14} className="text-primary" />}
                  </>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User / Logout */}
      <div className="p-3 border-t border-border flex flex-col gap-2">
        <button
          onClick={toggleTheme}
          className={`flex items-center gap-3 px-3 min-h-11 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all ${collapsed ? 'justify-center' : ''}`}
          title="Ganti Tema"
          aria-label="Ganti tema"
        >
          {theme === 'dark' ? <Sun size={15} className="shrink-0" /> : <Moon size={15} className="shrink-0" />}
          {!collapsed && <span>Tema {theme === 'dark' ? 'Terang' : 'Gelap'}</span>}
        </button>

        <a
          href={`/webmail/help/email-settings.html?domain=${user?.email ? user.email.split('@')[1] : 'pcpexpress.com'}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all ${collapsed ? 'justify-center' : ''}`}
          title="Panduan Setting Email"
        >
          <HelpCircle size={15} className="shrink-0" />
          {!collapsed && <span>Panduan Setting</span>}
        </a>

        {!collapsed && (
          <div className="flex items-center gap-2.5 px-2 py-2">
            <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0">
              {user?.cn?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}
            </div>
            <span className="text-xs text-muted-foreground truncate flex-1">{user?.cn || user?.email}</span>
          </div>
        )}
        {/* Countdown sesi SMTP — hanya tampil saat < 15 mnt agar tidak berisik */}
        {!collapsed && remainingMs != null && remainingMs < SHOW_BELOW_MINUTES * 60_000 && (
          <SessionCountdown remainingMs={remainingMs} />
        )}
        <button
          onClick={handleLogout}
          className={`flex items-center gap-3 px-3 min-h-11 rounded-xl text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all ${collapsed ? 'justify-center' : ''}`}
          title="Keluar"
          aria-label="Keluar"
        >
          <LogOut size={15} className="shrink-0" />
          {!collapsed && <span>Keluar</span>}
        </button>
      </div>
    </aside>
  )
}

/**
 * Badge countdown sesi SMTP — tampil tipis di bawah info user.
 * Warna: muted (≤15m), amber (≤5m), destructive + pulse (≤1m).
 */
function SessionCountdown({ remainingMs }) {
  const level = sessionWarningLevel(remainingMs);
  const text = formatRemaining(remainingMs);
  const palette = {
    ok:     'bg-muted text-muted-foreground',
    warn:   'bg-amber-500/10 text-amber-900 dark:text-amber-400',
    urgent: 'bg-destructive/10 text-destructive animate-pulse',
  }[level];
  return (
    <div
      className={`mx-2 mb-1 px-2.5 py-1 rounded-md text-[11px] flex items-center gap-1.5 ${palette}`}
      title="Sesi SMTP akan berakhir — klik Keluar untuk perpanjang."
    >
      <Timer size={11} className="shrink-0" />
      <span>SMTP {text}</span>
    </div>
  );
}
