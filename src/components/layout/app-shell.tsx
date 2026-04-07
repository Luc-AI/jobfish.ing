'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Settings, Bell } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/preferences', label: 'Preferences', icon: Settings },
  { href: '/notifications', label: 'Notifications', icon: Bell },
]

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 border-r bg-card flex flex-col shrink-0">
        <div className="p-5 border-b">
          <span className="font-bold text-lg tracking-tight">jobfishing</span>
          <p className="text-xs text-muted-foreground mt-0.5">Jobs find you.</p>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                pathname === href || pathname.startsWith(href + '/')
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
