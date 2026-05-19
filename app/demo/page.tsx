'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Copy, Eye, EyeOff, ArrowRight, Shield, Users, User, Globe } from 'lucide-react'
import { useState } from 'react'

const demoAccounts = [
  {
    name: 'Super Admin',
    email: 'admin@demo.local',
    password: 'Demo123!SuperAdmin',
    role: 'super_admin',
    roleLabel: 'Super Admin',
    description: 'Full platform access. Manage all cooperatives, users, and settings.',
    cooperative: 'All cooperatives',
    redirectTo: '/admin',
    icon: Shield,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
  },
  {
    name: 'Cooperative Admin — Nord',
    email: 'coop-admin@demo.local',
    password: 'Demo123!CoopAdmin',
    role: 'cooperative_admin',
    roleLabel: 'Cooperative Admin',
    description: 'Full access to Coopérative du Nord. Manage members, marketplace, and cards.',
    cooperative: 'Coopérative du Nord',
    redirectTo: '/dashboard',
    icon: Users,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
  },
  {
    name: 'Cooperative Admin — Fermes',
    email: 'fermes-admin@demo.local',
    password: 'Demo123!FarmesAdmin',
    role: 'cooperative_admin',
    roleLabel: 'Cooperative Admin',
    description: 'Full access to Fermes Unies. Manage members, marketplace, and cards.',
    cooperative: 'Fermes Unies',
    redirectTo: '/dashboard',
    icon: Users,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
  },
  {
    name: 'Member — Nord',
    email: 'member1@demo.local',
    password: 'Demo123!Member1',
    role: 'member',
    roleLabel: 'Member',
    description: 'Member of Coopérative du Nord. Access marketplace and member features.',
    cooperative: 'Coopérative du Nord',
    redirectTo: '/dashboard',
    icon: User,
    color: 'text-green-600',
    bg: 'bg-green-50',
    border: 'border-green-200',
  },
  {
    name: 'Member — Fermes',
    email: 'member2@demo.local',
    password: 'Demo123!Member2',
    role: 'member',
    roleLabel: 'Member',
    description: 'Member of Fermes Unies. Access marketplace and member features.',
    cooperative: 'Fermes Unies',
    redirectTo: '/dashboard',
    icon: User,
    color: 'text-green-600',
    bg: 'bg-green-50',
    border: 'border-green-200',
  },
  {
    name: 'Guest',
    email: 'guest@demo.local',
    password: 'Demo123!Guest',
    role: 'guest',
    roleLabel: 'Guest',
    description: 'Public marketplace viewing only. No account management features.',
    cooperative: 'None',
    redirectTo: '/dashboard',
    icon: Globe,
    color: 'text-gray-600',
    bg: 'bg-gray-50',
    border: 'border-gray-200',
  },
]

