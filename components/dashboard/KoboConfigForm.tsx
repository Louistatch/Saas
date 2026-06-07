'use client'

/**
 * KoboConfigForm — Configuration form for KoboToolbox integration.
 *
 * Features:
 * - API Token input (masked, revealable via eye icon)
 * - Form ID input
 * - "Test connection" button → spinner → green/red badge
 * - Webhook toggle + URL (copyable)
 * - Field mapping table (add/edit/delete inline)
 * - Save button with validation
 *
 * The API token NEVER leaves the server once saved.
 */
import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Key,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Loader2,
  Plus,
  Trash2,
  Copy,
  Check,
  Link2,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { Spinner } from '@/components/shared/loading'
import { errorMessage } from '@/lib/utils/errors'
import type { KoboFieldMappingRow, KoboTargetTable, KoboTransformFn } from '@/lib/kobo/types'

interface KoboConfigFormProps {
  cooperativeId: string
  onSaved?: () => void
}

interface ConnectionTestResult {
  valid: boolean
  formTitle?: string
  submissionCount?: number
  error?: string
}

interface FieldMappingEntry {
  id: string
  koboField: string
  targetTable: KoboTargetTable
  targetColumn: string
  transformFn?: KoboTransformFn
  isKeyField: boolean
}

const TARGET_TABLES: { value: KoboTargetTable; label: string }[] = [
  { value: 'members', label: 'Membres' },
  { value: 'parcelles', label: 'Parcelles' },
  { value: 'productions', label: 'Productions' },
  { value: 'cotisations', label: 'Cotisations' },
]

const TRANSFORM_OPTIONS: { value: KoboTransformFn; label: string }[] = [
  { value: 'uppercase', label: 'MAJUSCULES' },
  { value: 'trim', label: 'Trim' },
  { value: 'to_number', label: 'Nombre' },
  { value: 'to_date', label: 'Date' },
]

