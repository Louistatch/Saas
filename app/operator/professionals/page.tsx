'use client'

/**
 * Professionnels à valider — Espace Opérateur.
 *
 * Un Opérateur officier voit les dossiers (agronome, technicien, conseiller)
 * rattachés aux faîtières
 * sur lesquelles il détient un mandat actif portant 'professionals.validate'
 * (filtrage et contrôle côté serveur : /api/professionals/pending et
 * /api/professionals/[id]/decision). Le super_admin voit tout.
 * Valider émet automatiquement la carte professionnelle. Il peut aussi
 * inscrire un professionnel pour une faîtière de ses mandats
 * (/api/professionals/register) ; le dossier suit la même validation.
 */

import { ProtectedRoute } from '@/app/components/protected-route'
import { useAuth } from '@/app/context/auth-context'
import { ConsoleApp } from '@/components/operator/console-app'
import {
  type Dossier,
  DossierCard,
  type DossierStatus,
} from '@/components/professionals/dossier-review-card'
import { RegisterProfessionalForm } from '@/components/professionals/register-form'
import { Spinner } from '@/components/shared/loading'
import { Logo } from '@/components/shared/logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, ShieldAlert, UserCheck } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

const TABS: Array<{ value: DossierStatus; label: string }> = [
  { value: 'EN_ATTENTE', label: 'À valider' },
  { value: 'VALIDE', label: 'Validés' },
  { value: 'REJETE', label: 'Rejetés' },
]

function ProfessionalsContent() {
  const { user } = useAuth()
  const isSuperAdmin = user?.role === 'super_admin'
  const [tab, setTab] = useState<DossierStatus>('EN_ATTENTE')
  const [focus, setFocus] = useState<'all' | 'pret' | 'incomplet'>('all')
  const [dossiers, setDossiers] = useState<Dossier[]>([])
  const readyCount = dossiers.filter((d) => d.assessment?.verdict === 'pret').length
  const shownDossiers =
    tab !== 'EN_ATTENTE' || focus === 'all'
      ? dossiers
      : dossiers.filter((d) => (focus === 'pret') === (d.assessment?.verdict === 'pret'))
  const [canValidate, setCanValidate] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/professionals/pending?status=${tab}`, { cache: 'no-store' })
      const data: { dossiers?: Dossier[]; can_validate?: boolean; error?: string } = await res
        .json()
        .catch(() => ({}))
      if (res.ok) {
        setDossiers(data.dossiers ?? [])
        setCanValidate(data.can_validate !== false)
      } else {
        setError(data.error ?? 'Chargement impossible')
      }
    } catch {
      setError('Erreur réseau')
    }
    setLoading(false)
  }, [tab])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
        <Logo size="md" />
        <Button variant="ghost" size="sm" asChild>
          <Link href={isSuperAdmin ? '/admin' : '/operator'}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />{' '}
            {isSuperAdmin ? 'Administration' : 'Espace Opérateur'}
          </Link>
        </Button>
      </header>
      <main className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-10">
        <ConsoleApp />
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <UserCheck className="h-5 w-5 text-primary" /> Professionnels à valider
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Les dossiers prêts arrivent en premier. Valider émet la carte professionnelle ; pour un
            dossier incomplet, demandez les pièces manquantes en un geste.
          </CardContent>
        </Card>

        <div className="mb-4 flex gap-2">
          {TABS.map((t) => (
            <Button
              key={t.value}
              size="sm"
              variant={tab === t.value ? 'default' : 'outline'}
              onClick={() => setTab(t.value)}
            >
              {t.label}
            </Button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-6 w-6" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !canValidate ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldAlert className="h-4 w-4" /> Aucun mandat ne vous autorise à valider des
            professionnels. Contactez l’équipe FaîtiereHub.
          </p>
        ) : dossiers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {tab === 'EN_ATTENTE'
              ? 'Aucun dossier en attente : tout est traité.'
              : 'Aucun dossier dans cette catégorie.'}
          </p>
        ) : (
          <div className="space-y-3">
            {tab === 'EN_ATTENTE' && (
              <div className="flex flex-wrap gap-2" aria-label="Trier la file">
                {(
                  [
                    { value: 'all', label: `Tous (${dossiers.length})` },
                    { value: 'pret', label: `Prêts (${readyCount})` },
                    { value: 'incomplet', label: `À compléter (${dossiers.length - readyCount})` },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    aria-pressed={focus === f.value}
                    onClick={() => setFocus(f.value)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                      focus === f.value
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
            {shownDossiers.map((d) => (
              <DossierCard key={d.id} dossier={d} onDone={load} />
            ))}
          </div>
        )}

        {canValidate && (
          <div className="mt-8">
            <RegisterProfessionalForm onRegistered={load} />
          </div>
        )}
      </main>
    </div>
  )
}

export default function OperatorProfessionalsPage() {
  return (
    <ProtectedRoute>
      <ProfessionalsContent />
    </ProtectedRoute>
  )
}
