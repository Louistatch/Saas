'use client'

/**
 * Correction des cas pratiques (super_admin) : file des dépôts en attente, lecture du travail,
 * grille (critères pondérés notés de 0 à 100), commentaire, décision. Une correction par dépôt ;
 * une reprise demandée produit un nouveau dépôt du candidat.
 */
import { EmptyState } from '@/components/shared/empty-state'
import { LoadingBlock } from '@/components/shared/loading'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ClipboardCheck } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

interface Criterion {
  name: string
  weight: number
}
interface Submission {
  id: string
  content_text: string | null
  attachment_url: string | null
  status: string
  score: number | null
  feedback: string | null
  submitted_at: string | null
  reviewed_at: string | null
  assignment_title: string | null
  rubric: { criteria?: Criterion[] } | null
  lesson_order: number | null
  lesson_title: string | null
  candidate_name: string | null
  candidate_email: string | null
}

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '—'

function weightedScore(criteria: Criterion[], marks: Record<string, number>) {
  const total = criteria.reduce((s, c) => s + c.weight, 0)
  if (total <= 0) return 0
  return Math.round(criteria.reduce((s, c) => s + (marks[c.name] ?? 0) * c.weight, 0) / total)
}

function ReviewForm({ submission, onDone }: { submission: Submission; onDone: () => void }) {
  const criteria = (submission.rubric?.criteria ?? []).filter((c) => typeof c?.name === 'string')
  const [marks, setMarks] = useState<Record<string, number>>({})
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const score = weightedScore(criteria, marks)

  const send = async (decision: 'approved' | 'revision_required') => {
    setBusy(true)
    setError('')
    const res = await fetch(`/api/admin/academy/operator/submissions/${submission.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marks, feedback: feedback.trim(), decision }),
    })
    const body = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) {
      setError(body.error ?? 'Correction impossible.')
      return
    }
    onDone()
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <p className="whitespace-pre-wrap text-sm text-foreground">
          {submission.content_text ?? '(pas de texte)'}
        </p>
        {submission.attachment_url && (
          <a
            href={submission.attachment_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm text-primary underline"
          >
            Pièce jointe
          </a>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {criteria.map((c) => (
          <div key={c.name} className="space-y-1">
            <Label htmlFor={`${submission.id}-${c.name}`}>
              {c.name} <span className="text-muted-foreground">({c.weight} %)</span>
            </Label>
            <Input
              id={`${submission.id}-${c.name}`}
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              value={marks[c.name] ?? ''}
              onChange={(e) =>
                setMarks((m) => ({
                  ...m,
                  [c.name]: Math.min(100, Math.max(0, Number.parseInt(e.target.value || '0', 10))),
                }))
              }
              placeholder="0 à 100"
            />
          </div>
        ))}
      </div>
      <p className="text-sm font-medium text-foreground" aria-live="polite">
        Note pondérée : {score} / 100
      </p>
      <div className="space-y-1">
        <Label htmlFor={`${submission.id}-feedback`}>Commentaire au candidat</Label>
        <Textarea
          id={`${submission.id}-feedback`}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={4}
          placeholder="Ce qui est juste, ce qui manque, ce qu'il faut reprendre."
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={() => send('approved')} disabled={busy} className="min-h-11 flex-1">
          Approuver ({score} / 100)
        </Button>
        <Button
          variant="outline"
          onClick={() => send('revision_required')}
          disabled={busy}
          className="min-h-11 flex-1"
        >
          Demander une reprise
        </Button>
      </div>
    </div>
  )
}

export default function CorrectionsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/admin/academy/operator/submissions?status=submitted')
      .then((r) => r.json())
      .then((d) => setSubmissions(d.submissions ?? []))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Correction des cas pratiques"
        description="Dépôts en attente, du plus ancien au plus récent. La note nourrit l'évaluation pratique ; elle ne bloque pas la validation des leçons."
      />
      <Link
        href="/admin/partners/training"
        className="text-sm text-muted-foreground underline hover:text-foreground"
      >
        Retour au suivi des candidats
      </Link>
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">À corriger</CardTitle>
          <CardDescription>{submissions.length} dépôt(s) en attente</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <LoadingBlock />
          ) : submissions.length === 0 ? (
            <EmptyState icon={ClipboardCheck} title="Aucun cas pratique à corriger" />
          ) : (
            submissions.map((s) => (
              <div key={s.id} className="rounded-xl border border-border p-4">
                <button
                  type="button"
                  onClick={() => setOpen(open === s.id ? null : s.id)}
                  className="flex w-full items-start justify-between gap-3 text-left"
                  aria-expanded={open === s.id}
                >
                  <span>
                    <span className="block font-medium text-foreground">
                      {s.candidate_name ?? '—'}{' '}
                      <span className="text-xs text-muted-foreground">{s.candidate_email}</span>
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      Leçon {s.lesson_order} : {s.lesson_title}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    déposé le {day(s.submitted_at)}
                  </span>
                </button>
                {open === s.id && (
                  <div className="mt-4">
                    <ReviewForm
                      submission={s}
                      onDone={() => {
                        setOpen(null)
                        load()
                      }}
                    />
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