function AccountCard({ account }: { account: typeof demoAccounts[0] }) {
  const [showPassword, setShowPassword] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const Icon = account.icon

  const copy = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopied(field)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <Card className={`border ${account.border}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${account.bg}`}>
              <Icon className={`h-5 w-5 ${account.color}`} />
            </div>
            <div>
              <CardTitle className="text-base text-foreground">{account.name}</CardTitle>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${account.bg} ${account.color}`}>
                {account.roleLabel}
              </span>
            </div>
          </div>
          <Link href={`/auth/login`}>
            <Button size="sm" className="gap-1 bg-primary hover:bg-primary/90 text-xs">
              Login <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
        <CardDescription className="text-sm mt-2">{account.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <div className="flex items-center justify-between p-2 bg-secondary/30 rounded-lg">
          <div>
            <p className="text-xs text-muted-foreground">Email</p>
            <p className="text-sm font-mono text-foreground">{account.email}</p>
          </div>
          <Button
            size="sm" variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => copy(account.email, 'email')}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex items-center justify-between p-2 bg-secondary/30 rounded-lg">
          <div>
            <p className="text-xs text-muted-foreground">Password</p>
            <p className="text-sm font-mono text-foreground">
              {showPassword ? account.password : '••••••••••••'}
            </p>
          </div>
          <div className="flex gap-1">
            <Button
              size="sm" variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
            <Button
              size="sm" variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => copy(account.password, 'password')}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span>Cooperative: <strong className="text-foreground">{account.cooperative}</strong></span>
          <span>→ {account.redirectTo}</span>
        </div>
        {copied && (
          <p className="text-xs text-green-600 text-center">✓ Copied to clipboard</p>
        )}
      </CardContent>
    </Card>
  )
}

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-5xl mx-auto space-y-10">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-foreground">Demo Credentials</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            6 pre-configured accounts to test all roles and features. Data is isolated between cooperatives.
          </p>
          <div className="flex gap-3 justify-center">
            <Link href="/auth/login">
              <Button className="bg-primary hover:bg-primary/90 gap-2">
                Go to Login <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/auth/signup">
              <Button variant="outline" className="border-border">Create Account</Button>
            </Link>
          </div>
        </div>

        {/* Role permissions table */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Role Permissions</CardTitle>
            <CardDescription>What each role can access</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 font-semibold text-foreground">Feature</th>
                    <th className="text-center py-2 px-3 font-semibold text-purple-600">Super Admin</th>
                    <th className="text-center py-2 px-3 font-semibold text-blue-600">Coop Admin</th>
                    <th className="text-center py-2 px-3 font-semibold text-green-600">Member</th>
                    <th className="text-center py-2 px-3 font-semibold text-gray-600">Guest</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Dashboard', '✓', '✓', '✓', 'Limited'],
                    ['Admin Panel', '✓ (all)', '✗', '✗', '✗'],
                    ['Marketplace', '✓', '✓', '✓', '✓ (view)'],
                    ['Members', '✓ (all)', '✓ (own)', '✓', '✗'],
                    ['Member Cards', '✓ (all)', '✓ (own)', '✓', '✗'],
                    ['Analytics', '✓ (all)', '✓ (own)', '✓', '✗'],
                    ['Settings', '✓', '✓ (own)', '✗', '✗'],
                  ].map(([feature, ...cols], i) => (
                    <tr key={i} className="border-b border-border last:border-0 hover:bg-accent/5">
                      <td className="py-2 px-3 text-foreground font-medium">{feature}</td>
                      {cols.map((val, j) => (
                        <td key={j} className={`py-2 px-3 text-center ${val === '✗' ? 'text-muted-foreground' : val.startsWith('✓') ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                          {val}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Account cards */}
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-6">All Demo Accounts</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {demoAccounts.map((account, i) => (
              <AccountCard key={i} account={account} />
            ))}
          </div>
        </div>

        {/* Multi-tenancy test */}
        <Card className="border-border bg-gradient-to-br from-primary/5 to-accent/5">
          <CardHeader>
            <CardTitle className="text-foreground">Test Multi-Tenancy</CardTitle>
            <CardDescription>Verify data isolation between cooperatives</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Login as <strong>coop-admin@demo.local</strong> (Nord) — see only Nord members.
              Then logout and login as <strong>fermes-admin@demo.local</strong> (Fermes) — see completely different data.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-background rounded-lg border border-border">
                <p className="text-xs font-semibold text-blue-600 mb-1">Coopérative du Nord</p>
                <p className="text-xs text-muted-foreground">coop-admin@demo.local</p>
                <p className="text-xs text-muted-foreground">member1@demo.local</p>
              </div>
              <div className="p-3 bg-background rounded-lg border border-border">
                <p className="text-xs font-semibold text-blue-600 mb-1">Fermes Unies</p>
                <p className="text-xs text-muted-foreground">fermes-admin@demo.local</p>
                <p className="text-xs text-muted-foreground">member2@demo.local</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
