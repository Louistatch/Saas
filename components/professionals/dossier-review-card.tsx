'use client'

// Fiche d'instruction d'un dossier professionnel : pièces présentes, verdict, ancienneté et
// actions adaptées (valider, ou demander les pièces manquantes avec un motif prérempli).
import { DossierDocuments } from '@/components/professionals/dossier-documents'
import { Spinner } from '@/components/shared/loading'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  DOSSIER_CHECKS,
  DOSSIER_CHECK_LABEL,
  type DossierAssessment,
} from '@/lib/professionals/core'
import { CheckCircle2, User, XCircle } from 'lucide-react'
import { useState } from 'react'

export type DossierStatus = 'EN_ATTENTE' | 'VALIDE' | 'REJETE'

export interface Dossier {
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
  assessment?: DossierAssessment
}

const REASON_PRESETS = [
  {
    label: 'Diplôme illisible',
    text: 'Votre diplôme est illisible : merci de le déposer à nouveau.',
  },
  { label: 'Pièce d’identité', text: 'Votre pièce d’identité est illisible ou expirée.' },
  {
    label: 'Incohérence',
    text: 'Les informations du profil ne correspondent pas aux justificatifs.',
  },
  { label: 'Profession', text: 'Cette profession n’ouvre pas droit à une carte professionnelle.' },
]

const MISSING_NOUN = {
  faitiere: 'la faîtière',
  diplome: 'le diplôme',
  piece_identite: 'la pièce d’identité',
  photo: 'la photo',
} as const

function waitingTone(days: number) {
  if (days >= 7) return 'bg-red-100 text-red-900'
  if (days >= 3) return 'bg-amber-100 text-amber-900'
  return 'bg-muted text-muted-foreground'
}

function waitingLabel(days: number) {
  if (days === 0) return 'Reçu aujourd’hui'
  return `Attend depuis ${days} j`
}

