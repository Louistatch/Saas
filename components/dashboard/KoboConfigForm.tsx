'use client'

/**
 * KoboConfigForm — Configuration form for KoboToolbox integration.
 *
 * Features:
 * - API Token input (masked, revealable via eye icon)
 * - Serveur KoboToolbox (Global / UE / auto-hébergé) et Form ID (uid OU URL du projet collée)
 * - Type de formulaire (pilote le traitement des soumissions)
 * - "Test connection" button → spinner → green/red badge
 * - Webhook toggle + URL dédiée de l'intégration + secret propre (affiché une seule fois, rotation)
 * - Field mapping table (add/edit/delete inline)
 * - Save button with validation
 *
 * The API token NEVER leaves the server once saved (ni en clair, ni chiffré, ni masqué partiellement).
 */
import { useState, useEffect, useCallback, useRef } from 'react'
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
import { parseKoboFormInput } from '@/lib/kobo/form-id'
import { mappingTargetError } from '@/lib/kobo/mapping-targets'
import { KOBO_SERVER_PRESETS, koboAccountSecurityUrl, koboServerKind } from '@/lib/kobo/server-url'
import {
  KOBO_FORM_TYPES,
  KOBO_FORM_TYPE_LABELS,
  type KoboFieldMappingRow,
  type KoboFormType,
  type KoboTargetTable,
  type KoboTransformFn,
} from '@/lib/kobo/types'

/** Valeurs non secrètes remontées à la page (guide de configuration). */
export interface KoboConfigSummary {
  serverUrl: string
  formType: KoboFormType
  webhookUrl: string | null
}

interface KoboConfigFormProps {
  cooperativeId: string
  onSaved?: () => void
  onConfigLoaded?: (summary: KoboConfigSummary) => void
}

interface ConnectionTestResult {
  valid: boolean
  formTitle?: string
  submissionCount?: number
  error?: string
  warning?: string | null
}

type ServerChoice = 'global' | 'eu' | 'custom'

const MASK = '••••••••••••••••'

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

