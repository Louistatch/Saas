import { loadLearnerPage } from '@/lib/academy/learner-page'
import { assertOperatorCandidate } from '@/lib/security/assert-partner-access'
// « Mes cours » : ouvre la leçon à reprendre (dernière consultée non validée, sinon la
// première), ou la première leçon quand tout est validé.
import { redirect } from 'next/navigation'

export default async function ResumePage() {
  const guard = await assertOperatorCandidate()
  if (!guard.ok) redirect('/operator')
  const data = await loadLearnerPage(guard.ctx.userId)
  const target = data?.resume ?? data?.lessons[0]
  redirect(target ? `/operator/training/${target.id}` : '/operator/training')
}
