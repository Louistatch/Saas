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
import { DossierDocuments } from '@/components/professionals/dossier-documents'
import { RegisterProfessionalForm } from '@/components/professionals/register-form'
import { Spinner } from '@/components/shared/loading'
import { Logo } from '@/components/shared/logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, CheckCircle2, ShieldAlert, User, UserCheck, XCircle } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

type DossierStatus = 'EN_ATTENTE' | 'VALIDE' | 'REJETE'

interface Dossier {
  id: string
  first_name: string | null
  last_name: string | null
  photo_url: string | null
  specialisations: string[]
  statut_validation: DossierStatus
  card_number: string | null
  faitiere_name: string | null
  profession_label?: string
  validated_at: string | null
  rejection_reason: string | null
  created_at: string | null
}

const TABS: Array<{ value: DossierStatus; label: string }> = [
  { value: 'EN_ATTENTE', label: 'À valider' },
  { value: 'VALIDE', label: 'Validés' },
  { value: 'REJETE', label: 'Rejetés' },
]

function DossierCard({ dossier, onDone }: { dossier: Dossier; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const decide = async (decision: 'VALIDE' | 'REJETE') => {
    if (decision === 'REJETE' && !reason.trim()) {
      setMessage({ ok: false, text: 'Indiquez le motif du rejet.' })
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/professionals/${dossier.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          ...(decision === 'REJETE' ? { reason: reason.trim() } : {}),
        }),
      })
      const data: { success?: boolean; error?: string; card_number?: string | null } = await res
        .json()
        .catch(() => ({}))
      if (res.ok && data.success) {
        setMessage({
          ok: true,
          text:
            decision === 'VALIDE'
              ? `Dossier validé${data.card_number ? ` — carte ${data.card_number} émise` : ''}.`
              : 'Dossier rejeté.',
        })
        onDone()
      } else {
        setMessage({ ok: false, text: data.error ?? 'Action impossible' })
      }
    } catch {
      setMessage({ ok: false, text: 'Erreur réseau' })
    }
    setBusy(false)
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
            {dossier.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={dossier.photo_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <User className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">
              {dossier.first_name} {dossier.last_name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {dossier.profession_label ?? 'Ingénieur agronome'} ·{' '}
              {dossier.faitiere_name ?? 'Sans faîtière'}
              {dossier.card_number ? ` · ${dossier.card_number}` : ''}
            </p>
          </div>
        </div>
        {dossier.specialisations.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Spécialisations : {dossier.specialisations.join(', ')}
          </p>
        )}
        <DossierDocuments profileId={dossier.id} />
        {dossier.rejection_reason && (
          <p className="text-xs text-destructive">Motif : {dossier.rejection_reason}</p>
        )}
        {dossier.validated_at && (
          <p className="text-xs text-muted-foreground">
            Décision du {new Date(dossier.validated_at).toLocaleString('fr-FR')}
          </p>
        )}

        {dossier.statut_validation !== 'VALIDE' && (
          <div className="space-y-2">
            {rejecting && (
              <div className="space-y-1">
                <Label htmlFor={`reason-${dossier.id}`}>Motif du rejet</Label>
                <Textarea
                  id={`reason-${dossier.id}`}
                  value={reason}
                  maxLength={500}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ex. : diplôme illisible, merci de le téléverser à nouveau."
                />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={busy}
                onClick={() => decide('VALIDE')}
                className="gap-1.5"
              >
                {busy ? (
                  <Spinner className="h-3.5 w-3.5" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                Valider et émettre la carte
              </Button>
              {dossier.statut_validation === 'EN_ATTENTE' &&
                (rejecting ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-destructive"
                    disabled={busy}
                    onClick={() => decide('REJETE')}
                  >
                    <XCircle className="h-3.5 w-3.5" /> Confirmer le rejet
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-destructive"
                    disabled={busy}
                    onClick={() => setRejecting(true)}
                  >
                    <XCircle className="h-3.5 w-3.5" /> Rejeter
                  </Button>
                ))}
            </div>
          </div>
        )}
        {message && (
          <output className={`block text-sm ${message.ok ? 'text-primary' : 'text-destructive'}`}>
            {message.text}
          </output>
        )}
      </CardContent>
    </Card>
  )
}

function ProfessionalsContent() {
  const [tab, setTab] = useState<DossierStatus>('EN_ATTENTE')
  const [dossiers, setDossiers] = useState<Dossier[]>([])
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
          <Link href="/operator">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Espace Opérateur
          </Link>
        </Button>
      </header>
      <main className="mx-auto max-w-xl px-4 py-10 sm:px-6">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <UserCheck className="h-5 w-5 text-primary" /> Professionnels à valider
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Dossiers des agronomes, techniciens et conseillers rattachés aux faîtières de vos
            mandats. Examinez les justificatifs : valider émet la carte professionnelle ; un rejet
            doit être motivé.
          </CardContent>
        </Card>

        {canValidate && <RegisterProfessionalForm onRegistered={load} />}

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
          <p className="text-sm text-muted-foreground">Aucun dossier dans cette catégorie.</p>
        ) : (
          <div className="space-y-3">
            {dossiers.map((d) => (
              <DossierCard key={d.id} dossier={d} onDone={load} />
            ))}
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