export function KoboConfigForm({ cooperativeId, onSaved, onConfigLoaded }: KoboConfigFormProps) {
  const { toast } = useToast()
  const onConfigLoadedRef = useRef(onConfigLoaded)
  onConfigLoadedRef.current = onConfigLoaded

  // Form state
  const [apiToken, setApiToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [formId, setFormId] = useState('')
  const [formIdError, setFormIdError] = useState<string | null>(null)
  const [serverChoice, setServerChoice] = useState<ServerChoice>('global')
  const [customServer, setCustomServer] = useState('')
  const [formType, setFormType] = useState<KoboFormType>('member_enrollment')
  const [webhookEnabled, setWebhookEnabled] = useState(true)
  const [hasExistingToken, setHasExistingToken] = useState(false)
  const [status, setStatus] = useState<'disconnected' | 'connected' | 'error'>('disconnected')

  // Webhook : URL dédiée à l'intégration, secret propre (affiché une seule fois)
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null)
  const [webhookSecretConfigured, setWebhookSecretConfigured] = useState(false)
  const [newWebhookSecret, setNewWebhookSecret] = useState<string | null>(null)
  const [rotating, setRotating] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [secretCopied, setSecretCopied] = useState(false)

  // Field mappings (envoyés seulement une fois chargés : une liste vide les supprime côté serveur)
  const [mappings, setMappings] = useState<FieldMappingEntry[]>([])
  const [mappingsLoaded, setMappingsLoaded] = useState(false)

  // UI state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null)
  const [copied, setCopied] = useState(false)

  // Serveur effectivement choisi (origine https://…) — la validation stricte se fait côté serveur.
  const serverUrl =
    serverChoice === 'custom' ? customServer.trim() : KOBO_SERVER_PRESETS[serverChoice].origin

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
        setMappingsLoaded(true)
        setLoading(false)
        return
      }

      setFormId(data.formId ?? '')
      setWebhookEnabled(data.webhookEnabled ?? true)
      setStatus(data.status ?? 'disconnected')
      setHasExistingToken(!!data.apiTokenMasked)
      setApiToken(data.apiTokenMasked ? MASK : '')
      setFormType((data.formType as KoboFormType | undefined) ?? 'member_enrollment')
      setWebhookUrl(data.webhookUrl ?? null)
      setWebhookSecretConfigured(!!data.webhookSecretConfigured)
      if (typeof data.serverUrl === 'string') {
        const kind = koboServerKind(data.serverUrl)
        setServerChoice(kind)
        setCustomServer(kind === 'custom' ? data.serverUrl : '')
      }
      onConfigLoadedRef.current?.({
        serverUrl: data.serverUrl,
        formType: (data.formType as KoboFormType | undefined) ?? 'member_enrollment',
        webhookUrl: data.webhookUrl ?? null,
      })

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
      setMappingsLoaded(true)
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

  // Normalise la saisie du Form ID : uid ou URL du projet (le serveur est alors déduit de l'URL).
  const normalizeFormIdInput = () => {
    if (!formId.trim()) {
      setFormIdError(null)
      return
    }
    const parsed = parseKoboFormInput(formId)
    if (!parsed.ok) {
      setFormIdError(parsed.error)
      return
    }
    setFormIdError(null)
    setFormId(parsed.formId)
    if (parsed.serverUrl) {
      const kind = koboServerKind(parsed.serverUrl)
      setServerChoice(kind)
      setCustomServer(kind === 'custom' ? parsed.serverUrl : '')
    }
  }

  // Test connection
  const handleTestConnection = async () => {
    if (!formId) {
      toast({ title: 'Form ID requis', variant: 'destructive' })
      return
    }

    const tokenToTest = apiToken === MASK ? '' : apiToken
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
          serverUrl,
          ...(tokenToTest ? { apiToken: tokenToTest } : {}),
        }),
      })

      const data = await res.json()

      if (res.ok) {
        setTestResult({
          valid: true,
          formTitle: data.formTitle,
          submissionCount: data.submissionCount,
          warning: data.warning ?? null,
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

    const tokenToSave = apiToken === MASK ? '' : apiToken
    if (!tokenToSave && !hasExistingToken) {
      toast({ title: 'Token API requis pour la première configuration', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        cooperativeId,
        formId,
        serverUrl,
        formType,
        webhookEnabled,
      }

      // Only send the token when a new one was typed — omitting it tells
      // the server to keep the existing encrypted token (apiToken is optional).
      if (tokenToSave) {
        body.apiToken = tokenToSave
      }

      // Toujours envoyer les correspondances une fois chargées (liste vide = les supprimer) :
      // sinon un champ clé obsolète resterait actif côté serveur.
      if (mappingsLoaded) {
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
      setApiToken(MASK)
      if (typeof data.webhookUrl === 'string') setWebhookUrl(data.webhookUrl)
      if (typeof data.webhookSecret === 'string') {
        // Affiché UNE seule fois : seul son hash est conservé côté serveur.
        setNewWebhookSecret(data.webhookSecret)
        setWebhookSecretConfigured(true)
      }
      toast({ title: 'Configuration sauvegardée' })
      for (const warning of (data.warnings as string[] | undefined) ?? []) {
        toast({ title: 'Attention', description: warning, variant: 'destructive' })
      }
      if (data.warning) toast({ title: 'Attention', description: data.warning })
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
    if (!webhookUrl) return
    await navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleCopySecret = async () => {
    if (!newWebhookSecret) return
    await navigator.clipboard.writeText(newWebhookSecret)
    setSecretCopied(true)
    setTimeout(() => setSecretCopied(false), 2000)
  }

  // Génère / fait pivoter le secret du webhook (affiché une seule fois)
  const handleRotateSecret = async () => {
    if (
      webhookSecretConfigured &&
      !window.confirm(
        "Générer un nouveau secret ? L'ancien cessera de fonctionner immédiatement : il faudra mettre à jour l'en-tête dans KoboToolbox → REST Services.",
      )
    ) {
      return
    }
    setRotating(true)
    try {
      const res = await fetch('/api/integrations/kobo/webhook-secret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cooperativeId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Impossible de générer le secret')
      setNewWebhookSecret(data.webhookSecret)
      setWebhookSecretConfigured(true)
      if (typeof data.webhookUrl === 'string') setWebhookUrl(data.webhookUrl)
    } catch (err: unknown) {
      toast({ title: 'Erreur', description: errorMessage(err), variant: 'destructive' })
    } finally {
      setRotating(false)
    }
  }

  // Déconnexion : efface token, secret de webhook et correspondances côté serveur.
  const handleDisconnect = async () => {
    if (
      !window.confirm(
        "Déconnecter KoboToolbox ? Le token, le secret du webhook et les correspondances de champs seront supprimés. Les soumissions déjà reçues sont conservées.",
      )
    ) {
      return
    }
    setDisconnecting(true)
    try {
      const res = await fetch(`/api/integrations/kobo?cooperativeId=${encodeURIComponent(cooperativeId)}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Déconnexion échouée')
      setNewWebhookSecret(null)
      setTestResult(null)
      await loadConfig()
      toast({ title: 'KoboToolbox déconnecté' })
      onSaved?.()
    } catch (err: unknown) {
      toast({ title: 'Erreur', description: errorMessage(err), variant: 'destructive' })
    } finally {
      setDisconnecting(false)
    }
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
            Configurez vos identifiants API. Les tokens sont chiffrés AES-256-GCM côté serveur et ne
            sont jamais renvoyés au navigateur.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Serveur KoboToolbox */}
          <div className="space-y-2">
            <Label htmlFor="kobo-server">Serveur KoboToolbox</Label>
            <Select value={serverChoice} onValueChange={(v) => setServerChoice(v as ServerChoice)}>
              <SelectTrigger id="kobo-server">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">{KOBO_SERVER_PRESETS.global.label}</SelectItem>
                <SelectItem value="eu">{KOBO_SERVER_PRESETS.eu.label}</SelectItem>
                <SelectItem value="custom">Autre serveur (auto-hébergé)</SelectItem>
              </SelectContent>
            </Select>
            {serverChoice === 'custom' && (
              <Input
                aria-label="Adresse du serveur KoboToolbox"
                placeholder="https://kobo.mon-organisation.org"
                value={customServer}
                onChange={(e) => setCustomServer(e.target.value)}
              />
            )}
            <p className="text-xs text-muted-foreground">
              Un token n&apos;est valable que sur le serveur qui l&apos;a émis. HTTPS obligatoire ; les
              adresses IP et réseaux internes sont refusés.
            </p>
          </div>

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
                    : 'Votre token API KoboToolbox (40 caractères)'
                }
                value={apiToken === MASK ? '' : apiToken}
                // Un token ne contient jamais d'espace ni de retour à la ligne : on les retire au collage.
                onChange={(e) => setApiToken(e.target.value.replace(/\s+/g, ''))}
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
              Obtenez votre token :{' '}
              {serverChoice !== 'custom' || /^https:\/\/[^\s/]+$/i.test(customServer.trim()) ? (
                <a
                  href={koboAccountSecurityUrl(serverUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  KoboToolbox → Compte → Sécurité → Clé API
                </a>
              ) : (
                'KoboToolbox → Compte → Sécurité → Clé API'
              )}
            </p>
          </div>

          {/* Form ID */}
          <div className="space-y-2">
            <Label htmlFor="form-id">Form ID (uid du formulaire)</Label>
            <Input
              id="form-id"
              placeholder="ex: aBcDeFgHiJkLmNoPqRsTuV — ou collez l'adresse du projet"
              value={formId}
              onChange={(e) => {
                setFormId(e.target.value)
                setFormIdError(null)
              }}
              onBlur={normalizeFormIdInput}
              aria-invalid={formIdError ? true : undefined}
            />
            {formIdError ? (
              <p className="text-xs text-red-500">{formIdError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                L&apos;uid se lit dans l&apos;adresse de votre projet KoboToolbox : …/#/forms/&lt;uid&gt;/summary.
              </p>
            )}
          </div>

          {/* Type de formulaire */}
          <div className="space-y-2">
            <Label htmlFor="kobo-form-type">Type de formulaire</Label>
            <Select value={formType} onValueChange={(v) => setFormType(v as KoboFormType)}>
              <SelectTrigger id="kobo-form-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KOBO_FORM_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {KOBO_FORM_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Détermine ce que devient chaque soumission : inscription d&apos;un membre, récolte, parcelle,
              prix de marché ou coopérative. Un mauvais choix créerait de faux enregistrements.
            </p>
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
                    {testResult.warning && (
                      <span className="text-sm text-amber-600">{testResult.warning}</span>
                    )}
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

          {/* Webhook : URL dédiée + secret propre à l'intégration */}
          {webhookEnabled && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  URL du webhook (à configurer dans KoboToolbox → REST Services)
                </Label>
                {webhookUrl ? (
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-muted px-3 py-2 rounded break-all">
                      {webhookUrl}
                    </code>
                    <Button variant="ghost" size="sm" onClick={handleCopyWebhook} aria-label="Copier l'URL du webhook">
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    L&apos;URL dédiée à cette intégration s&apos;affiche après le premier enregistrement.
                  </p>
                )}
              </div>

              {newWebhookSecret && (
                <div className="rounded border border-amber-300 bg-amber-50 p-3 space-y-2">
                  <p className="text-xs font-medium text-amber-900">
                    Secret du webhook — affiché UNE seule fois. Copiez-le maintenant.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-white px-3 py-2 rounded break-all border">
                      {newWebhookSecret}
                    </code>
                    <Button variant="ghost" size="sm" onClick={handleCopySecret} aria-label="Copier le secret du webhook">
                      {secretCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-amber-900">
                    Dans KoboToolbox → REST Services → « En-têtes HTTP personnalisés » : nom{' '}
                    <code>X-Kobo-Secret</code>, valeur = ce secret. (Ou Authentification de base : mot de passe =
                    ce secret.)
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {webhookSecretConfigured
                    ? 'Un secret propre à cette intégration est configuré (il ne peut pas être réaffiché).'
                    : "Aucun secret propre à cette intégration : générez-en un pour sécuriser le webhook."}
                </p>
                <Button variant="outline" size="sm" onClick={handleRotateSecret} disabled={rotating || status === 'disconnected'}>
                  {rotating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {webhookSecretConfigured ? 'Générer un nouveau secret' : 'Générer le secret'}
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
            {status !== 'disconnected' && (
              <Button
                variant="outline"
                className="border-destructive/30 text-destructive hover:bg-destructive/10"
                onClick={handleDisconnect}
                disabled={disconnecting || saving}
              >
                {disconnecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Déconnecter
              </Button>
            )}
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
                Associez les champs du formulaire Kobo à la fiche du membre. Le champ marqué « Clé »
                identifie la personne : colonne <code>card_number</code> (numéro de carte) ou{' '}
                <code>phone</code> (téléphone). Les autres lignes remplacent le champ par défaut de la
                colonne choisie (table Membres). Parcelles (S5) et productions (S6) sont lues du
                formulaire standard ; les cotisations ne sont pas prises en charge.
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
                <div className="col-span-1" />
              </div>

              {/* Rows */}
              {mappings.map((mapping) => (
                <div key={mapping.id} className="space-y-1">
                <div className="grid grid-cols-12 gap-2 items-center">
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
                        updateMapping(mapping.id, { targetColumn: e.target.value.toLowerCase() })
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
                {mappingTargetError(mapping.targetTable, mapping.targetColumn, mapping.isKeyField) ? (
                  <p className="text-xs text-destructive px-1">
                    {mappingTargetError(mapping.targetTable, mapping.targetColumn, mapping.isKeyField)} Cette
                    ligne empêchera l&apos;enregistrement : supprimez-la ou corrigez-la.
                  </p>
                ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
