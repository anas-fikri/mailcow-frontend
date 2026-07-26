import { Mail, Calendar, Users, Settings, BarChart3, Filter } from 'lucide-react'

export const NAV_ITEMS = [
  { to: '/mail',     icon: Mail,     label: 'Email' },
  { to: '/calendar', icon: Calendar, label: 'Kalender' },
  { to: '/contacts', icon: Users,    label: 'Kontak' },
  { to: '/rules',    icon: Filter,   label: 'Aturan' },
  { to: '/stats',    icon: BarChart3, label: 'Statistik' },
  { to: '/settings', icon: Settings, label: 'Pengaturan' },
]
