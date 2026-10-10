import React, { useEffect, useRef, useState } from 'react'
import { Mail, LogOut, HelpCircle, Timer, Settings, Keyboard, ChevronUp } from 'lucide-react'
import { NavLink, useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../store/authStore'
import { logout, fetchSmtpSessionStatus } from '../../lib/api'
import { Sun, Moon, Monitor, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { NAV_ITEMS } from '../../constants/navigation'
import { formatRemaining, sessionWarningLevel, SHOW_BELOW_MINUTES } from '../../lib/sessionCountdown'
import Avatar from '../Avatar'

/** Nama event global utk membuka panel pintasan keyboard (didengarkan MailPage). */
const OPEN_SHORTCUTS_EVENT = 'pcp:open-shortcuts'

export default function Sidebar({ collapsed, onToggleCollapse, onClose }) {
  const { user, clearUser, theme, cycleTheme } = useAuthStore()
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
    <aside className={`flex flex-col h-full min-w-0 bg-card border-r border-border w-full transition-all`}>
      {/* Brand — tinggi disamakan dengan .pane-header (h-12) agar sejajar
          dengan header pane konten di sebelahnya. */}
      <div className="h-12 px-3 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0 pl-1">
          <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center shrink-0">
            <Mail size={15} className="text-primary-foreground" />
          </div>
          {!collapsed && (
            <span className="font-semibold tracking-tight text-foreground text-[13px] truncate capitalize">
              {user?.email ? user.email.split('@')[1] : 'Webmail'}
            </span>
          )}
        </div>

        {/* Toggle buttons */}
        <div className="flex items-center">
          {/* Mobile close */}
          <button className="md:hidden min-w-11 min-h-11 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-150" onClick={onClose} aria-label="Tutup menu">
            <X size={18} />
          </button>
          {/* Desktop collapse */}
          <button className="hidden md:flex min-w-11 min-h-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-150" onClick={onToggleCollapse} aria-label={collapsed ? 'Buka sidebar' : 'Ciutkan sidebar'}>
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
      </div>

      {/* Nav — state aktif satu sinyal saja: tint bg-primary/10 + teks primary
          (kontrak desain: tanpa border + chevron bertumpuk). */}
      <nav className="flex-1 p-2 flex flex-col gap-0.5 overflow-y-auto overflow-x-hidden">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => { if(window.innerWidth < 768) onClose(); }}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 min-h-11 md:min-h-9 rounded-md text-[13px] font-medium transition-colors duration-150 ${
                collapsed ? 'justify-center' : ''
              } ${isActive
                 ? 'bg-primary/10 text-primary'
                 : 'text-muted-foreground hover:text-foreground hover:bg-muted'
               }`
            }
            title={collapsed ? label : undefined}
          >
            <Icon size={18} className="shrink-0" />
            {!collapsed && <span className="flex-1 truncate">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Bantuan + akun */}
      <div className="p-2 border-t border-border flex flex-col gap-0.5">
        <a
          href={`/webmail/help/email-settings.html?domain=${user?.email ? user.email.split('@')[1] : 'pcpexpress.com'}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-2.5 px-3 min-h-11 md:min-h-9 rounded-md text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150 ${collapsed ? 'justify-center' : ''}`}
          title="Panduan Setting Email"
          aria-label="Panduan Setting Email"
        >
          <HelpCircle size={18} className="shrink-0" />
          {!collapsed && <span className="truncate">Panduan Setting</span>}
        </a>

        {/* Countdown sesi SMTP — hanya tampil saat < 15 mnt agar tidak berisik */}
        {!collapsed && remainingMs != null && remainingMs < SHOW_BELOW_MINUTES * 60_000 && (
          <SessionCountdown remainingMs={remainingMs} />
        )}

        <AccountMenu
          user={user}
          theme={theme}
          collapsed={collapsed}
          onCycleTheme={cycleTheme}
          onOpenSettings={() => { navigate('/settings'); if (window.innerWidth < 768) onClose(); }}
          onOpenShortcuts={() => {
            // MailPage (atau halaman lain) mendengarkan event ini utk membuka
            // panel pintasan — Sidebar tidak perlu tahu implementasinya.
            try { window.dispatchEvent(new CustomEvent(OPEN_SHORTCUTS_EVENT)); } catch { /* browser lama */ }
            if (window.innerWidth < 768) onClose();
          }}
          onLogout={handleLogout}
        />
      </div>
    </aside>
  )
}

/**
 * Menu akun ala Outlook: avatar + nama membuka dropdown (role="menu") berisi
 * identitas, Pengaturan, siklus tema, pintasan keyboard, dan Keluar.
 * Aksesibilitas: Esc / klik-luar menutup; panah atas/bawah, Home/End
 * berpindah item; fokus kembali ke tombol pemicu saat menutup.
 */
function AccountMenu({ user, theme, collapsed, onCycleTheme, onOpenSettings, onOpenShortcuts, onLogout }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)

  const displayName = user?.cn || user?.email?.split('@')[0] || 'Akun'
  const themeLabel = theme === 'dark' ? 'Gelap' : theme === 'light' ? 'Terang' : 'Otomatis'
  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor

  const close = (restoreFocus = true) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }

  // Klik di luar + Esc
  useEffect(() => {
    if (!open) return
    const onPointer = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('touchstart', onPointer, { passive: true })
    document.addEventListener('keydown', onKey, true)
    // Fokus ke item pertama saat terbuka (pola WAI-ARIA menu button).
    const first = menuRef.current?.querySelector('[role="menuitem"]')
    first?.focus()
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('touchstart', onPointer)
      document.removeEventListener('keydown', onKey, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close stabil secara fungsional
  }, [open])

  // Navigasi panah di dalam menu
  const onMenuKeyDown = (e) => {
    const items = Array.from(menuRef.current?.querySelectorAll('[role="menuitem"]') || [])
    if (!items.length) return
    const idx = items.indexOf(document.activeElement)
    let next = null
    if (e.key === 'ArrowDown') next = items[(idx + 1) % items.length]
    else if (e.key === 'ArrowUp') next = items[(idx - 1 + items.length) % items.length]
    else if (e.key === 'Home') next = items[0]
    else if (e.key === 'End') next = items[items.length - 1]
    else if (e.key === 'Tab') { close(false); return }
    if (next) { e.preventDefault(); next.focus() }
  }

  const onTriggerKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true) }
  }

  const run = (fn, { keepOpen = false } = {}) => () => {
    fn?.()
    if (!keepOpen) close()
  }

  const itemCls = 'w-full flex items-center gap-2.5 px-3 min-h-11 md:min-h-9 rounded-md text-[13px] text-left text-foreground hover:bg-muted focus-visible:bg-muted outline-none transition-colors duration-150'

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Menu akun ${displayName}`}
        title={collapsed ? displayName : undefined}
        className={`w-full flex items-center gap-2.5 px-2 min-h-11 rounded-md hover:bg-muted transition-colors duration-150 ${collapsed ? 'justify-center' : ''} ${open ? 'bg-muted' : ''}`}
      >
        <Avatar name={user?.cn} email={user?.email} size="sm" title="" />
        {!collapsed && (
          <>
            <span className="flex-1 min-w-0 text-left">
              <span className="block text-xs font-medium text-foreground truncate">{displayName}</span>
              <span className="block text-[11px] text-muted-foreground truncate">{user?.email}</span>
            </span>
            <ChevronUp size={14} className={`shrink-0 text-muted-foreground transition-transform ${open ? '' : 'rotate-180'}`} aria-hidden="true" />
          </>
        )}
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Menu akun"
          onKeyDown={onMenuKeyDown}
          className={`absolute z-50 w-64 max-w-[calc(100vw-1.5rem)] bg-popover border border-border rounded-lg shadow-md p-1 ${
            collapsed ? 'left-full bottom-0 ml-2' : 'left-0 right-0 bottom-full mb-2 w-auto'
          }`}
        >
          {/* Identitas */}
          <div className="flex items-center gap-3 px-3 py-2.5 border-b border-border mb-1">
            <Avatar name={user?.cn} email={user?.email} size="md" title="" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground truncate">{displayName}</div>
              <div className="text-xs text-muted-foreground truncate" title={user?.email}>{user?.email}</div>
            </div>
          </div>

          <button type="button" role="menuitem" tabIndex={-1} className={itemCls} onClick={run(onOpenSettings)}>
            <Settings size={16} className="shrink-0 text-muted-foreground" />
            <span>Pengaturan</span>
          </button>

          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className={itemCls}
            onClick={run(onCycleTheme, { keepOpen: true })}
            aria-label="Ganti tema"
            title="Klik untuk siklus: Gelap → Terang → Otomatis"
          >
            <ThemeIcon size={16} className="shrink-0 text-muted-foreground" />
            <span className="flex-1">Tema</span>
            <span className="text-xs text-muted-foreground">{themeLabel}</span>
          </button>

          <button type="button" role="menuitem" tabIndex={-1} className={itemCls} onClick={run(onOpenShortcuts)}>
            <Keyboard size={16} className="shrink-0 text-muted-foreground" />
            <span className="flex-1">Pintasan keyboard</span>
            <kbd className="text-[11px] px-1.5 py-0.5 rounded border border-border bg-muted text-muted-foreground font-mono">?</kbd>
          </button>

          <div className="border-t border-border my-1" role="separator" />

          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className={`${itemCls} hover:text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10`}
            onClick={run(onLogout)}
            aria-label="Keluar"
          >
            <LogOut size={16} className="shrink-0" />
            <span>Keluar</span>
          </button>
        </div>
      )}
    </div>
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
    ok:     'text-muted-foreground',
    warn:   'bg-amber-500/10 text-amber-900 dark:text-amber-400',
    urgent: 'bg-destructive/10 text-destructive animate-pulse',
  }[level];
  return (
    <div
      className={`mx-1 mb-0.5 px-3 py-1 rounded-md text-[11px] flex items-center gap-1.5 ${palette}`}
      title="Sesi SMTP akan berakhir — klik Keluar untuk perpanjang."
    >
      <Timer size={11} className="shrink-0" />
      <span>SMTP {text}</span>
    </div>
  );
}
