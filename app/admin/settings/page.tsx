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
      toast({ title: 'Échec de la sauvegarde', description: errorMessage(error), variant: 'destructive' })
      return
    }
    toast({ title: 'Paramètres enregistrés' })
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
        title="Paramètres de la plateforme"
        description="Configuration et administration de la plateforme"
      />

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3 border-b border-border bg-transparent">
          <TabsTrigger value="general" className="border-b-2 border-transparent data-[state=active]:border-primary">
            Général
          </TabsTrigger>
          <TabsTrigger value="security" className="border-b-2 border-transparent data-[state=active]:border-primary">
            Sécurité
          </TabsTrigger>
          <TabsTrigger value="info" className="border-b-2 border-transparent data-[state=active]:border-primary">
            Info
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6 mt-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Paramètres généraux</CardTitle>
              <CardDescription>Configuration de base de la plateforme</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Nom de la plateforme</Label>
                <Input
                  value={platform.platform_name}
                  onChange={(e) =>
                    setPlatform((s) => ({ ...s, platform_name: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Email de support</Label>
                <Input
                  type="email"
                  value={platform.support_email}
                  onChange={(e) =>
                    setPlatform((s) => ({ ...s, support_email: e.target.value }))
                  }
                />
              </div>
              <Toggle
                label="Mode maintenance"
                description="Désactiver l'accès à la plateforme pour les utilisateurs non-admin"
                value={platform.maintenance_mode}
                onChange={(v) => setPlatform((s) => ({ ...s, maintenance_mode: v }))}
              />
              <Button
                className="bg-primary hover:bg-primary/90 gap-2"
                onClick={() => saveSettings('platform', { ...platform })}
                disabled={loading || saving !== null}
              >
                {saving === 'platform' ? <Spinner className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                Enregistrer les paramètres
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6 mt-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Paramètres de sécurité</CardTitle>
              <CardDescription>Gérer les fonctionnalités de sécurité de la plateforme</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(
                [
                  ['force_https', 'Forcer HTTPS', 'Bloquer le trafic HTTP non sécurisé'],
                  ['two_fa_admins', '2FA pour les admins', 'Exiger l\'authentification à deux facteurs pour les administrateurs'],
                  ['ip_whitelisting', 'Liste blanche IP', 'Autoriser uniquement les IP spécifiées pour la zone admin'],
                  ['rate_limiting', 'Limitation de débit API', 'Limiter les requêtes API/widget par IP'],
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
                Enregistrer les paramètres
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="info" className="space-y-6 mt-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Info className="h-5 w-5" />
                Sauvegarde &amp; Email
              </CardTitle>
              <CardDescription>Où gérer ces paramètres</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Les sauvegardes de la base de données sont gérées par votre projet Supabase. Configurez la rétention et
                la récupération ponctuelle dans le tableau de bord Supabase sous{' '}
                <strong>Settings → Database → Backups</strong>.
              </p>
              <p className="text-sm text-muted-foreground">
                Les emails transactionnels (confirmation d'inscription, réinitialisation de mot de passe) sont envoyés via
                Supabase Auth. Personnalisez les modèles sous{' '}
                <strong>Authentication → Email Templates</strong>.
              </p>
              <a
                href="https://supabase.com/docs/guides/auth/auth-email-templates"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block"
              >
                <Button variant="outline" size="sm" className="border-border">
                  Ouvrir la doc Supabase
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
            Zone de danger
          </CardTitle>
          <CardDescription className="text-destructive/80">
            Opérations pouvant affecter toutes les coopératives de la plateforme.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            La maintenance destructive (purge, restauration, migrations de schéma) est effectuée via la
            console du projet Supabase plutôt que depuis cette interface.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
