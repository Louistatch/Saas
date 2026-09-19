'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import type { AcademyAssignment } from '@/types/domain'
import { CheckCircle2, ClipboardList } from 'lucide-react'
import { useState } from 'react'

export function AssignmentForm({ assignment }: { assignment: AcademyAssignment }) {
  const [contentText, setContentText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!contentText.trim()) {
      setError('Rédigez votre réponse avant de soumettre.')
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
      setSubmitted(true)
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
      </CardHeader>
      <CardContent className="space-y-3">
        {submitted ? (
          <p className="flex items-center gap-2 text-sm text-primary">
            <CheckCircle2 className="h-4 w-4" /> Devoir soumis.
          </p>
        ) : (
          <>
            <Textarea
              value={contentText}
              onChange={(e) => setContentText(e.target.value)}
              placeholder="Votre réponse"
              rows={6}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={submit} disabled={submitting} className="w-full">
              Soumettre le devoir
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
