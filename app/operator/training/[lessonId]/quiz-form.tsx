'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { AcademyQuizPublic } from '@/types/domain'
import { ArrowLeft, ArrowRight, CheckCircle2, Clock, XCircle } from 'lucide-react'
/**
 * Quiz : une question à la fois, progression visible, confirmation avant l'envoi, puis retour
 * détaillé (bonne réponse, explication) question par question. La clé de correction n'arrive
 * qu'avec le résultat d'une tentative corrigée côté serveur (lib/academy/operator-training.ts).
 * Un quiz réussi ne se rejoue pas ; la limite de tentatives par 24 h vient du serveur.
 */
import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface QuestionFeedback {
  questionId: string
  earned: number
  points: number
  correct: boolean
  pending: boolean
  correctOptionIds: string[]
  selectedOptionIds: string[]
  explanation: string | null
}

interface AttemptResult {
  ok: boolean
  score?: number
  passed?: boolean
  error?: string
  reason?: 'already_passed' | 'limit_reached'
  retryAt?: string
  attemptsLeft?: number | null
  feedback?: QuestionFeedback[]
  lessonCompleted?: boolean
  training?: { lessonsCompleted: number; lessonsTotal: number; trainingCompleted: boolean } | null
}

export interface QuizHistory {
  attempts: number
  anyPassed: boolean
  lastScore: number | null
}

const enter =
  'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-2 motion-safe:duration-200 motion-safe:ease-out'

