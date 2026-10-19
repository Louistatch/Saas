/**
 * Chargement commun aux pages apprenant (accueil, reprise, laboratoire) : module, progression,
 * leçons présentées, prénom. Un seul endroit pour les requêtes, pour que les pages restent
 * des mises en page.
 */
import 'server-only'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import type { AcademyModuleWithLessons } from '@/types/domain'
import { lessonCount } from './catalogue'
import { type LearnerLesson, displayTitle, learnerLessons, resumeLesson } from './learner-view'
import {
  OPERATOR_MODULE_ID,
  type ProfileProgressSummary,
  getModuleWithLessons,
  getProfileProgressSummary,
} from './operator-training'

export interface LearnerPageData {
  module: AcademyModuleWithLessons
  summary: ProfileProgressSummary
  lessons: LearnerLesson[]
  resume: LearnerLesson | null
  firstName: string | null
  /** Autres modules publiés (hors parcours opérateur) : affichés sans lien tant qu'ils n'ont pas de parcours. */
  otherPublishedModules: number
}

export async function loadLearnerPage(userId: string): Promise<LearnerPageData | null> {
  const admin = createAdminClient()
  const [module_, summary, profile, others] = await Promise.all([
    getModuleWithLessons(admin, OPERATOR_MODULE_ID, userId),
    getProfileProgressSummary(admin, userId, OPERATOR_MODULE_ID),
    admin.from('profiles').select('first_name').eq('id', userId).maybeSingle(),
    admin
      .from('academy_modules')
      .select('id, academy_lessons(id)')
      .eq('is_published', true)
      .neq('id', OPERATOR_MODULE_ID),
  ])
  if (!module_) return null
  const lessons = learnerLessons(
    module_.lessons.map((l) => ({
      id: l.id,
      title: displayTitle(l.title),
      order_index: l.order_index,
      duration_min: l.duration_min,
      hasQuiz: !!l.quiz,
      hasAssignment: !!l.assignment,
    })),
    summary,
  )
  return {
    module: module_,
    summary,
    lessons,
    resume: resumeLesson(lessons),
    firstName: profile.data?.first_name ?? null,
    // Seulement les vraies formations : un module publié sans leçon n'en est pas une.
    otherPublishedModules: (others.data ?? []).filter((m) => lessonCount(m) > 0).length,
  }
}
