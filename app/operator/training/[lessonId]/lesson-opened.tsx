'use client'

// Signale au serveur que la personne a ouvert la leçon (C1) : une seule requête par montage,
// idempotente côté serveur. Rien à afficher ; la liste des leçons relit la progression.
import { useEffect } from 'react'

export function LessonOpened({ moduleId, lessonId }: { moduleId: string; lessonId: string }) {
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/academy/operator/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moduleId, lessonId }),
      signal: controller.signal,
      keepalive: true,
    }).catch(() => undefined)
    return () => controller.abort()
  }, [moduleId, lessonId])
  return null
}
