'use client'

/**
 * KoboSyncPanel — Synchronisation tab content.
 *
 * Features:
 * - Real-time stats cards (auto-refresh 30s)
 * - Visual progress bar (matched/total)
 * - "Synchroniser maintenant" dropdown (full vs incremental)
 * - Progress bar during sync (SSE)
 * - Result toast after sync
 * - "Retenter les erreurs" button (if errors > 0)
 * - Last sync date + duration
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  RefreshCw,
  Download,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Activity,
  ChevronDown,
  Zap,
  Database,
} from 'lucide-react'
import { Spinner } from '@/components/shared/loading'
import type { KoboStatsResponse, SyncResult } from '@/lib/kobo/types'

interface KoboSyncPanelProps {
  cooperativeId: string
  stats: KoboStatsResponse | null
  statsLoading: boolean
  isSyncing: boolean
  progress: { current: number; total: number } | null
  result: SyncResult | null
  syncError: string | null
  onStartSync: (mode: 'full' | 'incremental') => void
  onRetry: () => void
  onRefreshStats: () => void
}

export function KoboSyncPanel({
  cooperativeId,
  stats,
  statsLoading,
  isSyncing,
  progress,
  result,
  syncError,
  onStartSync,
  onRetry,
  onRefreshStats,
}: KoboSyncPanelProps) {
  const matchRate = stats && stats.total > 0
    ? Math.round((stats.matched / stats.total) * 100)
    : 0

  return (
    <div className="space-y-6">
      {/* Stats overview */}
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Statistiques de synchronisation
              </CardTitle>
              <CardDescription>
                Mise à jour automatique toutes les 30 secondes
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefreshStats}
              disabled={statsLoading}
            >
              <RefreshCw className={`h-4 w-4 ${statsLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {stats ? (
            <div className="space-y-6">
              {/* Progress bar: matched/total */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-foreground">
                    Taux de matching
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {stats.matched}/{stats.total} ({matchRate}%)
                  </span>
                </div>
                <Progress value={matchRate} className="h-3" />
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatItem
                  icon={Database}
                  label="Total reçues"
                  value={stats.total}
                />
                <StatItem
                  icon={CheckCircle2}
                  label="Matchées"
                  value={stats.matched}
                  className="text-green-600"
                />
                <StatItem
                  icon={AlertCircle}
                  label="Non matchées"
                  value={stats.unmatched}
                  className="text-orange-500"
                />
                <StatItem
                  icon={AlertCircle}
                  label="Erreurs"
                  value={stats.errors}
                  className="text-red-500"
                />
              </div>

              {/* Additional stats */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-2 border-t">
                <StatItem
                  icon={Clock}
                  label="En attente"
                  value={stats.pending}
                  className="text-blue-500"
                />
                <StatItem
                  icon={Activity}
                  label="En cours"
                  value={stats.processing}
                  className="text-purple-500"
                />
                <StatItem
                  icon={RefreshCw}
                  label="Doublons"
                  value={stats.duplicates}
                  className="text-gray-500"
                />
              </div>

              {/* Last sync */}
              {stats.lastSync && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
                  <Clock className="h-3.5 w-3.5" />
                  Dernière synchronisation : {formatDateTime(stats.lastSync)}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {statsLoading ? (
                <Spinner className="h-5 w-5 mx-auto" />
              ) : (
                'Aucune donnée de synchronisation disponible'
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sync actions */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="h-4 w-4" />
            Actions de synchronisation
          </CardTitle>
          <CardDescription>
            Déclenchez une synchronisation manuelle depuis KoboToolbox
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Sync buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  className="flex-1 gap-2"
                  disabled={isSyncing}
                >
                  {isSyncing ? (
                    <Spinner className="h-4 w-4" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {isSyncing ? 'Synchronisation en cours...' : 'Synchroniser maintenant'}
                  <ChevronDown className="h-3.5 w-3.5 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => onStartSync('incremental')}>
                  <Zap className="h-4 w-4 mr-2" />
                  <div>
                    <p className="font-medium">Sync incrémentale</p>
                    <p className="text-xs text-muted-foreground">
                      Uniquement les nouvelles soumissions
                    </p>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onStartSync('full')}>
                  <Database className="h-4 w-4 mr-2" />
                  <div>
                    <p className="font-medium">Sync complète</p>
                    <p className="text-xs text-muted-foreground">
                      Toutes les soumissions (peut être long)
                    </p>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Retry errors button */}
            {stats && stats.errors > 0 && (
              <Button
                variant="outline"
                className="gap-2 border-orange-200 text-orange-600 hover:bg-orange-50"
                onClick={onRetry}
                disabled={isSyncing}
              >
                <RotateCcw className="h-4 w-4" />
                Retenter les erreurs ({stats.errors})
              </Button>
            )}
          </div>

          {/* Sync progress (during sync) */}
          {isSyncing && progress && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Traitement en cours...</span>
                <span className="text-sm text-muted-foreground">
                  {progress.current}/{progress.total}
                </span>
              </div>
              <Progress
                value={progress.total > 0 ? (progress.current / progress.total) * 100 : 0}
                className="h-2"
              />
            </div>
          )}

          {/* Sync error */}
          {syncError && !isSyncing && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                <p className="text-sm text-red-700">{syncError}</p>
              </div>
            </div>
          )}

          {/* Sync result */}
          {result && !isSyncing && !syncError && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                <span className="text-sm font-medium text-green-800">
                  Synchronisation terminée
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <ResultStat label="Reçues" value={result.received} />
                <ResultStat label="Matchées" value={result.matched} className="text-green-700" />
                <ResultStat label="Non matchées" value={result.unmatched} className="text-orange-600" />
                <ResultStat label="Erreurs" value={result.errors} className="text-red-600" />
              </div>
              {result.duration > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Durée : {formatDuration(result.duration)}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tips card */}
      <Card className="border-border bg-muted/30">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Zap className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
            <div className="text-sm text-muted-foreground space-y-1">
              <p>
                <strong className="text-foreground">Sync incrémentale</strong> : récupère uniquement
                les soumissions depuis la dernière synchronisation. Rapide et recommandée.
              </p>
              <p>
                <strong className="text-foreground">Sync complète</strong> : re-télécharge toutes
                les soumissions. Utile après un changement de mapping ou pour corriger des erreurs.
              </p>
              <p>
                <strong className="text-foreground">Webhook</strong> : si activé, les soumissions
                arrivent automatiquement en temps réel sans action manuelle.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// =========================================================
// Sub-components
// =========================================================

function StatItem({
  icon: Icon,
  label,
  value,
  className = '',
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  className?: string
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 ${className || 'text-muted-foreground'}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={`text-xl font-semibold ${className || 'text-foreground'}`}>
        {value.toLocaleString('fr-FR')}
      </p>
    </div>
  )
}

function ResultStat({
  label,
  value,
  className = '',
}: {
  label: string
  value: number
  className?: string
}) {
  return (
    <div className="text-center">
      <p className={`text-lg font-semibold ${className || 'text-foreground'}`}>
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

// =========================================================
// Helpers
// =========================================================

function formatDateTime(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}min ${remainingSeconds}s`
}
