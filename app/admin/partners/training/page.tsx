'use client'

/**
 * Suivi admin de la formation « Opérateur certifié FaîtiereHub » — vue
 * lecture seule sur l'avancement de chaque candidat (leçons, quiz, devoirs).
 * Aucune notion de coopérative/membre ici : le parcours est ouvert à tout
 * compte authentifié, y compris un candidat Partenaire sans organisation.
 */

import { EmptyState } from '@/components/shared/empty-state'
import { LoadingBlock } from '@/components/shared/loading'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { GraduationCap } from 'lucide-react'
import { useEffect, useState } from 'react'

interface CandidateRow {
  profile_id: string
  full_name: string | null
  email: string | null
  lessons_completed: number
  lessons_total: number
  quizzes_passed: number
  quizzes_total: number
  submissions_count: number
  last_activity: string | null
}

export default function OperatorTrainingAdminPage() {
  const [candidates, setCandidates] = useState<CandidateRow[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/academy/operator/candidates')
      .then((res) => res.json())
      .then((data) => setCandidates(data.candidates ?? []))
      .finally(() => setIsLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Formation Opérateurs"
        description="Avancement des candidats sur le parcours « Opérateur certifié FaîtiereHub » — leçons, quiz, devoirs. Lecture seule ; la validation de certification se fait depuis Opérateurs."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Candidats</CardTitle>
          <CardDescription>
            {candidates.length} candidat(s) ayant démarré la formation
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingBlock />
          ) : candidates.length === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title="Aucun candidat n'a encore démarré la formation"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-semibold text-foreground">Candidat</th>
                    <th className="text-left py-3 px-4 font-semibold text-foreground">Leçons</th>
                    <th className="text-left py-3 px-4 font-semibold text-foreground">
                      Quiz réussis
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-foreground">
                      Devoirs déposés
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-foreground">
                      Dernière activité
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr
                      key={c.profile_id}
                      className="border-b border-border hover:bg-accent/5 transition-colors"
                    >
                      <td className="py-3 px-4 text-foreground">
                        <div className="font-medium">{c.full_name ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">{c.email ?? '—'}</div>
                      </td>
                      <td className="py-3 px-4 text-foreground">
                        {c.lessons_completed} / {c.lessons_total}
                      </td>
                      <td className="py-3 px-4 text-foreground">
                        {c.quizzes_passed} / {c.quizzes_total}
                      </td>
                      <td className="py-3 px-4 text-foreground">{c.submissions_count}</td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {c.last_activity
                          ? new Date(c.last_activity).toLocaleDateString('fr-FR')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
