import { loadLearnerPage } from '@/lib/academy/learner-page'
import { assertOperatorCandidate } from '@/lib/security/assert-partner-access'
// « Laboratoire » : ouvre le laboratoire de la leçon en cours.
import { redirect } from 'next/navigation'

export default async function LabEntryPage() {
  const guard = await assertOperatorCandidate()
  if (!guard.ok) redirect('/operator')
  const data = await loadLearnerPage(guard.ctx.userId)
  const target = data?.resume ?? data?.lessons[0]
  redirect(target ? `/operator/training/${target.id}/lab` : '/operator/training')
}
