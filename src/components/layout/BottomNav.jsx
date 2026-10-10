import React, { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import { Ellipsis, X } from 'lucide-react'
import { NAV_ITEMS } from '../../constants/navigation'

// Di layar 320px, 6 item @10px terjepit. Tampilkan 4 tujuan paling sering
// dipakai + "Lainnya" (sheet kecil) yang menampung sisanya — total 5 target
// 44px tanpa scroll horizontal. Urutan mengikuti NAV_ITEMS (sumber tunggal).
const PRIMARY_PATHS = ['/mail', '/calendar', '/contacts', '/settings']

export default function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()
  const sheetRef = useRef(null)
  const moreBtnRef = useRef(null)

  const primary = NAV_ITEMS.filter((n) => PRIMARY_PATHS.includes(n.to))
  const overflow = NAV_ITEMS.filter((n) => !PRIMARY_PATHS.includes(n.to))
  const overflowActive = overflow.some((n) => location.pathname.startsWith(n.to))

  // Tutup sheet saat rute berubah (NavLink di dalam sheet dipilih).
  useEffect(() => { setMoreOpen(false) }, [location.pathname])

  // Esc → tutup + kembalikan fokus ke tombol "Lainnya".
  useEffect(() => {
    if (!moreOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); setMoreOpen(false); moreBtnRef.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    // Fokus ke item pertama sheet agar keyboard/screen reader langsung di dalam.
    const first = sheetRef.current?.querySelector('a,button')
    first?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [moreOpen])

  const itemCls = (isActive) =>
    `flex-1 min-w-0 flex flex-col items-center justify-center min-h-11 py-2 gap-0.5 text-[11px] leading-tight font-medium transition-colors ${
      isActive ? 'text-primary' : 'text-muted-foreground'
    }`

  return (
    <>
      {/* Sheet "Lainnya" — hanya mobile */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-[55]" role="presentation">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMoreOpen(false)} />
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu lainnya"
            className="absolute inset-x-0 bottom-0 bg-card border-t border-border rounded-t-2xl shadow-xl p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]"
          >
            <div className="flex items-center justify-between px-2 pt-1 pb-2">
              <span className="text-sm font-semibold text-foreground">Lainnya</span>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="min-w-11 min-h-11 -mr-2 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                aria-label="Tutup menu lainnya"
              >
                <X size={18} />
              </button>
            </div>
            {overflow.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 min-h-11 rounded-xl text-sm font-medium ${
                    isActive ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'
                  }`
                }
              >
                <Icon size={18} className="shrink-0" />
                <span className="truncate">{label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      )}

      <nav
        className="md:hidden fixed bottom-0 inset-x-0 w-full max-w-[100vw] bg-card border-t border-border flex z-50 overflow-hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        aria-label="Navigasi utama"
      >
        {primary.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} className={({ isActive }) => itemCls(isActive)}>
            <Icon size={20} className="shrink-0" />
            <span className="truncate max-w-full">{label}</span>
          </NavLink>
        ))}
        <button
          ref={moreBtnRef}
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className={itemCls(overflowActive || moreOpen)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          aria-label="Menu lainnya"
        >
          <Ellipsis size={20} className="shrink-0" />
          <span className="truncate max-w-full">Lainnya</span>
        </button>
      </nav>
    </>
  )
}
