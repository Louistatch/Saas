/**
 * Lecture d'une leçon (J3/J4) : à partir des diapositives et du texte long, ce que chaque
 * espace affiche. Cours = objectif + concepts + démonstration + texte long + à retenir ;
 * Exercice = laboratoire ; Évaluation = énoncé du cas (diapositive « case ») + quiz + dépôt.
 * Les objectifs et résumés répétés entre diapositives et texte sont dédupliqués ici.
 * Fonctions pures, testées dans tests/academy-lesson-reading.test.ts.
 */
import { type LessonBlock, parseLessonText } from './lesson-text'
import { CAPTURE_LABEL, captureFor } from './media-catalogue'

export interface ReadingSlide {
  id: string
  title: string
  body: string
  slide_type: string
  media_asset: {
    status: string
    storage_path: string | null
    alt_text: string | null
    source_route: string | null
  } | null
}

export interface Demo {
  title: string
  /** Écran du produit concerné (« /dashboard/members »), quand il est connu. */
  route: string | null
  /** Ce que la personne doit observer, formulé pour elle. */
  note: string
  /** Image prête à afficher, sinon null : le média est à fournir. */
  src: string | null
  /** Variante téléphone de la capture du catalogue, quand elle existe. */
  srcMobile: string | null
  alt: string
  /** Origine de l'image : capture de production (base) ou capture du produit avec données d'exemple. */
  source: 'production' | 'catalogue' | null
}

export interface LessonReading {
  objective: string | null
  concepts: { id: string; title: string; body: string }[]
  demo: Demo | null
  blocks: LessonBlock[]
  summary: { title: string; body: string } | null
  caseBrief: { title: string; body: string } | null
}

/** Consigne d'auteur (« Utiliser une capture exacte de … ») ou texte pour l'apprenant ? */
export function isAuthorNote(body: string): boolean {
  return /^\s*utiliser (une|la|des) captures?\b/i.test(body)
}

export function demoFromSlide(slide: ReadingSlide, orderIndex: number | null = null): Demo {
  const asset = slide.media_asset
  const path = asset?.storage_path ?? ''
  const ready = asset?.status === 'ready' && (path.startsWith('http') || path.startsWith('/'))
  const routeInBody =
    /\/(?:dashboard|operator|admin|verify)[\w/\-[\]]*/.exec(slide.body)?.[0] ?? null
  const catalogue = captureFor(orderIndex)
  const route = asset?.source_route ?? catalogue?.route ?? routeInBody
  if (ready) {
    return {
      title: slide.title,
      route,
      note: isAuthorNote(slide.body) ? '' : slide.body,
      src: path,
      srcMobile: null,
      alt: asset?.alt_text ?? slide.title,
      source: 'production',
    }
  }
  if (catalogue) {
    return {
      title: slide.title,
      route: catalogue.route,
      note: CAPTURE_LABEL,
      src: catalogue.desktop,
      srcMobile: catalogue.mobile,
      alt: catalogue.alt,
      source: 'catalogue',
    }
  }
  return {
    title: slide.title,
    route,
    note: isAuthorNote(slide.body)
      ? `Capture authentique de l’écran${route ? ` ${route}` : ''} à fournir par l’équipe pédagogique. En attendant, ouvrez cet écran dans votre espace pour le repérer.`
      : slide.body,
    src: null,
    srcMobile: null,
    alt: asset?.alt_text ?? slide.title,
    source: null,
  }
}

export function lessonReading(input: {
  slides: ReadingSlide[]
  content_body: string | null
  order_index?: number | null
}): LessonReading {
  const slides = input.slides
  const objectiveSlide = slides.find((s) => s.slide_type === 'objective')
  const screenshot = slides.find((s) => s.slide_type === 'screenshot')
  const summary = slides.find((s) => s.slide_type === 'summary')
  const caseSlide = slides.find((s) => s.slide_type === 'case')
  let blocks = parseLessonText(input.content_body)

  // Le texte long commence souvent par « OBJECTIFS » + un paragraphe : déjà dit en tête.
  let objective = objectiveSlide?.body.trim() ?? null
  if (blocks[0]?.kind === 'heading' && /^objectifs?$/i.test(blocks[0].text)) {
    const para = blocks[1]
    if (para?.kind === 'paragraph') {
      objective = objective ?? para.text
      blocks = blocks.slice(2)
    } else {
      blocks = blocks.slice(1)
    }
  }

  return {
    objective,
    concepts: slides
      .filter(
        (s) =>
          s.slide_type === 'concept' || s.slide_type === 'procedure' || s.slide_type === 'warning',
      )
      .map((s) => ({ id: s.id, title: s.title, body: s.body })),
    demo: screenshot ? demoFromSlide(screenshot, input.order_index ?? null) : null,
    blocks,
    summary: summary ? { title: summary.title, body: summary.body } : null,
    caseBrief: caseSlide ? { title: caseSlide.title, body: caseSlide.body } : null,
  }
}
