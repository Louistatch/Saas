'use client'

/**
 * KoboSubmissionsTable — Paginated table of kobo_submissions with filters.
 *
 * Features:
 * - Server-side pagination (25/page)
 * - Filters: status (badge dropdown), date range, search by card_number
 * - Status badges: pending=grey, matched=green, unmatched=orange, error=red, duplicate=blue
 * - Row click → Dialog with full JSON payload (formatted)
 * - Retry button on error rows
 * - Responsive (scrollable on mobile)
 */
import { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  RotateCcw,
  Eye,
  Filter,
} from 'lucide-react'
import { useKoboSubmissions, useKoboSubmissionDetail } from '@/hooks/use-kobo-submissions'
import { useToast } from '@/hooks/use-toast'
import { Spinner } from '@/components/shared/loading'
import type { KoboSubmissionStatus, KoboSubmissionRow } from '@/lib/kobo/types'

interface KoboSubmissionsTableProps {
  cooperativeId: string
}

const PAGE_SIZE = 25

const STATUS_OPTIONS: { value: KoboSubmissionStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Tous les statuts' },
  { value: 'pending', label: 'En attente' },
  { value: 'processing', label: 'En cours' },
  { value: 'matched', label: 'Matchée' },
  { value: 'unmatched', label: 'Non matchée' },
  { value: 'error', label: 'Erreur' },
  { value: 'duplicate', label: 'Doublon' },
]

const STATUS_BADGE_STYLES: Record<KoboSubmissionStatus, string> = {
  pending: 'bg-gray-100 text-gray-700 border-gray-200',
  processing: 'bg-blue-50 text-blue-700 border-blue-200',
  matched: 'bg-green-50 text-green-700 border-green-200',
  unmatched: 'bg-orange-50 text-orange-700 border-orange-200',
  error: 'bg-red-50 text-red-700 border-red-200',
  duplicate: 'bg-blue-50 text-blue-600 border-blue-200',
}

const STATUS_LABELS: Record<KoboSubmissionStatus, string> = {
  pending: 'En attente',
  processing: 'En cours',
  matched: 'Matchée',
  unmatched: 'Non matchée',
  error: 'Erreur',
  duplicate: 'Doublon',
}

