import React from 'react'
import { Mail, LogOut, ChevronRight, HelpCircle } from 'lucide-react'
import { NavLink, useNavigate } from 'react-router'
import { useAuthStore } from '../../store/authStore'
import { logout } from '../../lib/api'
import { Sun, Moon, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { NAV_ITEMS } from '../../constants/navigation'

export default function Sidebar({ collapsed, onToggleCollapse, onClose }) {
  const { user, clearUser, theme, toggleTheme } = useAuthStore()
  const navigate = useNavigate()

  async function handleLogout() {
    const smtpToken = useAuthStore.getState().smtpToken
    await logout(smtpToken).catch(() => {})
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
          <button className="md:hidden p-1.5 rounded-lg text-muted-foreground hover:bg-muted" onClick={onClose}>
            <X size={18} />
          </button>
          {/* Desktop collapse */}
          <button className="hidden md:flex p-1.5 rounded-lg text-muted-foreground hover:bg-muted" onClick={onToggleCollapse}>
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
          className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all ${collapsed ? 'justify-center' : ''}`}
          title="Ganti Tema"
        >
          {theme === 'dark' ? <Sun size={15} className="shrink-0" /> : <Moon size={15} className="shrink-0" />}
          {!collapsed && <span>Tema {theme === 'dark' ? 'Terang' : 'Gelap'}</span>}
        </button>

        <a
          href="/webmail/help/email-settings.html"
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
        <button
          onClick={handleLogout}
          className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all ${collapsed ? 'justify-center' : ''}`}
          title="Keluar"
        >
          <LogOut size={15} className="shrink-0" />
          {!collapsed && <span>Keluar</span>}
        </button>
      </div>
    </aside>
  )
}
