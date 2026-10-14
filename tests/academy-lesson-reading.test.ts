import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { demoFromSlide, isAuthorNote, lessonReading } from '../lib/academy/lesson-reading'

const slide = (
  slide_type: string,
  title: string,
  body: string,
  asset: Record<string, unknown> | null = null,
) => ({
  id: `${slide_type}-${title}`,
  title,
  body,
  slide_type,
  media_asset: asset as never,
})

describe('lecture d’une leçon (J3/J4)', () => {
  it('répartit les diapositives entre cours et évaluation, sans répéter l’objectif', () => {
    const r = lessonReading({
      slides: [
        slide('objective', 'Objectif', 'Créer des bases propres.'),
        slide('concept', 'Chaîne qualité', 'Collecte → Vérification.'),
        slide(
          'screenshot',
          'Page Membres',
          'Utiliser une capture exacte de /dashboard/members pour…',
        ),
        slide('case', 'Cas pratique', 'Vous recevez un fichier de 120 membres.'),
        slide('summary', 'À retenir', 'Une bonne base membre conditionne tout.'),
      ],
      content_body:
        'OBJECTIFS\nCréer des bases propres.\n\n1. AVANT L’IMPORT\nVérifier les colonnes.',
    })
    assert.equal(r.objective, 'Créer des bases propres.')
    assert.deepEqual(
      r.concepts.map((c) => c.title),
      ['Chaîne qualité'],
    )
    assert.equal(r.blocks[0].kind, 'heading')
    assert.equal(r.blocks.length, 2)
    assert.equal(r.caseBrief?.body, 'Vous recevez un fichier de 120 membres.')
    assert.equal(r.summary?.title, 'À retenir')
  })

  it('prend l’objectif dans le texte quand la diapositive manque', () => {
    const r = lessonReading({
      slides: [],
      content_body: 'OBJECTIFS\nSavoir intervenir.\n\n1. HIÉRARCHIE\nFaîtière → Union.',
    })
    assert.equal(r.objective, 'Savoir intervenir.')
    assert.equal(r.blocks[0].kind === 'heading' && r.blocks[0].text, 'Hiérarchie')
  })

  it('transforme une consigne d’auteur en démonstration à fournir, jamais en fausse capture', () => {
    assert.equal(isAuthorNote('Utiliser une capture exacte de /dashboard/members'), true)
    assert.equal(isAuthorNote('Observer l’écran réel /operator : statut candidat'), false)
    const d = demoFromSlide(
      slide(
        'screenshot',
        'Page Membres',
        'Utiliser une capture exacte de /dashboard/members pour identifier…',
        {
          status: 'pending_capture',
          storage_path: null,
          alt_text: null,
          source_route: '/dashboard/members',
        },
      ),
    )
    assert.equal(d.src, null)
    assert.equal(d.route, '/dashboard/members')
    assert.match(d.note, /à fournir/)
    const ready = demoFromSlide(
      slide('screenshot', 'Page Cartes', 'Observer la page des cartes.', {
        status: 'ready',
        storage_path: '/media/cards.png',
        alt_text: 'Page Cartes',
        source_route: '/dashboard/cards',
      }),
    )
    assert.equal(ready.src, '/media/cards.png')
    assert.equal(ready.note, 'Observer la page des cartes.')
  })
})
