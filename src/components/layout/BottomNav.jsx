import React from 'react'
import { NavLink } from 'react-router'
import { NAV_ITEMS } from '../../constants/navigation'

export default function BottomNav() {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 bg-card border-t border-border flex z-50">
      {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center py-3 gap-1 text-[10px] font-medium transition-colors
             ${isActive ? 'text-primary' : 'text-muted-foreground'}`
          }
        >
          <Icon size={20} />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