export function KoboSubmissionsTable({ cooperativeId }: KoboSubmissionsTableProps) {
  const { toast } = useToast()

  // Filters
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<KoboSubmissionStatus | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')

  // Detail dialog
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null)
  const [retrying, setRetrying] = useState<string | null>(null)

  // Fetch submissions
  const { submissions, totalCount, isLoading, error, refetch } = useKoboSubmissions({
    cooperativeId,
    page,
    pageSize: PAGE_SIZE,
    status: statusFilter === 'all' ? undefined : statusFilter,
    search: searchQuery || undefined,
  })

  // Fetch detail for dialog
  const { data: detailPayload, isLoading: detailLoading } =
    useKoboSubmissionDetail(selectedSubmissionId)

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  // Handle search submit
  const handleSearch = useCallback(() => {
    setSearchQuery(searchInput.trim())
    setPage(1)
  }, [searchInput])

  // Handle status filter change
  const handleStatusChange = useCallback((value: string) => {
    setStatusFilter(value as KoboSubmissionStatus | 'all')
    setPage(1)
  }, [])

  // Handle retry
  const handleRetry = useCallback(
    async (submissionId: string) => {
      setRetrying(submissionId)
      try {
        const res = await fetch('/api/integrations/kobo/retry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cooperativeId, submissionId }),
        })

        const data = await res.json().catch(() => ({}))
        if (!res.ok || !(data as { ok?: boolean }).ok) {
          throw new Error((data as { error?: string }).error ?? 'Retry failed')
        }

        toast({ title: 'Retry réussi', description: 'La soumission a été retraitée.' })
        refetch()
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erreur'
        toast({ title: 'Échec du retry', description: message, variant: 'destructive' })
      } finally {
        setRetrying(null)
      }
    },
    [cooperativeId, toast, refetch],
  )

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle className="text-base">Soumissions récentes</CardTitle>
          <Button variant="outline" size="sm" onClick={refetch} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
            Rafraîchir
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par n° carte..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="pl-9 h-9"
            />
          </div>

          {/* Status filter */}
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-full sm:w-[180px] h-9">
              <Filter className="h-3.5 w-3.5 mr-1" />
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Search button */}
          <Button variant="outline" size="sm" onClick={handleSearch} className="h-9">
            Filtrer
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {/* Error state */}
        {error && (
          <div className="text-center py-8 text-red-500 text-sm">{error}</div>
        )}

        {/* Loading state */}
        {isLoading && !submissions.length && (
          <div className="flex justify-center py-12">
            <Spinner className="h-6 w-6" />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && submissions.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-sm">Aucune soumission trouvée</p>
            {searchQuery && (
              <Button
                variant="link"
                size="sm"
                onClick={() => {
                  setSearchInput('')
                  setSearchQuery('')
                  setStatusFilter('all')
                }}
              >
                Réinitialiser les filtres
              </Button>
            )}
          </div>
        )}

        {/* Table */}
        {submissions.length > 0 && (
          <div className="overflow-x-auto -mx-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-6 py-3 font-medium text-muted-foreground">Date</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">N° Carte</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">Statut</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground hidden md:table-cell">
                    Erreur
                  </th>
                  <th className="px-6 py-3 font-medium text-muted-foreground text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((sub) => (
                  <SubmissionRow
                    key={sub.id}
                    submission={sub}
                    onView={() => setSelectedSubmissionId(sub.id)}
                    onRetry={() => handleRetry(sub.id)}
                    isRetrying={retrying === sub.id}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t mt-4">
            <span className="text-xs text-muted-foreground">
              {totalCount} soumission{totalCount > 1 ? 's' : ''} · Page {page}/{totalPages}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      {/* Detail dialog */}
      <Dialog
        open={!!selectedSubmissionId}
        onOpenChange={(open) => {
          if (!open) setSelectedSubmissionId(null)
        }}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Détail de la soumission</DialogTitle>
            <DialogDescription>Payload JSON brut reçu de KoboCollect</DialogDescription>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex justify-center py-8">
              <Spinner className="h-6 w-6" />
            </div>
          ) : detailPayload ? (
            <pre className="text-xs bg-muted p-4 rounded overflow-x-auto whitespace-pre-wrap break-words">
              {JSON.stringify(detailPayload, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              Aucune donnée disponible
            </p>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}

// =========================================================
// Submission row component
// =========================================================
function SubmissionRow({
  submission,
  onView,
  onRetry,
  isRetrying,
}: {
  submission: KoboSubmissionRow
  onView: () => void
  onRetry: () => void
  isRetrying: boolean
}) {
  const statusStyle = STATUS_BADGE_STYLES[submission.status] ?? STATUS_BADGE_STYLES.pending
  const statusLabel = STATUS_LABELS[submission.status] ?? submission.status

  return (
    <tr className="border-b hover:bg-muted/50 transition-colors">
      <td className="px-6 py-3 whitespace-nowrap">
        <span className="text-foreground">
          {formatDate(submission.submitted_at)}
        </span>
      </td>
      <td className="px-6 py-3">
        <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
          {submission.member_card_number ?? '—'}
        </code>
      </td>
      <td className="px-6 py-3">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusStyle}`}
        >
          {statusLabel}
        </span>
      </td>
      <td className="px-6 py-3 hidden md:table-cell">
        {submission.error_message ? (
          <span className="text-xs text-red-500 line-clamp-1" title={submission.error_message}>
            {submission.error_message.slice(0, 60)}
            {submission.error_message.length > 60 ? '…' : ''}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-6 py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onView} title="Voir le détail">
            <Eye className="h-3.5 w-3.5" />
          </Button>
          {(submission.status === 'error' || submission.status === 'pending') && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-orange-500 hover:text-orange-700"
              onClick={onRetry}
              disabled={isRetrying}
              title="Retenter"
            >
              {isRetrying ? (
                <Spinner className="h-3.5 w-3.5" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
        </div>
      </td>
    </tr>
  )
}

// =========================================================
// Helpers
// =========================================================
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}
