'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { 
  BarChart3, 
  Users, 
  Settings, 
  LogOut,
  Menu,
  X,
  Building2,
  TrendingUp,
  LayoutDashboard,
} from 'lucide-react'
import { useState } from 'react'
import { Logo } from '@/components/shared/logo'
import { useAuth } from '@/app/context/auth-context'
import { ProtectedRoute } from '@/app/components/protected-route'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { logout } = useAuth()

  const handleLogout = async () => {
    await logout()
    router.push('/')
  }

  const adminLinks = [
    { href: '/admin', label: 'Overview', icon: TrendingUp },
    { href: '/admin/cooperatives', label: 'Cooperatives', icon: Building2 },
    { href: '/admin/users', label: 'Users', icon: Users },
    { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
    { href: '/admin/settings', label: 'Settings', icon: Settings },
  ]

  return (
    <ProtectedRoute requiredRole="super_admin">
      <div className="min-h-screen flex flex-col md:flex-row bg-background">
        {/* Sidebar */}
        <div className={`fixed md:static left-0 top-0 z-40 w-64 h-screen bg-sidebar border-r border-sidebar-border transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}>
          <div className="p-6 flex items-center gap-3 border-b border-sidebar-border">
            <Logo size="lg" textClassName="text-sidebar-foreground" />
          </div>

          <nav className="space-y-2 p-4 flex-1">
            {adminLinks.map((link) => {
              const Icon = link.icon
              const isActive = pathname === link.href
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent/10'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {link.label}
                </Link>
              )
            })}
          </nav>

          <div className="p-4 border-t border-sidebar-border space-y-2">
            <Link href="/dashboard">
              <Button
                variant="outline"
                className="w-full justify-start gap-3 border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent/10"
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </Button>
            </Link>
            <Button
              variant="outline"
              className="w-full justify-start gap-3 border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent/10"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          <div className="md:hidden p-4 border-b border-border flex items-center justify-between bg-card">
            <div className="flex items-center gap-3">
              <Logo size="sm" showText={false} />
              <span className="font-semibold text-foreground">Admin Panel</span>
            </div>
            <Button
              size="icon"
              variant="outline"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="border-border"
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>

          <div className="p-6 md:p-8">
            {children}
          </div>
        </main>

        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </div>
    </ProtectedRoute>
  )
}
