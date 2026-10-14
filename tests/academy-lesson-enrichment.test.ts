import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { describe, it } from 'node:test'
import { LESSON_ENRICHMENT, enrichmentFor } from '../lib/academy/lesson-enrichment'
import { captureFor } from '../lib/academy/media-catalogue'

describe('enrichissement éditorial J4', () => {
  it('couvre les 12 leçons, une fois chacune', () => {
    assert.deepEqual(
      LESSON_ENRICHMENT.map((e) => e.lesson),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    )
  })

  it('donne à chaque leçon un résultat, un exemple de terrain, trois auto-vérifications et un repère de démonstration', () => {
    for (const e of LESSON_ENRICHMENT) {
      assert.ok(e.outcome.length > 30, `résultat leçon ${e.lesson}`)
      assert.ok(
        e.example.title.length > 5 && e.example.body.length > 200,
        `exemple leçon ${e.lesson}`,
      )
      assert.equal(e.selfCheck.length, 3, `auto-vérification leçon ${e.lesson}`)
      for (const s of e.selfCheck) {
        assert.ok(s.question.includes('?'), `question leçon ${e.lesson}`)
        assert.ok(s.answer.length > 20, `réponse leçon ${e.lesson}`)
      }
      assert.ok(e.demoFocus.length > 40, `démonstration leçon ${e.lesson}`)
    }
    assert.equal(enrichmentFor(13), null)
    assert.equal(enrichmentFor(null), null)
  })

  it('ne modifie aucun barème : les montants cités sont ceux des leçons', () => {
    const all = JSON.stringify(LESSON_ENRICHMENT)
    assert.match(all, /15 000 FCFA/)
    assert.match(all, /2 000 FCFA/)
    assert.doesNotMatch(all, /Math\.random|certifi[ée]e? automatiquement/)
  })

  it('a une capture du produit (bureau et mobile) pour chacune des 12 leçons', () => {
    for (let n = 1; n <= 12; n++) {
      const c = captureFor(n)
      assert.ok(c, `catalogue leçon ${n}`)
      assert.ok(existsSync(`public${c.desktop}`), `fichier ${c.desktop}`)
      assert.ok(existsSync(`public${c.mobile}`), `fichier ${c.mobile}`)
    }
    assert.equal(captureFor(13), null)
  })
})
