'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { AcademyQuizPublic } from '@/types/domain'
import { CheckCircle2, XCircle } from 'lucide-react'
/**
 * Formulaire de quiz — la clé de correction n'existe jamais côté client :
 * le score vient de la réponse de POST /attempts, calculé côté serveur
 * (lib/academy/operator-training.ts).
 */
import { useState } from 'react'

interface AttemptResult {
  ok: boolean
  score?: number
  passed?: boolean
  error?: string
}

export function QuizForm({ quiz }: { quiz: AcademyQuizPublic }) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({})
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<AttemptResult | null>(null)

  const setSingle = (questionId: string, optionId: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: [optionId] }))
  }

  const toggleMultiple = (questionId: string, optionId: string, checked: boolean) => {
    setAnswers((prev) => {
      const current = new Set(prev[questionId] ?? [])
      if (checked) current.add(optionId)
      else current.delete(optionId)
      return { ...prev, [questionId]: [...current] }
    })
  }

  const submit = async () => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/academy/operator/quizzes/${quiz.id}/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      })
      const body = (await res.json().catch(() => ({}))) as AttemptResult
      if (!res.ok) {
        setResult({ ok: false, error: body.error ?? 'Soumission impossible' })
      } else {
        setResult(body)
      }
    } catch {
      setResult({ ok: false, error: 'Erreur de connexion. Vérifiez votre internet.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-foreground">{quiz.title}</CardTitle>
        {quiz.description && <p className="text-sm text-muted-foreground">{quiz.description}</p>}
      </CardHeader>
      <CardContent className="space-y-6">
        {quiz.questions.map((question, index) => (
          <div key={question.id} className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              {index + 1}. {question.prompt}
            </p>
            {question.question_type === 'multiple_choice' ? (
              <div className="space-y-2">
                {question.options.map((option) => (
                  <div key={option.id} className="flex items-center gap-2">
                    <Checkbox
                      id={option.id}
                      checked={(answers[question.id] ?? []).includes(option.id)}
                      onCheckedChange={(checked) =>
                        toggleMultiple(question.id, option.id, checked === true)
                      }
                    />
                    <Label htmlFor={option.id} className="font-normal">
                      {option.label}
                    </Label>
                  </div>
                ))}
              </div>
            ) : question.question_type === 'case' ? (
              <p className="text-xs text-muted-foreground">
                Question ouverte — corrigée manuellement, non notée automatiquement.
              </p>
            ) : (
              <RadioGroup
                value={(answers[question.id] ?? [])[0] ?? ''}
                onValueChange={(value) => setSingle(question.id, value)}
              >
                {question.options.map((option) => (
                  <div key={option.id} className="flex items-center gap-2">
                    <RadioGroupItem value={option.id} id={option.id} />
                    <Label htmlFor={option.id} className="font-normal">
                      {option.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            )}
          </div>
        ))}

        {result?.ok && (
          <div
            className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${
              result.passed
                ? 'border-primary/40 text-primary'
                : 'border-destructive/40 text-destructive'
            }`}
          >
            {result.passed ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            Score : {result.score}% — {result.passed ? 'Réussi' : 'Non atteint'}
          </div>
        )}
        {result && !result.ok && <p className="text-sm text-destructive">{result.error}</p>}

        <Button onClick={submit} disabled={submitting} className="w-full">
          Soumettre le quiz
        </Button>
      </CardContent>
    </Card>
  )
}
