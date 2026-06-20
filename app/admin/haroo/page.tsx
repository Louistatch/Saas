'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Briefcase,
  CheckCircle2,
  CreditCard,
  Search,
  ShoppingBasket,
  Sprout,
  XCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { useDebounced } from '@/hooks/use-debounced'
import { LoadingBlock, Spinner } from '@/components/shared/loading'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { errorMessage } from '@/lib/utils/errors'

/**
 * Administration des professionnels Haroo (super_admin).
 *
 * - Liste les profils ouvriers / acheteurs / agronomes (tables haroo_*).
 * - Valide ou rejette les agronomes (badge professionnel).
 * - Émet les cartes professionnelles (OUV-/ACH-/AGR-NNNNNN) — la carte est
 *   immédiatement vérifiable par QR via le flux /verify existant.
 */

type ProfileType = 'OUVRIER' | 'ACHETEUR' | 'AGRONOME'

interface HarooAdminRow {
  id: string
  type: ProfileType
  first_name: string
  last_name: string
  phone: string | null
  card_number: string | null
  statut_validation: string | null
  badge_valide: boolean | null
  created_at: string
}

const TYPE_META: Record<ProfileType, { label: string; icon: typeof Briefcase; tone: string }> = {
  OUVRIER: { label: 'Ouvrier', icon: Briefcase, tone: 'bg-amber-100 text-amber-800' },
  ACHETEUR: { label: 'Acheteur', icon: ShoppingBasket, tone: 'bg-blue-100 text-blue-800' },
  AGRONOME: { label: 'Agronome', icon: Sprout, tone: 'bg-emerald-100 text-emerald-800' },
}

const FILTERS: Array<{ value: ProfileType | 'TOUS'; label: string }> = [
  { value: 'TOUS', label: 'Tous' },
  { value: 'OUVRIER', label: 'Ouvriers' },
  { value: 'ACHETEUR', label: 'Acheteurs' },
  { value: 'AGRONOME', label: 'Agronomes' },
]

