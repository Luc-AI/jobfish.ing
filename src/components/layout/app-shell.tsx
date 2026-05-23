'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, Settings, Bell, LogOut, UserCircle, ChevronUp, Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/preferences', label: 'Preferences', icon: Settings },
  { href: '/notifications', label: 'Notifications', icon: Bell },
]

interface AppShellProps {
  children: React.ReactNode
  userEmail?: string
}

export function AppShell({ children, userEmail }: AppShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const navLinks = (onClickExtra?: () => void) =>
    navItems.map(({ href, label, icon: Icon }) => (
      <Link
        key={href}
        href={href}
        onClick={onClickExtra}
        className={cn(
          'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors min-h-[44px]',
          pathname === href || pathname.startsWith(href + '/')
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
        )}
      >
        <Icon className="h-4 w-4" />
        {label}
      </Link>
    ))

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden">
      {/* Mobile header — visible only below md */}
      <header className="flex md:hidden items-center justify-between px-4 h-14 border-b bg-card shrink-0">
        <span className="font-bold text-lg tracking-tight">jobfishing</span>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              aria-label="Open navigation"
              className="flex items-center justify-center h-11 w-11 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Menu className="h-5 w-5" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64 gap-0">
            <div className="p-5 border-b">
              <span className="font-bold text-lg tracking-tight">jobfishing</span>
              <p className="text-xs text-muted-foreground mt-0.5">Jobs find you.</p>
            </div>
            <nav className="flex-1 p-3 space-y-0.5">
              {navLinks(() => setOpen(false))}
            </nav>
            <div className="p-3 border-t mt-auto">
              <button
                onClick={() => { setOpen(false); handleSignOut() }}
                className="flex items-center gap-2.5 w-full px-3 py-2 min-h-[44px] rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>
          </SheetContent>
        </Sheet>
      </header>

      {/* Desktop sidebar — hidden on mobile, visible md and above */}
      <aside className="hidden md:flex w-56 border-r bg-card flex-col shrink-0">
        <div className="p-5 border-b">
          <span className="font-bold text-lg tracking-tight">jobfishing</span>
          <p className="text-xs text-muted-foreground mt-0.5">Jobs find you.</p>
        </div>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navLinks()}
        </nav>
        <div className="p-3 border-t">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                <UserCircle className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate text-left">Account</span>
                <ChevronUp className="h-3 w-3 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-52">
              {userEmail && (
                <>
                  <DropdownMenuLabel className="font-normal text-xs text-muted-foreground truncate">
                    {userEmail}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem asChild>
                <Link href="/account" className="cursor-pointer">
                  <UserCircle className="h-4 w-4 mr-2" />
                  Account settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="text-destructive focus:text-destructive cursor-pointer"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
