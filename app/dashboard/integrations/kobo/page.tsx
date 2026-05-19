'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowRight, CheckCircle2, Key, Settings, RefreshCw, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useCooperative } from '@/app/context/cooperative-context'
import { useToast } from '@/hooks/use-toast'
import { Spinner } from '@/components/shared/loading'
import { PageHeader } from '@/components/shared/page-header'
import { useConfirm } from '@/components/shared/confirm-dialog'
import { errorMessage } from '@/lib/utils/errors'

const MASKED = '••••••••••••'

type SyncStatus = 'idle' | 'syncing' | 'connected' | 'error'

interface IntegrationConfig {
  api_key?: string | null
  form_id?: string
  auto_sync?: boolean
  auto_score?: boolean
  field_mapping?: {
    name?: string
    email?: string
    phone?: string
    member_id?: string
  }
}

interface IntegrationRow {
  config: IntegrationConfig | null
  status: string
  last_sync_at: string | null
}

const DEFAULT_MAPPING = { name: 'name', email: 'email', phone: 'phone', member_id: 'member_id' }

export default function KoboToolboxSetupPage() {
  const { currentCooperative } = useCooperative()
  const { toast } = useToast()
  const { confirm, confirmNode } = useConfirm()
  const supabase = useMemo(() => createClient(), [])

  const [apiKey, setApiKey] = useState('')
  const [hasExistingKey, setHasExistingKey] = useState(false)
  const [formId, setFormId] = useState('')
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [autoSync, setAutoSync] = useState(true)
  const [autoScore, setAutoScore] = useState(true)
  const [fieldMapping, setFieldMapping] = useState(DEFAULT_MAPPING)

  const loadConfig = useCallback(async () => {
    if (!currentCooperative) return
    const { data } = await supabase
      .from('integrations')
      .select('config, status, last_sync_at')
      .eq('cooperative_id', currentCooperative.id)
      .eq('type', 'kobo')
      .maybeSingle<IntegrationRow>()

    if (data) {
      const cfg = data.config ?? {}
      const keyExists = !!cfg.api_key
      setHasExistingKey(keyExists)
      setApiKey(keyExists ? MASKED : '')
      setFormId(cfg.form_id ?? '')
      setAutoSync(cfg.auto_sync ?? true)
      setAutoScore(cfg.auto_score ?? true)
      setFieldMapping({ ...DEFAULT_MAPPING, ...(cfg.field_mapping ?? {}) })
      setSyncStatus(
        data.status === 'connected'
          ? 'connected'
          : data.status === 'error'
            ? 'error'
            : 'idle',
      )
      setLastSync(data.last_sync_at)
    } else {
      setHasExistingKey(false)
    }
  }, [currentCooperative, supabase])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  const submit = async (newKey?: string) => {
    if (!currentCooperative) return
    setSaving(true)
    setSyncStatus('syncing')
    try {
      const res = await fetch('/api/integrations/kobo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cooperative_id: currentCooperative.id,
          api_key: newKey,
          form_id: formId,
          auto_sync: autoSync,
          auto_score: autoScore,
          field_mapping: fieldMapping,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Save failed')
      }
      setSyncStatus('connected')
      toast({ title: 'Configuration saved' })
      loadConfig()
    } catch (e) {
      setSyncStatus('error')
      toast({ title: 'Save failed', description: errorMessage(e), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleConnect = () => {
    if (!formId) {
      toast({ title: 'Form ID is required', variant: 'destructive' })
      return
    }
    if (!apiKey || apiKey === MASKED) {
      if (!hasExistingKey) {
        toast({ title: 'API token is required', variant: 'destructive' })
        return
      }
      // re-save without rotating the key
      void submit()
      return
    }
    if (apiKey.length < 10) {
      toast({ title: 'API token looks too short', variant: 'destructive' })
      return
    }
    void submit(apiKey)
  }

  const handleSaveMapping = () => submit()

  const handleDisconnect = async () => {
    if (!currentCooperative) return
    const ok = await confirm({
      title: 'Disconnect KoboToolbox?',
      description: 'Saved credentials will be cleared. Sync will stop.',
      destructive: true,
      confirmLabel: 'Disconnect',
    })
    if (!ok) return
    setSaving(true)
    try {
      const res = await fetch(
        `/api/integrations/kobo?cooperative_id=${encodeURIComponent(currentCooperative.id)}`,
        { method: 'DELETE' },
      )
      if (!res.ok) throw new Error('Failed to disconnect')
      toast({ title: 'Disconnected' })
      setApiKey('')
      setFormId('')
      setHasExistingKey(false)
      setSyncStatus('idle')
      setLastSync(null)
    } catch (e) {
      toast({ title: 'Disconnect failed', description: errorMessage(e), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="KoboToolbox Integration"
        description="Connect KoboToolbox to sync member data and calculate member scores"
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Settings className="h-5 w-5" />
              Setup KoboToolbox Connection
            </CardTitle>
            <CardDescription>
              Configure your KoboToolbox API credentials to sync member data. Tokens are
              encrypted server-side.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="credentials" className="w-full">
              <TabsList className="grid w-full grid-cols-2 border-b border-border bg-transparent">
                <TabsTrigger
                  value="credentials"
                  className="border-b-2 border-transparent data-[state=active]:border-primary"
                >
                  Credentials
                </TabsTrigger>
                <TabsTrigger
                  value="mapping"
                  className="border-b-2 border-transparent data-[state=active]:border-primary"
                >
                  Field Mapping
                </TabsTrigger>
              </TabsList>

              <TabsContent value="credentials" className="space-y-4 mt-6">
                <div className="space-y-2">
                  <Label className="text-foreground flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    KoboToolbox API Token
                  </Label>
                  <Input
                    type="password"
                    placeholder={hasExistingKey ? 'Leave blank to keep existing token' : 'Your KoboToolbox API token'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Get your token from KoboToolbox → Account Settings → Security. Tokens are
                    encrypted with AES-256-GCM before being persisted.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Form / Survey ID</Label>
                  <Input
                    placeholder="e.g., a1b2c3d4e5f6g7h8"
                    value={formId}
                    onChange={(e) => setFormId(e.target.value)}
                  />
                </div>

                <div className="space-y-3 pt-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoSync}
                      onChange={(e) => setAutoSync(e.target.checked)}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-sm text-foreground">Auto-sync daily</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoScore}
                      onChange={(e) => setAutoScore(e.target.checked)}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-sm text-foreground">Create member scores automatically</span>
                  </label>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    className="flex-1 gap-2 bg-primary hover:bg-primary/90"
                    onClick={handleConnect}
                    disabled={saving}
                  >
                    {saving ? (
                      <Spinner className="h-4 w-4" />
                    ) : syncStatus === 'connected' ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <ArrowRight className="h-4 w-4" />
                    )}
                    {saving
                      ? 'Saving…'
                      : syncStatus === 'connected'
                        ? 'Save Changes'
                        : 'Connect & Save'}
                  </Button>
                  {syncStatus === 'connected' ? (
                    <Button
                      variant="outline"
                      className="border-destructive/30 text-destructive hover:bg-destructive/10"
                      onClick={handleDisconnect}
                      disabled={saving}
                    >
                      Disconnect
                    </Button>
                  ) : null}
                </div>
              </TabsContent>

              <TabsContent value="mapping" className="space-y-4 mt-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-900">
                    Map your KoboToolbox form fields to member profile fields.
                  </p>
                </div>

                <div className="space-y-4">
                  {(
                    [
                      { label: 'Member Name', key: 'name', required: true },
                      { label: 'Member Email', key: 'email', required: true },
                      { label: 'Member Phone', key: 'phone', required: false },
                      { label: 'Member ID', key: 'member_id', required: false },
                    ] as const
                  ).map((field) => (
                    <div key={field.key} className="grid grid-cols-3 gap-4 items-center">
                      <Label className="text-foreground text-sm">
                        {field.label}
                        {field.required ? <span className="text-destructive ml-1">*</span> : null}
                      </Label>
                      <div className="col-span-2">
                        <Input
                          value={fieldMapping[field.key]}
                          onChange={(e) =>
                            setFieldMapping((m) => ({ ...m, [field.key]: e.target.value }))
                          }
                          className="text-sm"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <Button
                  className="w-full gap-2 bg-primary hover:bg-primary/90"
                  onClick={handleSaveMapping}
                  disabled={saving}
                >
                  {saving ? <Spinner className="h-4 w-4" /> : null}
                  Save Field Mapping
                </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground text-lg">Connection Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <span
                  className={`text-sm font-medium flex items-center gap-1 ${
                    syncStatus === 'connected'
                      ? 'text-green-600'
                      : syncStatus === 'error'
                        ? 'text-destructive'
                        : 'text-muted-foreground'
                  }`}
                >
                  {syncStatus === 'connected' ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                  {syncStatus === 'error' ? <AlertCircle className="h-3.5 w-3.5" /> : null}
                  {syncStatus === 'connected'
                    ? 'Connected'
                    : syncStatus === 'error'
                      ? 'Error'
                      : 'Disconnected'}
                </span>
              </div>
              {lastSync ? (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Last sync</span>
                  <span className="text-xs font-medium text-foreground">
                    {new Date(lastSync).toLocaleString()}
                  </span>
                </div>
              ) : null}
              {formId ? (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Form ID</span>
                  <span className="text-xs font-mono text-foreground">
                    {formId.slice(0, 12)}{formId.length > 12 ? '…' : ''}
                  </span>
                </div>
              ) : null}
              {syncStatus === 'connected' ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-border gap-2"
                  onClick={() => loadConfig()}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh status
                </Button>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-border bg-gradient-to-br from-primary/5 to-accent/5">
            <CardHeader>
              <CardTitle className="text-foreground text-lg">Need Help?</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                The KoboToolbox sync runs daily once auto-sync is enabled.
              </p>
              <a
                href="https://support.kobotoolbox.org/api.html"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block"
              >
                <Button variant="outline" size="sm" className="border-border">
                  View Documentation
                </Button>
              </a>
            </CardContent>
          </Card>
        </div>
      </div>

      {confirmNode}
    </div>
  )
}
