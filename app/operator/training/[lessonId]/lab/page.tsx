import { LabFrame } from '@/components/academy/lab-frame'
import { LAB_SCENE, missionForLesson } from '@/lib/academy/lab-missions'
import { loadLearnerPage } from '@/lib/academy/learner-page'
import { assertOperatorCandidate } from '@/lib/security/assert-partner-access'
// Laboratoire d'une leçon (cadre J3). Aucune écriture : la page lit seulement la leçon pour
// choisir la mission et revenir au bon endroit.
import { notFound, redirect } from 'next/navigation'

export default async function LessonLabPage({
  params,
}: {
  params: Promise<{ lessonId: string }>
}) {
  const guard = await assertOperatorCandidate()
  if (!guard.ok) redirect('/operator')
  const { lessonId } = await params
  const data = await loadLearnerPage(guard.ctx.userId)
  const lesson = data?.lessons.find((l) => l.id === lessonId)
  if (!lesson) notFound()
  return (
    <LabFrame
      sceneTitle={LAB_SCENE.title}
      objects={LAB_SCENE.objects}
      mission={missionForLesson(lesson.title)}
      lesson={{ id: lesson.id, title: lesson.title, order_index: lesson.order_index }}
    />
  )
}
