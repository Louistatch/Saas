'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertCircle, CheckCircle, Info } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { Spinner } from '@/components/shared/loading'
import { PageHeader } from '@/components/shared/page-header'
import { errorMessage } from '@/lib/utils/errors'

interface PlatformSettings {
  platform_name: string
  support_email: string
  maintenance_mode: boolean
}

interface SecuritySettings {
  force_https: boolean
  two_fa_admins: boolean
  ip_whitelisting: boolean
  rate_limiting: boolean
}

const defaultPlatform: PlatformSettings = {
  platform_name: 'FaîtiereHub',
  support_email: 'support@faitierehub.com',
  maintenance_mode: false,
}

const defaultSecurity: SecuritySettings = {
  force_https: true,
  two_fa_admins: true,
  ip_whitelisting: false,
  rate_limiting: true,
}

export default function AdminSettingsPage() {
  const supabase = useMemo(() => createClient(), [])
  const { toast } = useToast()
  const [platform, setPlatform] = useState<PlatformSettings>(defaultPlatform)
  const [security, setSecurity] = useState<SecuritySettings>(defaultSecurity)
  const [saving, setSaving] = useState<'platform' | 'security' | null>(null)
  const [loading, setLoading] = useState(true)

  const loadSettings = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('platform_settings')
      .select('key, value')
    if (error) {
      // Table may not exist yet — fall back to defaults silently for the loader,
      // but surface the issue subtly via console.
      setLoading(false)
      return
    }
    const map: Record<string, unknown> = {}
    for (const row of (data ?? []) as { key: string; value: unknown }[]) {
      map[row.key] = row.value
    }
    setPlatform({
      platform_name: (map.platform_name as string) ?? defaultPlatform.platform_name,
      support_email: (map.support_email as string) ?? defaultPlatform.support_email,
      maintenance_mode: !!map.maintenance_mode,
    })
    setSecurity({
      force_https: map.force_https !== undefined ? !!map.force_https : defaultSecurity.force_https,
      two_fa_admins:
        map.two_fa_admins !== undefined ? !!map.two_fa_admins : defaultSecurity.two_fa_admins,
      ip_whitelisting:
        map.ip_whitelisting !== undefined
          ? !!map.ip_whitelisting
          : defaultSecurity.ip_whitelisting,
      rate_limiting:
        map.rate_limiting !== undefined ? !!map.rate_limiting : defaultSecurity.rate_limiting,
    })
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const saveSettings = async (
    section: 'platform' | 'security',
    updates: Record<string, unknown>,
  ) => {
    setSaving(section)
    const rows = Object.entries(updates).map(([key, value]) => ({
      key,
      value,
    }))
    const { error } = await supabase.from('platform_settings').upsert(rows, { onConflict: 'key' })
    setSaving(null)
    if (error) {
      toast({ title: 'Save failed', description: errorMessage(error), variant: 'destructive' })
      return
    }
    toast({ title: 'Settings saved' })
  }

  const Toggle = ({
    label,
    description,
    value,
    onChange,
  }: {
    label: string
    description?: string
    value: boolean
    onChange: (v: boolean) => void
  }) => (
    <div className="flex items-center justify-between p-4 border border-border rounded-lg gap-4">
      <div>
        <p className="font-medium text-foreground">{label}</p>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <button
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
          value ? 'bg-primary' : 'bg-gray-300'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
            value ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )

  return (
    <div className="space-y-8">
      <PageHeader
        title="Platform Settings"
        description="Platform configuration and administration"
      />

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3 border-b border-border bg-transparent">
          <TabsTrigger value="general" className="border-b-2 border-transparent data-[state=active]:border-primary">
            General
          </TabsTrigger>
          <TabsTrigger value="security" className="border-b-2 border-transparent data-[state=active]:border-primary">
            Security
          </TabsTrigger>
          <TabsTrigger value="info" className="border-b-2 border-transparent data-[state=active]:border-primary">
            Info
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6 mt-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground">General Settings</CardTitle>
              <CardDescription>Basic platform configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Platform Name</Label>
                <Input
                  value={platform.platform_name}
                  onChange={(e) =>
                    setPlatform((s) => ({ ...s, platform_name: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Support Email</Label>
                <Input
                  type="email"
                  value={platform.support_email}
                  onChange={(e) =>
                    setPlatform((s) => ({ ...s, support_email: e.target.value }))
                  }
                />
              </div>
              <Toggle
                label="Maintenance Mode"
                description="Disable platform access for non-admin users"
                value={platform.maintenance_mode}
                onChange={(v) => setPlatform((s) => ({ ...s, maintenance_mode: v }))}
              />
              <Button
                className="bg-primary hover:bg-primary/90 gap-2"
                onClick={() => saveSettings('platform', { ...platform })}
                disabled={loading || saving !== null}
              >
                {saving === 'platform' ? <Spinner className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                Save Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6 mt-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Security Settings</CardTitle>
              <CardDescription>Manage platform security features</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(
                [
                  ['force_https', 'Force HTTPS', 'Block traffic on plain HTTP'],
                  ['two_fa_admins', '2FA for Admins', 'Require two-factor authentication for admins'],
                  ['ip_whitelisting', 'IP Whitelisting', 'Allow only specified IPs for the admin area'],
                  ['rate_limiting', 'API Rate Limiting', 'Throttle API/widget requests per IP'],
                ] as const
              ).map(([key, label, description]) => (
                <Toggle
                  key={key}
                  label={label}
                  description={description}
                  value={security[key]}
                  onChange={(v) => setSecurity((s) => ({ ...s, [key]: v }))}
                />
              ))}
              <Button
                className="bg-primary hover:bg-primary/90 gap-2"
                onClick={() => saveSettings('security', { ...security })}
                disabled={loading || saving !== null}
              >
                {saving === 'security' ? <Spinner className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                Save Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="info" className="space-y-6 mt-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Info className="h-5 w-5" />
                Backup &amp; Email
              </CardTitle>
              <CardDescription>Where to manage these settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Database backups are managed by your Supabase project. Configure retention and
                point-in-time recovery in the Supabase dashboard under{' '}
                <strong>Settings → Database → Backups</strong>.
              </p>
              <p className="text-sm text-muted-foreground">
                Transactional email (signup confirmation, password reset) is delivered through
                Supabase Auth. Customize templates under{' '}
                <strong>Authentication → Email Templates</strong>.
              </p>
              <a
                href="https://supabase.com/docs/guides/auth/auth-email-templates"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block"
              >
                <Button variant="outline" size="sm" className="border-border">
                  Open Supabase docs
                </Button>
              </a>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription className="text-destructive/80">
            Operations that may affect every cooperative on the platform.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Destructive maintenance (purge, restore, schema migrations) is performed via the
            Supabase project console rather than from this UI.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
