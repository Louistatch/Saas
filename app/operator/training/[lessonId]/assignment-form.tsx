'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import type { AcademyAssignment } from '@/types/domain'
import { CheckCircle2, ClipboardList, MessageSquareText, RotateCcw } from 'lucide-react'
import { useState } from 'react'

export interface SubmissionState {
  status: 'submitted' | 'reviewed' | 'revision_required' | 'draft'
  score: number | null
  feedback: string | null
  reviewed_at: string | null
}

interface Criterion {
  name: string
  weight: number
}

const STATUS_TEXT: Record<SubmissionState['status'], string> = {
  submitted: 'Déposé, en attente de correction par l’équipe.',
  reviewed: 'Corrigé et approuvé.',
  revision_required:
    'Une reprise est demandée : lisez le commentaire puis déposez une nouvelle version.',
  draft: 'Brouillon.',
}

export function AssignmentForm({
  assignment,
  latest,
}: {
  assignment: AcademyAssignment
  latest: SubmissionState | null
}) {
  const [contentText, setContentText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<null | {
    lessonCompleted?: boolean
    training?: { lessonsCompleted: number; lessonsTotal: number; trainingCompleted: boolean } | null
  }>(null)
  const [error, setError] = useState('')
  const [resubmitting, setResubmitting] = useState(false)
  const criteria = (
    (assignment.rubric as { criteria?: Criterion[] } | null)?.criteria ?? []
  ).filter((c) => typeof c?.name === 'string')
  const canWrite = !latest || latest.status === 'revision_required' || resubmitting

  const submit = async () => {
    if (contentText.trim().length < 20) {
      setError('Rédigez votre réponse (20 caractères au moins) avant de la déposer.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`/api/academy/operator/assignments/${assignment.id}/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentText: contentText.trim() }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? 'Dépôt impossible pour le moment.')
        setSubmitting(false)
        return
      }
      setDone(body)
    } catch {
      setError('Erreur de connexion. Vérifiez votre internet.')
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <ClipboardList className="h-5 w-5 text-primary" /> {assignment.title}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{assignment.instructions}</p>
        {criteria.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Critères de correction : {criteria.map((c) => `${c.name} (${c.weight} %)`).join(', ')}.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {done ? (
          <p className="flex items-center gap-2 text-sm text-primary" aria-live="polite">
            <CheckCircle2 className="h-4 w-4" />
            {done.lessonCompleted
              ? done.training?.trainingCompleted
                ? 'Déposé. Formation terminée : votre dossier passe à l’évaluation pratique.'
                : `Déposé, leçon validée (${done.training?.lessonsCompleted ?? '?'} sur ${done.training?.lessonsTotal ?? '?'}). L’équipe corrige et vous répond par e-mail.`
              : 'Déposé. Réussissez le quiz pour valider la leçon ; l’équipe corrige et vous répond par e-mail.'}
          </p>
        ) : (
          <>
            {latest && !resubmitting && (
              <div
                className={`space-y-1 rounded-lg border p-3 text-sm ${
                  latest.status === 'revision_required'
                    ? 'border-amber-300/70 bg-amber-50/40'
                    : 'border-border'
                }`}
              >
                <p className="font-medium text-foreground">
                  {STATUS_TEXT[latest.status]}
                  {latest.score != null && latest.status !== 'submitted'
                    ? ` Note : ${latest.score} / 100.`
                    : ''}
                </p>
                {latest.feedback && (
                  <p className="flex items-start gap-2 text-foreground/80">
                    <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    {latest.feedback}
                  </p>
                )}
                {latest.status !== 'revision_required' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setResubmitting(true)}
                    className="mt-1"
                  >
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Déposer une nouvelle version
                  </Button>
                )}
              </div>
            )}
            {canWrite && (
              <>
                <Textarea
                  value={contentText}
                  onChange={(e) => setContentText(e.target.value)}
                  placeholder="Votre réponse"
                  rows={8}
                  aria-label="Réponse au cas pratique"
                />
                {error && (
                  <p className="text-sm text-destructive" aria-live="polite">
                    {error}
                  </p>
                )}
                <Button onClick={submit} disabled={submitting} className="min-h-11 w-full">
                  {submitting
                    ? 'Dépôt…'
                    : latest
                      ? 'Déposer cette version'
                      : 'Déposer le cas pratique'}
                </Button>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