export default function HarooAdminPage() {
  const supabase = useMemo(() => createClient(), [])
  const { toast } = useToast()
  const [rows, setRows] = useState<HarooAdminRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 200)
  const [typeFilter, setTypeFilter] = useState<ProfileType | 'TOUS'>('TOUS')
  const [busyId, setBusyId] = useState<string | null>(null)

  const fetchProfiles = useCallback(async () => {
    setIsLoading(true)
    const [ouvriers, acheteurs, agronomes] = await Promise.all([
      supabase
        .from('haroo_ouvrier_profiles')
        .select('id, first_name, last_name, phone, card_number, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('haroo_acheteur_profiles')
        .select('id, first_name, last_name, phone, card_number, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('haroo_agronome_profiles')
        .select('id, first_name, last_name, phone, card_number, statut_validation, badge_valide, created_at')
        .order('created_at', { ascending: false }),
    ])

    const combined: HarooAdminRow[] = [
      ...(ouvriers.data ?? []).map((r) => ({
        ...r,
        type: 'OUVRIER' as const,
        statut_validation: null,
        badge_valide: null,
      })),
      ...(acheteurs.data ?? []).map((r) => ({
        ...r,
        type: 'ACHETEUR' as const,
        statut_validation: null,
        badge_valide: null,
      })),
      ...(agronomes.data ?? []).map((r) => ({ ...r, type: 'AGRONOME' as const })),
    ]
    combined.sort((a, b) => b.created_at.localeCompare(a.created_at))
    setRows(combined)
    setIsLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchProfiles()
  }, [fetchProfiles])

  const filtered = useMemo(() => {
    let list = typeFilter === 'TOUS' ? rows : rows.filter((r) => r.type === typeFilter)
    const q = debouncedSearch.toLowerCase().trim()
    if (q) {
      list = list.filter((r) =>
        `${r.first_name} ${r.last_name} ${r.phone ?? ''} ${r.card_number ?? ''}`
          .toLowerCase()
          .includes(q),
      )
    }
    return list
  }, [rows, typeFilter, debouncedSearch])

  const callApi = useCallback(
    async (row: HarooAdminRow, payload: Record<string, string>, successTitle: string) => {
      setBusyId(row.id)
      try {
        const res = await fetch('/api/admin/haroo-cards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data: { success?: boolean; error?: string; card_number?: string } = await res
          .json()
          .catch(() => ({}))
        if (res.ok && data.success) {
          toast({
            title: successTitle,
            description: data.card_number
              ? `${row.first_name} ${row.last_name} — ${data.card_number}`
              : `${row.first_name} ${row.last_name}`,
          })
          await fetchProfiles()
        } else {
          toast({ title: 'Erreur', description: data.error ?? 'Action impossible', variant: 'destructive' })
        }
      } catch (e: unknown) {
        toast({ title: 'Erreur', description: errorMessage(e), variant: 'destructive' })
      }
      setBusyId(null)
    },
    [toast, fetchProfiles],
  )

  const issueCard = (row: HarooAdminRow) =>
    callApi(row, { action: 'issue', profile_type: row.type, profile_id: row.id }, 'Carte émise')

  const validateAgronome = (row: HarooAdminRow, decision: 'VALIDE' | 'REJETE') =>
    callApi(
      row,
      { action: 'validate_agronome', profile_id: row.id, decision },
      decision === 'VALIDE' ? 'Agronome validé' : 'Agronome rejeté',
    )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Professionnels Haroo"
        description="Validez les profils et émettez les cartes professionnelles (vérifiables par QR)"
      />

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher (nom, téléphone, carte…)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              variant={typeFilter === f.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTypeFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="Aucun professionnel"
          description="Les inscriptions Haroo (ouvriers, acheteurs, agronomes) apparaîtront ici."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((row) => {
            const meta = TYPE_META[row.type]
            const TypeIcon = meta.icon
            const isBusy = busyId === row.id
            const isAgronome = row.type === 'AGRONOME'
            const agronomeValide = row.statut_validation === 'VALIDE'
            const agronomeRejete = row.statut_validation === 'REJETE'

            return (
              <Card key={`${row.type}-${row.id}`} className="border-border">
                <CardContent className="py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold shrink-0 ${meta.tone}`}>
                        <TypeIcon className="h-3.5 w-3.5" /> {meta.label}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate">
                          {row.first_name} {row.last_name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {row.phone ?? 'Téléphone non renseigné'}
                          {isAgronome && (
                            <>
                              {' · '}
                              {agronomeValide
                                ? '✓ Badge validé'
                                : agronomeRejete
                                  ? '✗ Rejeté'
                                  : 'En attente de validation'}
                            </>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {row.card_number ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                          <CreditCard className="h-3.5 w-3.5" /> {row.card_number}
                        </span>
                      ) : (
                        <>
                          {isAgronome && !agronomeValide && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5"
                                disabled={isBusy}
                                onClick={() => validateAgronome(row, 'VALIDE')}
                              >
                                {isBusy ? <Spinner className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                Valider
                              </Button>
                              {!agronomeRejete && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1.5 text-destructive"
                                  disabled={isBusy}
                                  onClick={() => validateAgronome(row, 'REJETE')}
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                  Rejeter
                                </Button>
                              )}
                            </>
                          )}
                          <Button
                            size="sm"
                            className="gap-1.5"
                            disabled={isBusy || (isAgronome && !agronomeValide)}
                            title={
                              isAgronome && !agronomeValide
                                ? 'Validez d\'abord le profil agronome'
                                : undefined
                            }
                            onClick={() => issueCard(row)}
                          >
                            {isBusy ? <Spinner className="h-3.5 w-3.5" /> : <CreditCard className="h-3.5 w-3.5" />}
                            Émettre la carte
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
