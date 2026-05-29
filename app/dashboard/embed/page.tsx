'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Code, Copy, Check, Globe, Palette, Shield, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useCooperative } from '@/app/context/cooperative-context'
import { useToast } from '@/hooks/use-toast'
import { LoadingBlock, Spinner } from '@/components/shared/loading'
import { PageHeader } from '@/components/shared/page-header'
import { errorMessage } from '@/lib/utils/errors'

interface EmbedConfig {
  enabled: boolean
  allowed_origins: string[]
  widgets: string[]
  custom_domain: string | null
  theme: {
    primaryColor: string
    borderRadius: string
    fontFamily: string
  }
  logo_url: string | null
}

const DEFAULT_CONFIG: EmbedConfig = {
  enabled: false,
  allowed_origins: [],
  widgets: ['marketplace', 'member_verify', 'fiches', 'dashboard'],
  custom_domain: null,
  theme: { primaryColor: '#16a34a', borderRadius: '8px', fontFamily: 'Inter' },
  logo_url: null,
}

const WIDGET_OPTIONS = [
  { key: 'marketplace', label: 'Marketplace', description: 'Catalogue de produits' },
  { key: 'member_verify', label: 'Vérification membre', description: 'Vérifier une carte membre' },
  { key: 'fiches', label: 'Fiches techniques', description: 'Catalogue de fiches' },
  { key: 'dashboard', label: 'Dashboard', description: 'Statistiques publiques' },
]