export function DossierCard({
  dossier,
  onDone,
  isSuperAdmin,
}: {
  dossier: Dossier
  onDone: () => void
  isSuperAdmin: boolean
}) {
  const a = dossier.assessment
  const pending = dossier.statut_validation === 'EN_ATTENTE'
  const ready = a?.verdict === 'pret'
  const [reason, setReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [forceValidate, setForceValidate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const openRequest = () => {
    setRejecting(true)
    setForceValidate(false)
    if (!reason && a?.suggestedReason) setReason(a.suggestedReason)
  }

  const decide = async (decision: 'VALIDE' | 'REJETE') => {
    if (decision === 'REJETE' && !reason.trim()) {
      setMessage({ ok: false, text: 'Écrivez ce que la personne doit corriger.' })
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
              ? `Dossier validé${data.card_number ? ` : carte ${data.card_number} émise` : ''}.`
              : 'Demande envoyée. Le dossier revient dès que la personne l’a complété.',
        })
        onDone()
      } else {
        setMessage({ ok: false, text: data.error ?? 'Action impossible' })
      }
    } catch {
      setMessage({ ok: false, text: 'Connexion interrompue : réessayez.' })
    }
    setBusy(false)
  }

  const verdictText = !a
    ? null
    : a.verdict === 'pret'
      ? 'Prêt à valider : les pièces requises sont là.'
      : a.verdict === 'sans_faitiere'
        ? isSuperAdmin
          ? 'Sans faîtière : vous seul pouvez l’instruire. Demandez-lui d’en choisir une.'
          : 'Sans faîtière : la personne doit en choisir une.'
        : `Incomplet : il manque ${a.missing
            .filter((c) => c !== 'photo')
            .map((c) => MISSING_NOUN[c])
            .join(' et ')}.`

  return (
    <Card className={pending && ready ? 'border-primary/40' : undefined}>
      <CardContent className="space-y-4 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
            {dossier.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={dossier.photo_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <User className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-foreground">
              {dossier.first_name} {dossier.last_name}
            </p>
            <p className="text-xs text-muted-foreground">
              {dossier.profession_label ?? 'Ingénieur agronome'},{' '}
              {dossier.faitiere_name ?? 'sans faîtière'}
              {dossier.card_number ? `, carte ${dossier.card_number}` : ''}
            </p>
          </div>
          {pending && a && (
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${waitingTone(a.waitingDays)}`}
            >
              {waitingLabel(a.waitingDays)}
            </span>
          )}
        </div>

        {pending && a && (
          <>
            <ul className="grid grid-cols-4 gap-1.5" aria-label="Pièces du dossier">
              {DOSSIER_CHECKS.map((c) => {
                const ok = a.checks[c]
                return (
                  <li
                    key={c}
                    aria-label={`${DOSSIER_CHECK_LABEL[c]} : ${ok ? 'présent' : 'manquant'}`}
                    className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-center text-[11px] leading-tight ${
                      ok
                        ? 'border-primary/30 bg-primary/10 text-primary'
                        : 'border-dashed border-muted-foreground/40 text-muted-foreground'
                    }`}
                  >
                    {ok ? (
                      <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                    ) : (
                      <XCircle aria-hidden="true" className="h-4 w-4 opacity-60" />
                    )}
                    <span className={ok ? 'font-medium' : 'line-through decoration-1'}>
                      {DOSSIER_CHECK_LABEL[c]}
                    </span>
                  </li>
                )
              })}
            </ul>
            <p className={`text-sm ${ready ? 'text-primary' : 'text-foreground'}`}>{verdictText}</p>
          </>
        )}

        {dossier.specialisations.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Spécialisations : {dossier.specialisations.join(', ')}
          </p>
        )}
        <DossierDocuments profileId={dossier.id} />
        {dossier.rejection_reason && (
          <p className="text-xs text-destructive">Demande envoyée : {dossier.rejection_reason}</p>
        )}
        {dossier.validated_at && (
          <p className="text-xs text-muted-foreground">
            Décision du {new Date(dossier.validated_at).toLocaleString('fr-FR')}
          </p>
        )}

        {dossier.statut_validation !== 'VALIDE' && !message?.ok && (
          <div className="space-y-3">
            {rejecting && (
              <div className="space-y-2 rounded-lg bg-muted/50 p-3">
                <Label htmlFor={`reason-${dossier.id}`}>Ce que la personne doit corriger</Label>
                <Textarea
                  id={`reason-${dossier.id}`}
                  value={reason}
                  maxLength={500}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ex. : diplôme illisible, merci de le déposer à nouveau."
                />
                <div className="flex flex-wrap gap-1.5" aria-label="Motifs fréquents">
                  {REASON_PRESETS.map(({ label, text: r }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() =>
                        setReason((cur) => (cur.includes(r) ? cur : cur ? `${cur} ${r}` : r))
                      }
                      className="rounded-full border border-border bg-background px-2.5 py-1 text-xs hover:bg-muted"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => decide('REJETE')}
                    className="gap-1.5"
                  >
                    {busy && <Spinner className="h-3.5 w-3.5" />}
                    Envoyer la demande
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => setRejecting(false)}
                  >
                    Annuler
                  </Button>
                </div>
              </div>
            )}

            {!rejecting && (
              <div className="flex flex-wrap gap-2">
                {ready || !pending ? (
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
                ) : (
                  <Button size="sm" disabled={busy} onClick={openRequest} className="gap-1.5">
                    Demander les pièces manquantes
                  </Button>
                )}
                {pending && ready && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={openRequest}
                    className="text-destructive"
                  >
                    Demander une correction
                  </Button>
                )}
                {pending &&
                  !ready &&
                  (forceValidate ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => decide('VALIDE')}
                      className="gap-1.5"
                    >
                      {busy && <Spinner className="h-3.5 w-3.5" />}
                      Confirmer la validation malgré les manques
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setForceValidate(true)}
                    >
                      Valider quand même
                    </Button>
                  ))}
              </div>
            )}
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