export function KoboConfigForm({ cooperativeId, onSaved }: KoboConfigFormProps) {
  const { toast } = useToast()

  // Form state
  const [apiToken, setApiToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [formId, setFormId] = useState('')
  const [webhookEnabled, setWebhookEnabled] = useState(true)
  const [hasExistingToken, setHasExistingToken] = useState(false)
  const [status, setStatus] = useState<'disconnected' | 'connected' | 'error'>('disconnected')
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)

  // Field mappings
  const [mappings, setMappings] = useState<FieldMappingEntry[]>([])

  // UI state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null)
  const [copied, setCopied] = useState(false)

  // Webhook URL
  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/webhooks/kobo`
    : 'https://www.faitierehub.com/api/webhooks/kobo'

  // Load existing config
  const loadConfig = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/integrations/kobo?cooperativeId=${encodeURIComponent(cooperativeId)}`,
      )
      if (!res.ok) return

      const data = await res.json()
      if (data.configured === false) {
        setLoading(false)
        return
      }

      setFormId(data.formId ?? '')
      setWebhookEnabled(data.webhookEnabled ?? true)
      setStatus(data.status ?? 'disconnected')
      setLastSyncAt(data.lastSyncAt ?? null)
      setHasExistingToken(!!data.apiTokenMasked)
      setApiToken(data.apiTokenMasked ? '••••••••••••••••' : '')

      // Load field mappings
      if (data.fieldMappings && Array.isArray(data.fieldMappings)) {
        setMappings(
          data.fieldMappings.map((m: KoboFieldMappingRow) => ({
            id: m.id,
            koboField: m.kobo_field,
            targetTable: m.target_table as KoboTargetTable,
            targetColumn: m.target_column,
            transformFn: m.transform_fn as KoboTransformFn | undefined,
            isKeyField: m.is_key_field,
          })),
        )
      }
    } catch (err: unknown) {
      toast({
        title: 'Erreur de chargement',
        description: errorMessage(err),
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [cooperativeId, toast])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  // Test connection
  const handleTestConnection = async () => {
    if (!formId) {
      toast({ title: 'Form ID requis', variant: 'destructive' })
      return
    }

    const tokenToTest = apiToken === '••••••••••••••••' ? '' : apiToken
    if (!tokenToTest && !hasExistingToken) {
      toast({ title: 'Token API requis', variant: 'destructive' })
      return
    }

    setTesting(true)
    setTestResult(null)

    try {
      // Read-only check — never persists the config. If no new token was
      // typed, the server decrypts and tests the already-saved one.
      const res = await fetch('/api/integrations/kobo/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cooperativeId,
          formId,
          ...(tokenToTest ? { apiToken: tokenToTest } : {}),
        }),
      })

      const data = await res.json()

      if (res.ok) {
        setTestResult({
          valid: true,
          formTitle: data.formTitle,
          submissionCount: data.submissionCount,
        })
      } else {
        setTestResult({
          valid: false,
          error: data.details ?? data.error ?? 'Connexion échouée',
        })
      }
    } catch (err: unknown) {
      setTestResult({ valid: false, error: errorMessage(err) })
    } finally {
      setTesting(false)
    }
  }

  // Save config
  const handleSave = async () => {
    if (!formId) {
      toast({ title: 'Form ID requis', variant: 'destructive' })
      return
    }

    const tokenToSave = apiToken === '••••••••••••••••' ? '' : apiToken
    if (!tokenToSave && !hasExistingToken) {
      toast({ title: 'Token API requis pour la première configuration', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        cooperativeId,
        formId,
        webhookEnabled,
      }

      // Only send the token when a new one was typed — omitting it tells
      // the server to keep the existing encrypted token (apiToken is optional).
      if (tokenToSave) {
        body.apiToken = tokenToSave
      }

      // Include field mappings
      if (mappings.length > 0) {
        body.fieldMappings = mappings.map((m) => ({
          koboField: m.koboField,
          targetTable: m.targetTable,
          targetColumn: m.targetColumn,
          transformFn: m.transformFn,
          isKeyField: m.isKeyField,
        }))
      }

      const res = await fetch('/api/integrations/kobo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.details ?? data.error ?? 'Sauvegarde échouée')
      }

      setStatus('connected')
      setHasExistingToken(true)
      setApiToken('••••••••••••••••')
      toast({ title: 'Configuration sauvegardée' })
      onSaved?.()
    } catch (err: unknown) {
      toast({
        title: 'Erreur de sauvegarde',
        description: errorMessage(err),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  // Copy webhook URL
  const handleCopyWebhook = async () => {
    await navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Add mapping row
  const addMapping = () => {
    setMappings((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        koboField: '',
        targetTable: 'members',
        targetColumn: '',
        isKeyField: false,
      },
    ])
  }

  // Remove mapping row
  const removeMapping = (id: string) => {
    setMappings((prev) => prev.filter((m) => m.id !== id))
  }

  // Update mapping row
  const updateMapping = (id: string, field: Partial<FieldMappingEntry>) => {
    setMappings((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...field } : m)),
    )
  }

  if (loading) {
    return (
      <Card className="border-border">
        <CardContent className="py-12 flex justify-center">
          <Spinner className="h-6 w-6" />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Connection card */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Connexion KoboToolbox
          </CardTitle>
          <CardDescription>
            Configurez vos identifiants API. Les tokens sont chiffrés AES-256-GCM côté serveur.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* API Token */}
          <div className="space-y-2">
            <Label htmlFor="api-token" className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              Token API KoboToolbox
            </Label>
            <div className="relative">
              <Input
                id="api-token"
                type={showToken ? 'text' : 'password'}
                placeholder={
                  hasExistingToken
                    ? 'Laisser vide pour conserver le token existant'
                    : 'Votre token API KoboToolbox (40+ caractères)'
                }
                value={apiToken === '••••••••••••••••' ? '' : apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showToken ? 'Masquer le token' : 'Afficher le token'}
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Obtenez votre token : KoboToolbox → Account Settings → Security → API Key
            </p>
          </div>

          {/* Form ID */}
          <div className="space-y-2">
            <Label htmlFor="form-id">Form ID (uid du formulaire)</Label>
            <Input
              id="form-id"
              placeholder="ex: a1b2c3d4e5f6g7h8i9j0"
              value={formId}
              onChange={(e) => setFormId(e.target.value)}
            />
          </div>

          {/* Test connection button + result */}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={testing || (!formId)}
            >
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Tester la connexion
            </Button>

            {testResult && (
              <div className="flex items-center gap-2">
                {testResult.valid ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-sm text-green-600">
                      {testResult.formTitle ?? 'Connecté'} ({testResult.submissionCount ?? 0} soumissions)
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-red-500" />
                    <span className="text-sm text-red-500">{testResult.error}</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Webhook toggle */}
          <div className="flex items-center justify-between pt-2 border-t">
            <div>
              <Label>Webhook actif</Label>
              <p className="text-xs text-muted-foreground">
                Recevoir les soumissions en temps réel
              </p>
            </div>
            <Switch checked={webhookEnabled} onCheckedChange={setWebhookEnabled} />
          </div>

          {/* Webhook URL */}
          {webhookEnabled && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">URL du webhook (à configurer dans KoboToolbox)</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-muted px-3 py-2 rounded break-all">
                  {webhookUrl}
                </code>
                <Button variant="ghost" size="sm" onClick={handleCopyWebhook}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}

          {/* Save button */}
          <div className="flex gap-2 pt-3">
            <Button
              className="flex-1"
              onClick={handleSave}
              disabled={saving || !formId}
            >
              {saving ? <Spinner className="h-4 w-4 mr-2" /> : null}
              {status === 'connected' ? 'Mettre à jour' : 'Connecter & Sauvegarder'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Field mappings card */}
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Mapping des champs</CardTitle>
              <CardDescription>
                Associez les champs du formulaire Kobo aux colonnes de la base de données
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={addMapping}>
              <Plus className="h-4 w-4 mr-1" />
              Ajouter
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {mappings.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Aucun mapping configuré. Les champs par défaut seront utilisés.
            </p>
          ) : (
            <div className="space-y-3">
              {/* Header */}
              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-1">
                <div className="col-span-3">Champ Kobo</div>
                <div className="col-span-2">Table cible</div>
                <div className="col-span-3">Colonne</div>
                <div className="col-span-2">Transform</div>
                <div className="col-span-1">Clé</div>
                <div className="col-span-1"></div>
              </div>

              {/* Rows */}
              {mappings.map((mapping) => (
                <div key={mapping.id} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-3">
                    <Input
                      placeholder="S1/member_card_number"
                      value={mapping.koboField}
                      onChange={(e) =>
                        updateMapping(mapping.id, { koboField: e.target.value })
                      }
                      className="text-xs h-8"
                    />
                  </div>
                  <div className="col-span-2">
                    <Select
                      value={mapping.targetTable}
                      onValueChange={(v) =>
                        updateMapping(mapping.id, { targetTable: v as KoboTargetTable })
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TARGET_TABLES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3">
                    <Input
                      placeholder="card_number"
                      value={mapping.targetColumn}
                      onChange={(e) =>
                        updateMapping(mapping.id, { targetColumn: e.target.value })
                      }
                      className="text-xs h-8"
                    />
                  </div>
                  <div className="col-span-2">
                    <Select
                      value={mapping.transformFn ?? 'none'}
                      onValueChange={(v) =>
                        updateMapping(mapping.id, {
                          transformFn: v === 'none' ? undefined : (v as KoboTransformFn),
                        })
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {TRANSFORM_OPTIONS.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-1 flex justify-center">
                    <input
                      type="checkbox"
                      checked={mapping.isKeyField}
                      onChange={(e) =>
                        updateMapping(mapping.id, { isKeyField: e.target.checked })
                      }
                      className="h-4 w-4 rounded"
                      title="Champ clé pour le matching membre"
                    />
                  </div>
                  <div className="col-span-1 flex justify-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeMapping(mapping.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