export default function EmbedConfigPage() {
  const { currentCooperative } = useCooperative()
  const { toast } = useToast()
  const supabase = useMemo(() => createClient(), [])
  const [config, setConfig] = useState<EmbedConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [newOrigin, setNewOrigin] = useState('')

  const loadConfig = useCallback(async () => {
    if (!currentCooperative) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data } = await supabase
      .from('embed_configs')
      .select('*')
      .eq('cooperative_id', currentCooperative.id)
      .single()

    if (data) {
      setConfig({
        enabled: data.enabled,
        allowed_origins: data.allowed_origins ?? [],
        widgets: data.widgets ?? DEFAULT_CONFIG.widgets,
        custom_domain: data.custom_domain,
        theme: data.theme ?? DEFAULT_CONFIG.theme,
        logo_url: data.logo_url,
      })
    }
    setLoading(false)
  }, [currentCooperative, supabase])

  useEffect(() => { loadConfig() }, [loadConfig])

  const saveConfig = async () => {
    if (!currentCooperative) return
    setSaving(true)
    const { error } = await supabase.from('embed_configs').upsert({
      cooperative_id: currentCooperative.id,
      enabled: config.enabled,
      allowed_origins: config.allowed_origins,
      widgets: config.widgets,
      custom_domain: config.custom_domain || null,
      theme: config.theme,
      logo_url: config.logo_url,
    }, { onConflict: 'cooperative_id' })
    setSaving(false)

    if (error) {
      toast({ title: 'Erreur', description: errorMessage(error), variant: 'destructive' })
    } else {
      toast({ title: 'Configuration sauvegardée' })
    }
  }

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://app.faitierehub.com'
  const cooperativeId = currentCooperative?.id ?? 'YOUR_COOPERATIVE_ID'

  const embedSnippets = {
    script: `<!-- FaîtiereHub Widget -->
<div data-faitierehub
     data-cooperative-id="${cooperativeId}"
     data-widget="marketplace">
</div>
<script src="${baseUrl}/embed/faitierehub-embed.js"></script>`,

    iframe: `<iframe
  src="${baseUrl}/embed/widget?cooperative_id=${cooperativeId}&widget=marketplace"
  style="width:100%;min-height:500px;border:none;border-radius:8px;"
  loading="lazy"
  title="FaîtiereHub Marketplace"
></iframe>`,

    sdk: `<script src="${baseUrl}/embed/faitierehub-embed.js"></script>
<script>
  FaitierehHub.init({
    cooperativeId: '${cooperativeId}',
    widget: 'marketplace',
    container: '#my-widget',
    theme: ${JSON.stringify(config.theme, null, 2)}
  });
</script>`,
  }

  if (loading) return <LoadingBlock />

  return (
    <div className="space-y-8">
      <PageHeader
        title="Widget Embeddable"
        description="Intégrez FaîtiereHub sur votre site web — WordPress, Webflow, ou HTML personnalisé"
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main config */}
        <div className="lg:col-span-2 space-y-6">
          {/* Enable/disable */}
          <Card className="border-border">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">Activer l'embed</h3>
                  <p className="text-sm text-muted-foreground">Permettre l'intégration sur des sites externes</p>
                </div>
                <Switch
                  checked={config.enabled}
                  onCheckedChange={(v) => setConfig(c => ({ ...c, enabled: v }))}
                />
              </div>
            </CardContent>
          </Card>

          {/* Widgets */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Widgets activés</CardTitle>
              <CardDescription>Choisissez quels widgets sont disponibles pour l'embed</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {WIDGET_OPTIONS.map((w) => (
                <label key={w.key} className="flex items-center justify-between p-3 border border-border rounded-lg cursor-pointer hover:bg-accent/5">
                  <div>
                    <p className="font-medium text-sm text-foreground">{w.label}</p>
                    <p className="text-xs text-muted-foreground">{w.description}</p>
                  </div>
                  <Switch
                    checked={config.widgets.includes(w.key)}
                    onCheckedChange={(checked) => {
                      setConfig(c => ({
                        ...c,
                        widgets: checked
                          ? [...c.widgets, w.key]
                          : c.widgets.filter(x => x !== w.key),
                      }))
                    }}
                  />
                </label>
              ))}
            </CardContent>
          </Card>

          {/* Origins */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Shield className="h-5 w-5" />
                Origines autorisées
              </CardTitle>
              <CardDescription>Domaines autorisés à intégrer vos widgets (laissez vide pour tout autoriser)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="https://votre-site.com"
                  value={newOrigin}
                  onChange={(e) => setNewOrigin(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newOrigin.trim()) {
                      setConfig(c => ({ ...c, allowed_origins: [...c.allowed_origins, newOrigin.trim()] }))
                      setNewOrigin('')
                    }
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    if (newOrigin.trim()) {
                      setConfig(c => ({ ...c, allowed_origins: [...c.allowed_origins, newOrigin.trim()] }))
                      setNewOrigin('')
                    }
                  }}
                >
                  Ajouter
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {config.allowed_origins.map((origin, i) => (
                  <Badge key={i} variant="secondary" className="gap-1 cursor-pointer" onClick={() => {
                    setConfig(c => ({ ...c, allowed_origins: c.allowed_origins.filter((_, j) => j !== i) }))
                  }}>
                    {origin} ×
                  </Badge>
                ))}
                {config.allowed_origins.length === 0 && (
                  <p className="text-xs text-muted-foreground">Tous les domaines sont autorisés</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Theme */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Palette className="h-5 w-5" />
                Thème personnalisé
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Couleur principale</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={config.theme.primaryColor}
                      onChange={(e) => setConfig(c => ({ ...c, theme: { ...c.theme, primaryColor: e.target.value } }))}
                      className="h-9 w-12 rounded border border-border cursor-pointer"
                    />
                    <Input
                      value={config.theme.primaryColor}
                      onChange={(e) => setConfig(c => ({ ...c, theme: { ...c.theme, primaryColor: e.target.value } }))}
                      className="flex-1"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Border radius</Label>
                  <Input
                    value={config.theme.borderRadius}
                    onChange={(e) => setConfig(c => ({ ...c, theme: { ...c.theme, borderRadius: e.target.value } }))}
                    placeholder="8px"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Domaine personnalisé</Label>
                <Input
                  value={config.custom_domain ?? ''}
                  onChange={(e) => setConfig(c => ({ ...c, custom_domain: e.target.value || null }))}
                  placeholder="marketplace.votre-faitiere.org"
                />
                <p className="text-xs text-muted-foreground">Configurez un CNAME vers app.faitierehub.com</p>
              </div>
            </CardContent>
          </Card>

          <Button className="w-full gap-2 bg-primary hover:bg-primary/90" onClick={saveConfig} disabled={saving}>
            {saving ? <Spinner className="h-4 w-4" /> : null}
            Sauvegarder la configuration
          </Button>
        </div>

        {/* Code snippets */}
        <div className="space-y-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground text-lg">
                <Code className="h-5 w-5" />
                Code d'intégration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="auto" className="w-full">
                <TabsList className="grid w-full grid-cols-3 text-xs">
                  <TabsTrigger value="auto">Auto</TabsTrigger>
                  <TabsTrigger value="iframe">iFrame</TabsTrigger>
                  <TabsTrigger value="sdk">SDK</TabsTrigger>
                </TabsList>

                {Object.entries(embedSnippets).map(([key, code]) => (
                  <TabsContent key={key} value={key === 'script' ? 'auto' : key} className="mt-4">
                    <div className="relative">
                      <pre className="bg-secondary/30 rounded-lg p-3 text-xs overflow-x-auto max-h-48 text-foreground">
                        <code>{code}</code>
                      </pre>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="absolute top-2 right-2 h-7 w-7 p-0"
                        onClick={() => copyToClipboard(code, key)}
                      >
                        {copied === key ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>

          <Card className="border-border bg-gradient-to-br from-primary/5 to-accent/5">
            <CardHeader>
              <CardTitle className="text-foreground text-lg">Aperçu</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border border-border rounded-lg overflow-hidden bg-background">
                <div className="p-3 border-b border-border bg-secondary/20 flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">votre-site.com</span>
                </div>
                <div className="p-4 text-center text-sm text-muted-foreground">
                  <p>Widget {config.widgets[0] ?? 'marketplace'}</p>
                  <p className="text-xs mt-1">Couleur: {config.theme.primaryColor}</p>
                </div>
              </div>
              {config.enabled && (
                <a
                  href={`/embed/widget?cooperative_id=${cooperativeId}&widget=marketplace`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-3 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  Voir le widget en plein écran
                </a>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
