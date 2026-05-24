'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Settings,
  RefreshCw,
  Database,
  BookOpen,
  Activity,
  CheckCircle2,
  AlertCircle,
  Clock,
} from 'lucide-react'
import { useCooperative } from '@/app/context/cooperative-context'
import { useToast } from '@/hooks/use-toast'
import { useKoboStats } from '@/hooks/use-kobo-stats'
import { useKoboSync } from '@/hooks/use-kobo-sync'
import { PageHeader } from '@/components/shared/page-header'
import { KoboConfigForm } from '@/components/dashboard/KoboConfigForm'
import { KoboSyncPanel } from '@/components/dashboard/KoboSyncPanel'
import { KoboSubmissionsTable } from '@/components/dashboard/KoboSubmissionsTable'
import { Progress } from '@/components/ui/progress'

/**
 * /dashboard/integrations/kobo — Full KoboToolbox integration dashboard
 *
 * 4 tabs:
 *  1. Configuration — API token, form ID, field mappings, webhook URL
 *  2. Synchronisation — Stats, sync buttons, progress bar
 *  3. Soumissions — Paginated table with filters
 *  4. Guide — Step-by-step setup instructions
 */
export default function KoboIntegrationPage() {
  const { currentCooperative } = useCooperative()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState('config')

  const cooperativeId = currentCooperative?.id ?? null

  // Hooks
  const { stats, isLoading: statsLoading, refetch: refetchStats } = useKoboStats(cooperativeId)
  const { isSyncing, progress, result, error: syncError, startSync, cancelSync } = useKoboSync(cooperativeId)

  // Show sync result toast
  if (result && !isSyncing) {
    // Handled in KoboSyncPanel
  }

  if (!currentCooperative) {
    return (
      <div className="space-y-8">
        <PageHeader
          title="Intégration KoboToolbox"
          description="Connectez KoboCollect pour synchroniser les données terrain"
        />
        <Card className="border-border">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              Sélectionnez une coopérative pour configurer l&apos;intégration.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Intégration KoboToolbox"
        description="Collecte terrain → Synchronisation → Données membres"
      />

      {/* Stats summary bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <StatCard label="Total" value={stats.total} icon={Database} />
          <StatCard
            label="Matchées"
            value={stats.matched}
            icon={CheckCircle2}
            className="text-green-600"
          />
          <StatCard
            label="Non matchées"
            value={stats.unmatched}
            icon={AlertCircle}
            className="text-orange-500"
          />
          <StatCard
            label="Erreurs"
            value={stats.errors}
            icon={AlertCircle}
            className="text-red-500"
          />
          <StatCard
            label="En attente"
            value={stats.pending}
            icon={Clock}
            className="text-blue-500"
          />
          <StatCard
            label="Dernière sync"
            value={stats.lastSync ? formatRelativeDate(stats.lastSync) : '—'}
            icon={RefreshCw}
            isText
          />
        </div>
      )}

      {/* Sync progress bar (visible during sync) */}
      {isSyncing && progress && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">
                Synchronisation en cours...
              </span>
              <span className="text-sm text-muted-foreground">
                {progress.current}/{progress.total}
              </span>
            </div>
            <Progress
              value={progress.total > 0 ? (progress.current / progress.total) * 100 : 0}
              className="h-2"
            />
            <div className="flex justify-end mt-2">
              <Button variant="ghost" size="sm" onClick={cancelSync}>
                Annuler
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 bg-muted/50">
          <TabsTrigger value="config" className="gap-2">
            <Settings className="h-4 w-4 hidden sm:block" />
            Configuration
          </TabsTrigger>
          <TabsTrigger value="sync" className="gap-2">
            <Activity className="h-4 w-4 hidden sm:block" />
            Synchronisation
          </TabsTrigger>
          <TabsTrigger value="submissions" className="gap-2">
            <Database className="h-4 w-4 hidden sm:block" />
            Soumissions
          </TabsTrigger>
          <TabsTrigger value="guide" className="gap-2">
            <BookOpen className="h-4 w-4 hidden sm:block" />
            Guide
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Configuration */}
        <TabsContent value="config" className="mt-6">
          <KoboConfigForm
            cooperativeId={currentCooperative.id}
            onSaved={() => {
              refetchStats()
              toast({ title: 'Configuration sauvegardée' })
            }}
          />
        </TabsContent>

        {/* Tab 2: Synchronisation */}
        <TabsContent value="sync" className="mt-6">
          <KoboSyncPanel
            cooperativeId={currentCooperative.id}
            stats={stats}
            statsLoading={statsLoading}
            isSyncing={isSyncing}
            progress={progress}
            result={result}
            syncError={syncError}
            onStartSync={startSync}
            onRetry={() => startSync('incremental')}
            onRefreshStats={refetchStats}
          />
        </TabsContent>

        {/* Tab 3: Soumissions */}
        <TabsContent value="submissions" className="mt-6">
          <KoboSubmissionsTable cooperativeId={currentCooperative.id} />
        </TabsContent>

        {/* Tab 4: Guide */}
        <TabsContent value="guide" className="mt-6">
          <GuideTab cooperativeId={currentCooperative.id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// =========================================================
// Stat card component
// =========================================================
function StatCard({
  label,
  value,
  icon: Icon,
  className = '',
  isText = false,
}: {
  label: string
  value: number | string
  icon: React.ComponentType<{ className?: string }>
  className?: string
  isText?: boolean
}) {
  return (
    <Card className="border-border">
      <CardContent className="py-3 px-4">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${className || 'text-muted-foreground'}`} />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className={`text-lg font-semibold mt-1 ${className || 'text-foreground'}`}>
          {isText ? value : typeof value === 'number' ? value.toLocaleString('fr-FR') : value}
        </p>
      </CardContent>
    </Card>
  )
}

// =========================================================
// Guide tab
// =========================================================
function GuideTab({ cooperativeId }: { cooperativeId: string }) {
  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/webhooks/kobo`
    : 'https://www.faitierehub.com/api/webhooks/kobo'

  const steps = [
    {
      title: 'Créer un compte KoboToolbox',
      description: 'Inscrivez-vous gratuitement sur KoboToolbox si ce n\'est pas déjà fait.',
      link: 'https://www.kobotoolbox.org/',
      linkLabel: 'Ouvrir KoboToolbox',
    },
    {
      title: 'Importer le formulaire FENOMAT',
      description: 'Téléchargez le XLSForm pré-configuré et importez-le dans votre projet KoboToolbox.',
      action: 'download',
    },
    {
      title: 'Copier le Form ID',
      description: 'Dans KoboToolbox, ouvrez votre formulaire → Settings → copiez l\'identifiant du formulaire (uid).',
    },
    {
      title: 'Générer un API Token',
      description: 'Allez dans Account Settings → Security → API Key. Copiez le token.',
      link: 'https://kf.kobotoolbox.org/#/account-settings',
      linkLabel: 'Ouvrir les paramètres',
    },
    {
      title: 'Configurer le webhook',
      description: 'Dans KoboToolbox → Project Settings → REST Services → ajoutez un nouveau service.',
      detail: `URL du webhook : ${webhookUrl}`,
    },
    {
      title: 'Tester avec KoboCollect',
      description: 'Installez KoboCollect sur un téléphone Android, connectez-vous, et soumettez un formulaire test.',
      link: 'https://play.google.com/store/apps/details?id=org.koboc.collect.android',
      linkLabel: 'Installer KoboCollect',
    },
  ]

  return (
    <div className="space-y-6">
      <Card className="border-border">
        <CardHeader>
          <CardTitle>Guide de configuration</CardTitle>
          <CardDescription>
            Suivez ces 6 étapes pour connecter KoboCollect à FaîtiereHub
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {steps.map((step, index) => (
              <div key={index} className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
                  {index + 1}
                </div>
                <div className="flex-1 space-y-1">
                  <h4 className="text-sm font-medium text-foreground">{step.title}</h4>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                  {step.detail && (
                    <code className="block text-xs bg-muted px-3 py-2 rounded mt-2 break-all">
                      {step.detail}
                    </code>
                  )}
                  {step.link && (
                    <a
                      href={step.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block mt-1"
                    >
                      <Button variant="outline" size="sm">
                        {step.linkLabel}
                      </Button>
                    </a>
                  )}
                  {step.action === 'download' && (
                    <Button variant="outline" size="sm" className="mt-1">
                      Télécharger le XLSForm
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Webhook info card */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">Informations webhook</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">URL du webhook</Label>
            <CopyableField value={webhookUrl} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Header d&apos;authentification</Label>
            <code className="block text-xs bg-muted px-3 py-2 rounded mt-1">
              X-Kobo-Secret: [votre secret configuré dans .env]
            </code>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// =========================================================
// Helpers
// =========================================================
function Label({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`text-sm font-medium ${className}`}>{children}</span>
}

function CopyableField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center gap-2 mt-1">
      <code className="flex-1 text-xs bg-muted px-3 py-2 rounded break-all">{value}</code>
      <Button variant="ghost" size="sm" onClick={handleCopy}>
        {copied ? '✓' : 'Copier'}
      </Button>
    </div>
  )
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMs / 3_600_000)
  const diffDays = Math.floor(diffMs / 86_400_000)

  if (diffMin < 1) return 'À l\'instant'
  if (diffMin < 60) return `Il y a ${diffMin}min`
  if (diffHours < 24) return `Il y a ${diffHours}h`
  if (diffDays < 7) return `Il y a ${diffDays}j`
  return date.toLocaleDateString('fr-FR')
}