export function QuizForm({ quiz, history }: { quiz: AcademyQuizPublic; history: QuizHistory }) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({})
  const [index, setIndex] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<AttemptResult | null>(null)
  const [closed, setClosed] = useState(history.anyPassed)
  const router = useRouter()

  const questions = quiz.questions
  const total = questions.length
  const current = questions[index]
  const answered = (q: { id: string; question_type: string }) =>
    q.question_type === 'case' || (answers[q.id] ?? []).length > 0
  const unanswered = questions.filter((q) => !answered(q)).length

  const setSingle = (questionId: string, optionId: string) =>
    setAnswers((prev) => ({ ...prev, [questionId]: [optionId] }))
  const toggleMultiple = (questionId: string, optionId: string, checked: boolean) =>
    setAnswers((prev) => {
      const set = new Set(prev[questionId] ?? [])
      if (checked) set.add(optionId)
      else set.delete(optionId)
      return { ...prev, [questionId]: [...set] }
    })

  const submit = async () => {
    setSubmitting(true)
    setConfirming(false)
    try {
      const res = await fetch(`/api/academy/operator/quizzes/${quiz.id}/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      })
      const body = (await res.json().catch(() => ({}))) as AttemptResult
      if (!res.ok) setResult({ ...body, ok: false, error: body.error ?? 'Soumission impossible' })
      else {
        setResult(body)
        if (body.passed) {
          setClosed(true)
          // Le serveur décide de l'état de la leçon : on relit la page (cas pratique déverrouillé).
          router.refresh()
        }
      }
    } catch {
      setResult({ ok: false, error: 'Erreur de connexion. Vérifiez votre internet.' })
    } finally {
      setSubmitting(false)
    }
  }

  const retry = () => {
    setAnswers({})
    setIndex(0)
    setResult(null)
  }

  if (closed && !result) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">{quiz.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="flex items-center gap-2 text-sm font-medium text-primary">
            <CheckCircle2 className="h-4 w-4" /> Quiz réussi
            {history.lastScore != null ? ` (${history.lastScore} %)` : ''}. Il ne se rejoue pas.
          </p>
        </CardContent>
      </Card>
    )
  }

  // Résultat d'une tentative : score, puis chaque question avec la bonne réponse et l'explication.
  if (result?.ok) {
    const byId = new Map((result.feedback ?? []).map((f) => [f.questionId, f]))
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">{quiz.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5" aria-live="polite">
          <div
            className={`flex items-center gap-2 rounded-lg border p-3 text-sm font-medium ${
              result.passed
                ? 'border-primary/40 text-primary'
                : 'border-destructive/40 text-destructive'
            }`}
          >
            {result.passed ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            Score : {result.score} %, seuil {quiz.passing_score} %.{' '}
            {result.passed ? 'Quiz réussi.' : 'Seuil non atteint.'}
          </div>
          {result.lessonCompleted && (
            <p className="text-sm font-medium text-primary">
              Leçon validée.
              {result.training && !result.training.trainingCompleted
                ? ` ${result.training.lessonsCompleted} leçon(s) sur ${result.training.lessonsTotal} validée(s).`
                : ''}
              {result.training?.trainingCompleted
                ? ' Formation terminée : votre dossier passe à l’évaluation pratique.'
                : ''}
            </p>
          )}
          {result.passed && !result.lessonCompleted && (
            <p className="text-sm text-muted-foreground">
              Déposez le cas pratique ci-dessous pour valider la leçon.
            </p>
          )}
          <ol className="space-y-4">
            {questions.map((q, i) => {
              const f = byId.get(q.id)
              const chosen = new Set(f?.selectedOptionIds ?? answers[q.id] ?? [])
              const good = new Set(f?.correctOptionIds ?? [])
              return (
                <li key={q.id} className="rounded-lg border border-border p-3">
                  <p className="text-sm font-medium text-foreground">
                    {i + 1}. {q.prompt}
                    {f && !f.pending && (
                      <span
                        className={`ml-2 text-xs ${f.correct ? 'text-primary' : 'text-destructive'}`}
                      >
                        {f.earned} / {f.points} pt
                      </span>
                    )}
                  </p>
                  {q.question_type === 'case' ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Question ouverte : en attente de correction, hors score.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-1 text-sm">
                      {q.options.map((o) => {
                        const isGood = good.has(o.id)
                        const isChosen = chosen.has(o.id)
                        return (
                          <li
                            key={o.id}
                            className={
                              isGood
                                ? 'font-medium text-primary'
                                : isChosen
                                  ? 'text-destructive line-through'
                                  : 'text-muted-foreground'
                            }
                          >
                            {isGood ? '✓ ' : isChosen ? '✗ ' : '· '}
                            {o.label}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                  {f?.explanation && (
                    <p className="mt-2 text-xs text-foreground/80">{f.explanation}</p>
                  )}
                </li>
              )
            })}
          </ol>
          {!result.passed &&
            (result.attemptsLeft == null || result.attemptsLeft > 0 ? (
              <Button onClick={retry} variant="outline" className="min-h-11 w-full">
                Réessayer
                {result.attemptsLeft != null
                  ? ` (${result.attemptsLeft} tentative(s) restante(s) aujourd’hui)`
                  : ''}
              </Button>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" /> Nombre de tentatives atteint pour aujourd’hui. Relisez
                la leçon et réessayez demain.
              </p>
            ))}
        </CardContent>
      </Card>
    )
  }

  if (!current) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-foreground">
          <span>{quiz.title}</span>
          <span className="text-sm font-medium text-muted-foreground">
            Question {index + 1} sur {total}
          </span>
        </CardTitle>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
          <div
            className="h-full rounded-full bg-primary transition-transform duration-300 ease-out"
            style={{ transform: `scaleX(${(index + 1) / total})`, transformOrigin: 'left' }}
          />
        </div>
        {history.attempts > 0 && (
          <p className="text-xs text-muted-foreground">
            {history.attempts} tentative(s) déjà faite(s)
            {history.lastScore != null ? `, dernier score ${history.lastScore} %` : ''}.
            {quiz.max_attempts ? ` Au plus ${quiz.max_attempts} par jour.` : ''}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        <fieldset key={current.id} className={`space-y-3 ${enter}`}>
          <legend className="text-base font-medium text-foreground">{current.prompt}</legend>
          {current.question_type === 'multiple_choice' ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Plusieurs réponses possibles.</p>
              {current.options.map((option) => (
                <div key={option.id} className="flex min-h-11 items-center gap-3">
                  <Checkbox
                    id={option.id}
                    checked={(answers[current.id] ?? []).includes(option.id)}
                    onCheckedChange={(checked) =>
                      toggleMultiple(current.id, option.id, checked === true)
                    }
                  />
                  <Label htmlFor={option.id} className="font-normal leading-snug">
                    {option.label}
                  </Label>
                </div>
              ))}
            </div>
          ) : current.question_type === 'case' ? (
            <p className="text-xs text-muted-foreground">
              Question ouverte : corrigée par l'équipe, hors score automatique.
            </p>
          ) : (
            <RadioGroup
              value={(answers[current.id] ?? [])[0] ?? ''}
              onValueChange={(value) => setSingle(current.id, value)}
            >
              {current.options.map((option) => (
                <div key={option.id} className="flex min-h-11 items-center gap-3">
                  <RadioGroupItem value={option.id} id={option.id} />
                  <Label htmlFor={option.id} className="font-normal leading-snug">
                    {option.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          )}
        </fieldset>

        {result && !result.ok && (
          <p className="text-sm text-destructive" aria-live="polite">
            {result.error}
          </p>
        )}

        {confirming ? (
          <div className="space-y-3 rounded-lg border border-border p-3" aria-live="polite">
            <p className="text-sm text-foreground">
              Envoyer vos {total} réponses ? Vous verrez ensuite les bonnes réponses et les
              explications.
            </p>
            <div className="flex gap-2">
              <Button onClick={submit} disabled={submitting} className="min-h-11 flex-1">
                {submitting ? 'Correction…' : 'Confirmer et envoyer'}
              </Button>
              <Button variant="outline" onClick={() => setConfirming(false)} className="min-h-11">
                Revoir
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              className="min-h-11"
              aria-label="Question précédente"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            {index < total - 1 ? (
              <Button
                onClick={() => setIndex((i) => i + 1)}
                disabled={!answered(current)}
                className="min-h-11 flex-1"
              >
                Suivante <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={() => setConfirming(true)}
                disabled={unanswered > 0}
                className="min-h-11 flex-1"
              >
                {unanswered > 0 ? `${unanswered} question(s) sans réponse` : 'Envoyer mes réponses'}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
