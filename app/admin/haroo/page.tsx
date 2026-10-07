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
import { DossierDocuments } from '@/components/professionals/dossier-documents'
import { type CardPublicStatus, computeCardStatus, professionLabel } from '@/lib/professionals/core'

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
  validated_by?: string | null
  validated_at?: string | null
  rejection_reason?: string | null
  faitiere_id?: string | null
  profession?: string | null
}

interface CardInfo {
  card_number: string
  status: string
  expiry_date: string | null
  revoked_at: string | null
  suspended_at: string | null
  revoked_reason: string | null
}

type CardAction = 'suspend' | 'reactivate' | 'revoke' | 'renew'

const CARD_STATUS_META: Record<CardPublicStatus, { label: string; tone: string }> = {
  ACTIVE: { label: 'Active', tone: 'bg-emerald-100 text-emerald-800' },
  SUSPENDED: { label: 'Suspendue', tone: 'bg-amber-100 text-amber-800' },
  REVOKED: { label: 'Révoquée', tone: 'bg-red-100 text-red-800' },
  EXPIRED: { label: 'Expirée', tone: 'bg-zinc-200 text-zinc-800' },
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
  // PIN de carte agronome : affiché UNE fois, à remettre avec la carte.
  const [issuedPin, setIssuedPin] = useState<{ name: string; card: string; pin: string } | null>(null)
  const [cards, setCards] = useState<Record<string, CardInfo>>({})
  const [validatorNames, setValidatorNames] = useState<Record<string, string>>({})
  const [faitieres, setFaitieres] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    fetch('/api/faitieres')
      .then((r) => (r.ok ? r.json() : { faitieres: [] }))
      .then((d: { faitieres?: { id: string; name: string }[] }) => setFaitieres(d.faitieres ?? []))
      .catch(() => setFaitieres([]))
  }, [])

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
        .select(
          'id, first_name, last_name, phone, card_number, statut_validation, badge_valide, created_at, validated_by, validated_at, rejection_reason, faitiere_id, profession',
        )
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

    // Statut des cartes émises et noms des validateurs (traçabilité).
    const numbers = combined.map((r) => r.card_number).filter((n): n is string => !!n)
    const validators = [
      ...new Set(combined.map((r) => r.validated_by).filter((v): v is string => !!v)),
    ]
    const [cardsRes, validatorsRes] = await Promise.all([
      numbers.length
        ? supabase
            .from('member_cards')
            .select('card_number, status, expiry_date, revoked_at, suspended_at, revoked_reason')
            .in('card_number', numbers)
        : Promise.resolve({ data: [] as CardInfo[] }),
      validators.length
        ? supabase.from('profiles').select('id, first_name, last_name, email').in('id', validators)
        : Promise.resolve({
            data: [] as Array<{
              id: string
              first_name: string | null
              last_name: string | null
              email: string
            }>,
          }),
    ])
    setCards(Object.fromEntries((cardsRes.data ?? []).map((c) => [c.card_number, c as CardInfo])))
    setValidatorNames(
      Object.fromEntries(
        (validatorsRes.data ?? []).map((v) => [
          v.id,
          `${v.first_name ?? ''} ${v.last_name ?? ''}`.trim() || v.email,
        ]),
      ),
    )
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
    async (row: HarooAdminRow, payload: Record<string, string | null>, successTitle: string) => {
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

  const issuePin = async (row: HarooAdminRow) => {
    setBusyId(row.id)
    try {
      const res = await fetch('/api/admin/haroo-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'issue_agronome_pin', profile_id: row.id }),
      })
      const data: { pin?: string; card_number?: string; error?: string } = await res.json().catch(() => ({}))
      if (res.ok && data.pin && data.card_number) {
        setIssuedPin({ name: `${row.first_name} ${row.last_name}`, card: data.card_number, pin: data.pin })
      } else {
        toast({ title: 'Erreur', description: data.error ?? 'PIN non émis', variant: 'destructive' })
      }
    } catch (e: unknown) {
      toast({ title: 'Erreur', description: errorMessage(e), variant: 'destructive' })
    }
    setBusyId(null)
  }

  const setFaitiere = (row: HarooAdminRow, faitiereId: string) =>
    callApi(
      row,
      { action: 'set_faitiere', profile_id: row.id, faitiere_id: faitiereId || null },
      faitiereId ? 'Faîtière de rattachement mise à jour' : 'Dossier détaché de sa faîtière',
    )

  const validateAgronome = (row: HarooAdminRow, decision: 'VALIDE' | 'REJETE') => {
    let reason: string | undefined
    if (decision === 'REJETE') {
      reason = window.prompt('Motif du rejet (communiqué au professionnel) :')?.trim()
      if (!reason) return
    }
    return callApi(
      row,
      { action: 'validate_agronome', profile_id: row.id, decision, ...(reason ? { reason } : {}) },
      decision === 'VALIDE' ? 'Agronome validé — carte émise' : 'Agronome rejeté',
    )
  }

  const CARD_ACTION_LABEL: Record<CardAction, string> = {
    suspend: 'Carte suspendue',
    reactivate: 'Carte réactivée',
    revoke: 'Carte révoquée',
    renew: 'Carte renouvelée (nouveau QR)',
  }

  const cardAction = async (row: HarooAdminRow, action: CardAction) => {
    if (!row.card_number) return
    let reason: string | undefined
    if (action === 'revoke') {
      reason = window.prompt('Motif de la révocation (définitive) :')?.trim()
      if (!reason) return
    } else if (action === 'suspend') {
      reason = window.prompt('Motif de la suspension (facultatif) :')?.trim() || undefined
    } else if (
      action === 'renew' &&
      !window.confirm('Renouveler la carte ? Le QR actuel par jeton cessera de fonctionner.')
    ) {
      return
    }
    setBusyId(row.id)
    try {
      const res = await fetch(
        `/api/admin/professional-cards/${encodeURIComponent(row.card_number)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ...(reason ? { reason } : {}) }),
        },
      )
      const data: { success?: boolean; error?: string } = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        toast({ title: CARD_ACTION_LABEL[action], description: row.card_number })
        await fetchProfiles()
      } else {
        toast({ title: 'Erreur', description: data.error ?? 'Action impossible', variant: 'destructive' })
      }
    } catch (e: unknown) {
      toast({ title: 'Erreur', description: errorMessage(e), variant: 'destructive' })
    }
    setBusyId(null)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Professionnels Haroo"
        description="Validez les profils et émettez les cartes professionnelles (vérifiables par QR)"
      />

      {issuedPin && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
          <p className="text-sm font-semibold">
            PIN de la carte {issuedPin.card} — {issuedPin.name}
          </p>
          <p className="mt-1 font-mono text-3xl font-bold tracking-[0.3em]">{issuedPin.pin}</p>
          <p className="mt-1 text-xs">
            Affiché une seule fois : remettez-le avec la carte. Il sera demandé pour accepter et
            terminer chaque mission. Réémettre un PIN annule l’ancien.
          </p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => setIssuedPin(null)}>
            J’ai noté le PIN
          </Button>
        </div>
      )}

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
            const card = row.card_number ? cards[row.card_number] : undefined
            const cardStatus = card ? computeCardStatus(card) : null

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
                        {isAgronome && row.validated_at && (
                          <p className="text-xs text-muted-foreground">
                            Décision du {new Date(row.validated_at).toLocaleString('fr-FR')}
                            {row.validated_by
                              ? ` par ${validatorNames[row.validated_by] ?? row.validated_by.slice(0, 8)}`
                              : ''}
                          </p>
                        )}
                        {isAgronome && (
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>{professionLabel('AGRONOME', row.profession)} · Faîtière :</span>
                            <select
                              aria-label="Faîtière de rattachement"
                              className="rounded border border-input bg-background px-1.5 py-0.5 text-xs"
                              value={row.faitiere_id ?? ''}
                              disabled={isBusy}
                              onChange={(e) => setFaitiere(row, e.target.value)}
                            >
                              <option value="">— Aucune —</option>
                              {faitieres.map((f) => (
                                <option key={f.id} value={f.id}>
                                  {f.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        {isAgronome && <DossierDocuments profileId={row.id} />}
                        {isAgronome && row.rejection_reason && (
                          <p className="text-xs text-destructive">Motif : {row.rejection_reason}</p>
                        )}
                        {card?.revoked_reason && (
                          <p className="text-xs text-destructive">
                            Révocation : {card.revoked_reason}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {row.card_number ? (
                        <>
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                            <CreditCard className="h-3.5 w-3.5" /> {row.card_number}
                          </span>
                          {cardStatus && (
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${CARD_STATUS_META[cardStatus].tone}`}
                            >
                              {CARD_STATUS_META[cardStatus].label}
                            </span>
                          )}
                          {cardStatus && cardStatus !== 'REVOKED' && (
                            <>
                              {cardStatus === 'SUSPENDED' ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={isBusy}
                                  onClick={() => cardAction(row, 'reactivate')}
                                >
                                  Réactiver
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={isBusy}
                                  onClick={() => cardAction(row, 'suspend')}
                                >
                                  Suspendre
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isBusy}
                                onClick={() => cardAction(row, 'renew')}
                              >
                                Renouveler
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-destructive"
                                disabled={isBusy}
                                onClick={() => cardAction(row, 'revoke')}
                              >
                                Révoquer
                              </Button>
                            </>
                          )}
                          {isAgronome && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isBusy}
                              onClick={() => issuePin(row)}
                              title="Le PIN est demandé pour accepter et terminer une mission"
                            >
                              {isBusy ? <Spinner className="h-3.5 w-3.5" /> : null}
                              Émettre le PIN
                            </Button>
                          )}
                        </>
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
