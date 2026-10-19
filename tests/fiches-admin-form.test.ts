/**
 * Formulaire admin des comptes d'exploitation (lib/fiches/admin-form.ts), refus
 * de carte dans la fenêtre d'achat (lib/fiches/access-error.ts) et écrans
 * d'erreur (lib/utils/error-reference.ts) : règles pures de l'interface.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import {
  CARD_NOT_FREE_FALLBACK,
  NO_LONGER_FREE_TEXT,
  PAYMENT_PENDING_TEXT,
  SERVICE_DOWN_TEXT,
  accessErrorText,
} from '../lib/fiches/access-error'
import {
  FAITIERE_DRAFT_FIELDS,
  createdNotice,
  faitiereDraftErrors,
  firstInvalidTarget,
  followOffset,
  unplacedErrors,
} from '../lib/fiches/admin-form'
import { searchLikePattern } from '../lib/fiches/culture'
import { marketplaceFicheHref } from '../lib/fiches/member-label'
import { validateFicheDraft } from '../lib/fiches/upload'
import { apiErrorText, reasonOf } from '../lib/fiches/upload-client'
import { errorReference, errorScreenBody } from '../lib/utils/error-reference'

// ── Erreurs du formulaire : premier champ, dans l'ordre de la page ─────────

test('A1 : focus sur le premier champ en erreur, dans l’ordre affiché', () => {
  assert.equal(firstInvalidTarget({}, 'create'), null)
  assert.equal(
    firstInvalidTarget({ files: 'Ajoutez un fichier', title: 'Titre requis' }, 'create'),
    'create-title',
  )
  assert.equal(
    firstInvalidTarget({ files: 'Ajoutez un fichier', culture: 'Culture requise' }, 'edit'),
    'edit-culture',
  )
  assert.equal(firstInvalidTarget({ files: 'Ajoutez un fichier' }, 'create'), 'create-files')
  assert.equal(firstInvalidTarget({ price_non_member: 'Prix' }, 'create'), 'create-price')
  assert.equal(firstInvalidTarget({ canton_id: 'Canton inconnu' }, 'create'), 'create-canton')
  assert.equal(firstInvalidTarget({ cover_url: 'Image refusée' }, 'create'), 'create-cover')
  // Message vide = pas d'erreur ; champ sans élément = pas de focus.
  assert.equal(firstInvalidTarget({ title: '' }, 'create'), null)
  assert.equal(firstInvalidTarget({ status: 'Statut invalide' }, 'create'), null)
})

test('A2 : erreurs sans champ à l’écran → montrées près du bouton', () => {
  assert.deepEqual(unplacedErrors({ title: 'Titre requis', files: 'Fichier' }), [])
  assert.deepEqual(unplacedErrors({ title: 'Titre requis', status: 'Statut invalide' }), [
    'Statut invalide',
  ])
  assert.deepEqual(unplacedErrors({ is_free_for_members: '' }), [])
})

// ── Aperçu qui suit la saisie (grand écran) ────────────────────────────────

test('A3 : l’aperçu reste à 16 px du haut, borné au formulaire', () => {
  const at = (trackTop: number) =>
    followOffset({ trackTop, trackHeight: 1200, boxHeight: 450, gap: 16 })
  assert.equal(at(300), 0, 'formulaire encore bas : aucun décalage')
  assert.equal(at(16), 0)
  assert.equal(at(-200), 216, 'formulaire défilé : l’aperçu suit')
  assert.equal(at(-5000), 750, 'jamais sous le bas du formulaire')
  // Aperçu plus haut que le formulaire : ne bouge pas.
  assert.equal(followOffset({ trackTop: -300, trackHeight: 400, boxHeight: 500, gap: 16 }), 0)
})

// ── Confirmation après enregistrement ──────────────────────────────────────

test('A4 : confirmation : ce qui s’est passé, où le retrouver, formulaire prêt', () => {
  const pub = createdNotice({ title: 'Compte Maïs', status: 'published' })
  assert.equal(pub.title, '« Compte Maïs » est en vente.')
  assert.match(pub.body, /catalogue ci-dessous et dans la boutique publique/)
  assert.match(pub.body, /prêt pour le compte suivant/)
  const draft = createdNotice({ title: 'Compte Maïs', status: 'draft' })
  assert.equal(draft.title, '« Compte Maïs » est enregistré en brouillon.')
  assert.match(draft.body, /pas visible dans la boutique/)
  assert.match(draft.body, /« Mettre en vente » dans le catalogue/)
})

// ── Fenêtre d'achat : refus de carte (402) ────────────────────────────────

test('A5 : un 402 affiche le message du serveur, quelle que soit la raison', () => {
  for (const [reason, message] of [
    ['card_inactive', 'Votre carte ou votre adhésion n’est pas active : achetez-le.'],
    ['not_holder', 'Ce compte est gratuit pour le titulaire de la carte uniquement.'],
    ['other_tree', 'Ce compte est gratuit pour les membres de FENOMAT uniquement.'],
    ['card_outdated', 'Votre carte ne correspond plus à votre coopérative.'],
    ['broken_chain', 'Rattachement de votre coopérative incomplet.'],
  ] as const) {
    assert.equal(
      accessErrorText(402, { access: 'denied', reason, message } as never),
      message,
      reason,
    )
  }
  assert.equal(accessErrorText(402, { reason: 'other_tree' }), CARD_NOT_FREE_FALLBACK)
  assert.equal(accessErrorText(402, { message: '   ' }), CARD_NOT_FREE_FALLBACK)
  assert.equal(accessErrorText(402, null), CARD_NOT_FREE_FALLBACK)
})

test('A6 : autres refus : phrases qui disent quoi faire, jamais le texte technique', () => {
  assert.equal(accessErrorText(404, {}), 'Ce compte d’exploitation n’est plus disponible.')
  assert.match(accessErrorText(429, {}), /Patientez une minute/)
  assert.equal(accessErrorText(500, { error: 'Erreur serveur' }), SERVICE_DOWN_TEXT)
  assert.equal(accessErrorText(503, null), SERVICE_DOWN_TEXT)
  // Boutique en cache à 0 FCFA, prix relevé entre-temps : recharger pour voir le prix.
  assert.equal(
    accessErrorText(400, { error: 'card_number ou purchase_id requis', reason: 'not_free' }),
    NO_LONGER_FREE_TEXT,
  )
  assert.match(NO_LONGER_FREE_TEXT, /plus gratuit.*rechargez la page/)
  // Achat pas encore réglé : attendre ou ouvrir le lien de l'achat.
  assert.equal(
    accessErrorText(403, { error: 'Achat non trouvé ou paiement en attente' }),
    PAYMENT_PENDING_TEXT,
  )
  assert.match(PAYMENT_PENDING_TEXT, /Réessayez dans quelques minutes/)
  // Le `message` n'est affiché que pour un 402 ; le texte technique `error`, jamais.
  for (const [status, reply] of [
    [400, { error: 'card_number ou purchase_id requis' }],
    [400, { error: 'ID achat invalide', message: 'ne pas afficher' }],
    [403, { error: 'Forbidden' }],
    [418, { error: 'teapot' }],
  ] as const) {
    const out = accessErrorText(status, reply)
    assert.doesNotMatch(out, /card_number|purchase_id|ID achat|Forbidden|teapot|ne pas afficher/)
    assert.match(out, /rechargez la page|Réessayez/i, `${status} ${JSON.stringify(reply)}`)
  }
})

// ── Formulaires et catalogue : réponses des routes ────────────────────────

test('A8 : panne du serveur (5xx) → consigne ; refus 4xx du serveur gardés', () => {
  const r = (status: number, data: Record<string, unknown> = {}) => ({ status, data })
  for (const status of [500, 502, 503, 504])
    assert.equal(apiErrorText(r(status, { error: 'Erreur serveur' }), 'Repli'), SERVICE_DOWN_TEXT)
  assert.equal(apiErrorText(r(500, { error: 'Enregistrement impossible' }), 'X'), SERVICE_DOWN_TEXT)
  assert.equal(apiErrorText(r(502), 'X'), SERVICE_DOWN_TEXT, 'passerelle sans corps JSON')
  assert.equal(
    apiErrorText(r(409, { error: 'Ce compte a des ventes : retirez-le de la vente' }), 'X'),
    'Ce compte a des ventes : retirez-le de la vente',
  )
  assert.match(apiErrorText(r(403, { error: 'Forbidden' }), 'X'), /super-admin/)
  assert.match(apiErrorText(r(401), 'X'), /reconnectez-vous/)
  assert.equal(apiErrorText(r(400), 'Modification impossible'), 'Modification impossible')
  // Réseau coupé (ficheApi : status 0) : son message passe tel quel.
  assert.match(apiErrorText(r(0, { error: 'Pas de réseau. Vérifiez…' }), 'X'), /Pas de réseau/)
})

test('A9 : raison insérée dans une phrase, sans double point', () => {
  const sentence = (e: unknown) => `${reasonOf(e)}. Rien n’a été mis en ligne.`
  assert.equal(
    sentence(
      new Error(
        '« a.pdf » : connexion interrompue pendant l’envoi. Vérifiez votre réseau puis réessayez.',
      ),
    ),
    '« a.pdf » : connexion interrompue pendant l’envoi. Vérifiez votre réseau puis réessayez. Rien n’a été mis en ligne.',
  )
  assert.equal(
    sentence(new Error('« b.xlsx » : fichier trop volumineux (20 Mo au maximum). ')),
    '« b.xlsx » : fichier trop volumineux (20 Mo au maximum). Rien n’a été mis en ligne.',
  )
  assert.equal(sentence(SERVICE_DOWN_TEXT), `${SERVICE_DOWN_TEXT} Rien n’a été mis en ligne.`)
  assert.doesNotMatch(
    sentence(new Error('Vérification des fichiers impossible, réessayez.')),
    /\.\./,
  )
  assert.equal(reasonOf(new Error('Fichiers refusés')), 'Fichiers refusés')
})

// ── Fenêtre « Nouvelle fiche » de la faîtière ─────────────────────────────

test('A10 : bouton jamais grisé en silence : ce qui manque, champ par champ', () => {
  const base = { title: '', culture: '', publish: false, fileCount: 0 }
  const empty = faitiereDraftErrors(base)
  assert.deepEqual(Object.keys(empty), ['title', 'culture'])
  // Mêmes messages que le formulaire admin (schéma du serveur).
  const admin = validateFicheDraft({
    title: '',
    description: '',
    culture: '',
    type_agriculture: 'conventionnel',
    campaign: '',
    price: '0',
    region_id: '',
    prefecture_id: '',
    canton_id: '',
  })
  assert.equal(empty.title, admin.title)
  assert.equal(empty.culture, admin.culture)
  // Ordre de la fenêtre : le titre reçoit le focus en premier.
  assert.equal(
    FAITIERE_DRAFT_FIELDS.find((f) => empty[f]),
    'title',
  )
  assert.match(
    faitiereDraftErrors({ ...base, title: 'Ma', culture: 'Maïs' }).title ?? '',
    /au moins 3/,
  )
  // Brouillon sans fichier : accepté.
  assert.deepEqual(faitiereDraftErrors({ ...base, title: 'Compte Maïs', culture: 'Maïs' }), {})
  // Mise en vente sans fichier : dit quoi faire (ajouter, ou décocher).
  const sale = faitiereDraftErrors({
    ...base,
    title: 'Compte Maïs',
    culture: 'Maïs',
    publish: true,
  })
  assert.deepEqual(Object.keys(sale), ['files'])
  assert.match(sale.files ?? '', /Ajoutez au moins un fichier.*décochez « Mettre en vente/)
  assert.deepEqual(
    faitiereDraftErrors({ title: 'Compte Maïs', culture: 'Maïs', publish: true, fileCount: 1 }),
    {},
  )
})

// ── « Voir dans la boutique » et recherche ────────────────────────────────

/** Motif ILIKE → expression régulière (même lecture que PostgreSQL). */
const likeMatches = (pattern: string, value: string) => {
  let re = ''
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i] as string
    if (ch === '\\') re += (pattern[++i] ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    else if (ch === '%') re += '.*'
    else if (ch === '_') re += '.'
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`, 'is').test(value)
}

test('A11 : lien vers LA fiche ; recherche d’un titre à virgules et parenthèses', () => {
  const id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1'
  assert.equal(marketplaceFicheHref({ id }), `/marketplace?fiche=${id}`)

  const title = 'Compte d’exploitation Maïs, 1 hectare (Kara), 2026'
  const pattern = searchLikePattern(title)
  assert.ok(likeMatches(pattern, title), 'le titre exact se retrouve')
  assert.ok(likeMatches(pattern, `Nouveau ${title} révisé`))
  // Aucun séparateur PostgREST ne reste dans le filtre `or`.
  assert.doesNotMatch(pattern, /[,()[\]"]/)
  // Jokers saisis : pris à la lettre.
  assert.ok(likeMatches(searchLikePattern('100%_bio'), '100%_bio'))
  assert.equal(likeMatches(searchLikePattern('100%_bio'), '100 xbio'), false)
  // Titre de 200 caractères : coupé à 100, jamais refusé.
  const long = `${'Compte Maïs, '.repeat(20)}`.slice(0, 200)
  const longPattern = searchLikePattern(long)
  assert.ok(longPattern.length <= 102)
  assert.ok(likeMatches(longPattern, long))
})

// ── Écrans d'erreur : référence seulement, jamais le message technique ───

test('A7 : référence = digest de Next, rien d’autre', () => {
  const err = Object.assign(new Error('relation "secret_table" does not exist'), {
    digest: '2840341823',
  })
  assert.equal(errorReference(err), '2840341823')
  assert.equal(errorReference(new Error('boom')), null)
  assert.equal(errorReference({ digest: 42 }), null)
  assert.equal(errorReference({ digest: '<script>' }), null)
  assert.equal(errorReference('boom'), null)
  assert.equal(errorReference(null), null)
  const body = errorScreenBody(errorReference(err))
  assert.match(body, /référence ci-dessous/)
  assert.doesNotMatch(body, /secret_table/)
  assert.doesNotMatch(errorScreenBody(null), /référence/)
  assert.match(errorScreenBody(null), /Réessayez/)
})

// ── Retours là où l'action a eu lieu (sources des pages) ──────────────────

const source = (...parts: string[]) => readFileSync(path.join(__dirname, '..', ...parts), 'utf8')
/** Corps d'une fonction `const <name> = async (` jusqu'à la suivante. */
const bodyOf = (src: string, name: string) => {
  const start = src.indexOf(`const ${name} = async (`)
  assert.ok(start > 0, `${name} introuvable`)
  const next = src.indexOf('\n  const ', start + 10)
  return src.slice(start, next > 0 ? next : undefined)
}

test('A12 : catalogue admin — retour sous la ligne, amené à l’écran et focalisé', () => {
  const src = source('app', 'admin', 'comptes-exploitation', 'page.tsx')
  // Prix, mise en vente, retrait, suppression (dont le refus 409 et son
  // action « Retirer de la vente »), modification réussie : jamais le
  // bandeau du haut de page, hors de l'écran.
  for (const name of ['patch', 'remove', 'saveEdit']) {
    const body = bodyOf(src, name)
    assert.ok(!body.includes('setMessage('), `${name} écrit encore dans le bandeau`)
    assert.ok(body.includes('noteOn('), `${name} sans retour sous la ligne`)
  }
  assert.match(bodyOf(src, 'remove'), /label: 'Retirer de la vente'/)
  // Suppression réussie : message posé après le rechargement (monté une fois).
  const remove = bodyOf(src, 'remove')
  assert.ok(remove.indexOf('await reload()') < remove.indexOf('est supprimé'))
  // Le message est focalisable, amené à l'écran, et reste visible quand le
  // tableau défile horizontalement (mobile).
  assert.match(src, /rowNoteRef\.current\?\.scrollIntoView\(\{ block: 'nearest'/)
  assert.match(src, /rowNoteRef\.current\?\.focus\(\{ preventScroll: true \}\)/)
  assert.match(src, /tabIndex=\{-1\}\s+role=\{note\.ok \? 'status' : 'alert'\}/)
  assert.match(src, /sticky left-0[^"`]*max-w-\[100cqw\]/)
  assert.match(src, /@container overflow-x-auto/)
  // Fenêtre de modification fermée : le focus va au message, pas au bouton.
  assert.match(src, /onCloseAutoFocus=\{\(e\) => \{/)
  // « Voir dans la boutique » : par id.
  assert.match(src, /href=\{marketplaceFicheHref\(created\)\}/)
})

test('A13 : fenêtre faîtière — bouton actif, raisons sans double point, localités relues', () => {
  const src = source('app', 'dashboard', 'marketplace', 'page.tsx')
  // Bouton grisé seulement pendant l'envoi.
  assert.match(src, /onClick=\{handleSave\}\s+disabled=\{saving\}/)
  // Messages sous les champs ; plus de toast muet inatteignable.
  assert.ok(!src.includes('Titre et culture sont obligatoires'))
  for (const id of ['dash-title', 'dash-culture', 'dash-files'])
    assert.ok(src.includes(`id="${id}"`) && src.includes(`id="${id}-err"`), id)
  // Astérisque des fichiers seulement pour une mise en vente.
  assert.match(
    src,
    /Fichiers \{form\.publish \? <span className="text-destructive">\*<\/span> : null\}/,
  )
  // « …réessayez. Rien n’a été mis en ligne. » et non « réessayez.. ».
  assert.ok(src.includes('fail(`${reasonOf(e)}.${tail}`)'))
  assert.ok(!src.includes('(e as Error).message}.'))
  // Listes de localités en échec : relues à l'ouverture, bouton Réessayer.
  const openAdd = src.slice(src.indexOf('const openAdd = () => {'))
  assert.ok(openAdd.indexOf('retryLocations()') < openAdd.indexOf('setShowAdd(true)'))
  assert.match(src, /onClick=\{retryLocations\}/)
})

test('A14 : super_admin — la fiche est publiée pour la faîtière choisie (main 40c06ee)', () => {
  const src = source('app', 'dashboard', 'marketplace', 'page.tsx')
  // Faîtière du sélecteur, seulement pour le super_admin et seulement une faîtière.
  assert.match(
    src,
    /user\?\.role === 'super_admin' && currentCooperative\?\.level === 'faitiere'\s*\?\s*currentCooperative/,
  )
  // Envoyée au serveur, qui la recontrôle (POST /api/fiches).
  assert.ok(src.includes('...(ownerFaitiere ? { cooperative_id: ownerFaitiere.id } : {})'))
  // L'administration n'est ouverte que sans faîtière choisie.
  const openAdd = src.slice(src.indexOf('const openAdd = () => {'))
  assert.match(openAdd, /if \(user\?\.role === 'super_admin' && !ownerFaitiere\) \{\s*router\.push/)
})
