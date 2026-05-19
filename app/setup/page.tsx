import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { CheckCircle, AlertCircle, BookOpen } from 'lucide-react'

export default function SetupPage() {
  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-4xl mx-auto space-y-12">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-foreground">Setup & Configuration Guide</h1>
          <p className="text-lg text-muted-foreground">
            Complete guide to setting up the agricultural cooperative SaaS platform
          </p>
        </div>

        {/* Quick Start */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Quick Start
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-primary/20 text-primary font-semibold">
                  1
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground">Supabase is Connected</h3>
                  <p className="text-sm text-muted-foreground">Your Supabase project is configured with the agricultural cooperative schema including user roles, cooperatives, and multi-tenant RLS policies.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-primary/20 text-primary font-semibold">
                  2
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground">Demo Accounts Ready</h3>
                  <p className="text-sm text-muted-foreground">Pre-configured demo accounts for all user roles (super_admin, cooperative_admin, member, guest) are available for testing.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-primary/20 text-primary font-semibold">
                  3
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground">Start Testing</h3>
                  <p className="text-sm text-muted-foreground">Visit the demo page to see credentials and test different user roles and multi-tenant scenarios.</p>
                  <Link href="/demo">
                    <Button className="mt-2 gap-2 bg-primary hover:bg-primary/90" size="sm">
                      <BookOpen className="h-4 w-4" />
                      View Demo Credentials
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Database Schema */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Database Schema</CardTitle>
            <CardDescription>User roles and multi-tenant structure</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div className="bg-background border border-border rounded-lg p-4 space-y-3">
                <div>
                  <h4 className="font-semibold text-foreground">User Roles</h4>
                  <div className="mt-2 space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded-full bg-red-500"></span>
                      <span><strong>super_admin</strong>: Full platform access, manage all cooperatives and users</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded-full bg-blue-500"></span>
                      <span><strong>cooperative_admin</strong>: Full access to assigned cooperative, manage members and marketplace</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded-full bg-green-500"></span>
                      <span><strong>member</strong>: Member of cooperative, access marketplace and member features</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded-full bg-gray-500"></span>
                      <span><strong>guest</strong>: Limited access, view public marketplace only</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-background border border-border rounded-lg p-4 space-y-3">
                <div>
                  <h4 className="font-semibold text-foreground">Tables</h4>
                  <ul className="mt-2 space-y-2 text-sm">
                    <li><strong>profiles</strong>: User information, roles, and cooperative assignments</li>
                    <li><strong>cooperatives</strong>: Cooperative details, branding, and settings</li>
                    <li><strong>user_role</strong>: Enum type defining available roles</li>
                  </ul>
                </div>
              </div>

              <div className="bg-background border border-border rounded-lg p-4 space-y-3">
                <div>
                  <h4 className="font-semibold text-foreground">Row Level Security</h4>
                  <ul className="mt-2 space-y-2 text-sm">
                    <li>Users can only view their own profile</li>
                    <li>Super admins can view all profiles</li>
                    <li>Cooperative admins can view members of their cooperative</li>
                    <li>All cooperatives are viewable, but data is isolated by RLS policies</li>
                  </ul>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Demo Cooperatives */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Pre-configured Demo Cooperatives</CardTitle>
            <CardDescription>Test multi-tenant isolation</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="border border-border rounded-lg p-4">
                <h4 className="font-semibold text-foreground">Coopérative du Nord</h4>
                <p className="text-sm text-muted-foreground mt-1">Leading agricultural cooperative in Northern France</p>
                <p className="text-xs text-muted-foreground mt-2">Primary Color: #2d5016</p>
              </div>
              <div className="border border-border rounded-lg p-4">
                <h4 className="font-semibold text-foreground">Fermes Unies</h4>
                <p className="text-sm text-muted-foreground mt-1">United farms cooperative for sustainable agriculture</p>
                <p className="text-xs text-muted-foreground mt-2">Primary Color: #1a4d2e</p>
              </div>
              <div className="border border-border rounded-lg p-4">
                <h4 className="font-semibold text-foreground">Alliance Agricole</h4>
                <p className="text-sm text-muted-foreground mt-1">Premier cooperative for organic products</p>
                <p className="text-xs text-muted-foreground mt-2">Primary Color: #3d6b4a</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Important Notes */}
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-900">
              <AlertCircle className="h-5 w-5" />
              Important Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-yellow-800 space-y-3">
            <p>
              <strong>Demo Accounts:</strong> The demo accounts are pre-configured in the Supabase authentication system. Use the credentials from the demo page to log in.
            </p>
            <p>
              <strong>Email Confirmation:</strong> In production, email confirmation would be required. For demo purposes, you can login immediately with demo credentials.
            </p>
            <p>
              <strong>Multi-Tenancy:</strong> Each cooperative is completely isolated by RLS policies. When you log in as a cooperative admin, you only see data for that cooperative.
            </p>
            <p>
              <strong>Creating New Users:</strong> Sign up with any email address to create new test users. They will be created as &apos;member&apos; role by default and can be promoted through admin panel.
            </p>
          </CardContent>
        </Card>

        {/* Next Steps */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Next Steps</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="space-y-3 list-decimal list-inside text-sm text-muted-foreground">
              <li>Visit the <Link href="/demo" className="text-primary hover:underline">demo credentials page</Link> to see all test accounts</li>
              <li>Log in with a super admin account to access the admin dashboard</li>
              <li>Explore the cooperative admin features with a cooperative_admin account</li>
              <li>Test member features by logging in as a member</li>
              <li>Notice how data is isolated by cooperative (multi-tenancy)</li>
              <li>Create new accounts through signup to test the full user flow</li>
            </ol>
          </CardContent>
        </Card>

        {/* Links */}
        <div className="flex gap-4 justify-center">
          <Link href="/demo">
            <Button className="gap-2 bg-primary hover:bg-primary/90">
              <BookOpen className="h-4 w-4" />
              View Demo Credentials
            </Button>
          </Link>
          <Link href="/auth/login">
            <Button variant="outline" className="border-border">
              Go to Login
            </Button>
          </Link>
          <Link href="/">
            <Button variant="outline" className="border-border">
              Back to Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
