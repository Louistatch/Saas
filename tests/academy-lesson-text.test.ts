import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isHeadingLine,
  objectiveFromText,
  parseLessonText,
  titleCase,
} from '../lib/academy/lesson-text'

const SAMPLE = `OBJECTIFS
Créer des bases de membres propres.

1. AVANT L'IMPORT
Ne jamais importer un fichier uniquement parce qu'il est disponible.
Vérifier les colonnes.

3. DÉDUPLICATION
Chercher les doublons avec plusieurs indices : nom, prénom, téléphone.

6. CONTRÔLE QUALITÉ AVANT LIVRAISON
- vérifier un échantillon ;
- compter les lignes avant/après ;

CHECKLIST D'ONBOARDING

Avant toute configuration :
□ Identifier le niveau.
□ Vérifier le nom officiel.

EN CAS D'INCIDENT
1. arrêter l'opération concernée ;
2. conserver les références utiles ;`

describe('texte long d’une leçon (J3/J4)', () => {
  it('reconnaît les titres en capitales, numérotés ou non', () => {
    assert.equal(isHeadingLine('OBJECTIFS'), true)
    assert.equal(isHeadingLine('3. DÉDUPLICATION'), true)
    assert.equal(isHeadingLine("CHECKLIST D'ONBOARDING"), true)
    assert.equal(isHeadingLine('Faîtière → Union → Coopérative → Membres.'), false)
    assert.equal(isHeadingLine('1 200'), false)
    assert.equal(isHeadingLine('- vérifier un échantillon ;'), false)
  })

  it('découpe en titres, paragraphes et listes', () => {
    const blocks = parseLessonText(SAMPLE)
    assert.deepEqual(
      blocks.map((b) => b.kind),
      [
        'heading',
        'paragraph',
        'heading',
        'paragraph',
        'heading',
        'paragraph',
        'heading',
        'list',
        'heading',
        'paragraph',
        'list',
        'heading',
        'list',
      ],
    )
    const h = blocks[2]
    assert.deepEqual(h, { kind: 'heading', text: "Avant l'import", number: 1 })
    const p = blocks[3]
    assert.equal(
      p.kind === 'paragraph' && p.text,
      "Ne jamais importer un fichier uniquement parce qu'il est disponible. Vérifier les colonnes.",
    )
    const bullets = blocks[7]
    assert.deepEqual(bullets, {
      kind: 'list',
      ordered: false,
      checklist: false,
      items: ['vérifier un échantillon ;', 'compter les lignes avant/après ;'],
    })
    const checks = blocks[10]
    assert.equal(checks.kind === 'list' && checks.checklist, true)
    const steps = blocks[12]
    assert.equal(steps.kind === 'list' && steps.ordered, true)
  })

  it('met les titres en casse de phrase en gardant les sigles', () => {
    assert.equal(titleCase('WALLET PAYG'), 'Wallet PAYG')
    assert.equal(titleCase('QR PUBLIC'), 'QR public')
    assert.equal(titleCase('CAS PRATIQUE'), 'Cas pratique')
    assert.equal(titleCase('CE QUE FAIT UN OPÉRATEUR'), 'Ce que fait un opérateur')
    assert.equal(titleCase('QUI PAIE FAÎTIEREHUB ?'), 'Qui paie FaîtiereHub ?')
    assert.equal(titleCase('IMPORT DANS FAÎTIEREHUB'), 'Import dans FaîtiereHub')
  })

  it('extrait l’objectif pour l’aperçu du cursus', () => {
    assert.equal(objectiveFromText(SAMPLE), 'Créer des bases de membres propres.')
    assert.equal(objectiveFromText('MISSION PRATIQUE\nVous recevez…'), null)
    assert.equal(objectiveFromText(null), null)
  })
})
