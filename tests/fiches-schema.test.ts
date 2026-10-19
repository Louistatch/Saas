/**
 * B9 — Schéma partagé d'un compte d'exploitation (lib/fiches/schema.ts) et
 * culture comparée sans accent ni casse (lib/fiches/culture.ts).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { matchCulture, normalizeCulture, resolveCulture } from '../lib/fiches/culture'
import {
  PUBLISH_NEEDS_FILE,
  createFicheSchema,
  fieldErrors,
  patchFicheSchema,
} from '../lib/fiches/schema'

const file = { name: 'compte.xlsx', url: 'plateforme/1-a.xlsx', type: 'xlsx' }
const valid = {
  title: 'Maïs pluvial',
  culture: 'Mais',
  type_agriculture: 'conventionnel',
  files: [file],
  price_non_member: 1000,
}

const errorsOf = (schema: typeof createFicheSchema | typeof patchFicheSchema, input: unknown) => {
  const r = schema.safeParse(input)
  return r.success ? {} : fieldErrors(r.error)
}

test('limites : titre, campagne, description, prix — messages en français par champ', () => {
  assert.ok(createFicheSchema.safeParse(valid).success)
  assert.match(
    errorsOf(createFicheSchema, { ...valid, title: 'ab' }).title?.[0] ?? '',
    /au moins 3 caractères/,
  )
  assert.match(
    errorsOf(createFicheSchema, { ...valid, title: 'x'.repeat(201) }).title?.[0] ?? '',
    /200 caractères/,
  )
  assert.match(
    errorsOf(createFicheSchema, { ...valid, campaign: 'x'.repeat(51) }).campaign?.[0] ?? '',
    /50 caractères/,
  )
  assert.match(
    errorsOf(createFicheSchema, { ...valid, description: 'x'.repeat(2001) }).description?.[0] ?? '',
    /2000 caractères/,
  )
  assert.match(
    errorsOf(createFicheSchema, { ...valid, price_non_member: 1_000_001 }).price_non_member?.[0] ??
      '',
    /1 000 000 FCFA/,
  )
  assert.match(
    errorsOf(createFicheSchema, { ...valid, price_non_member: -1 }).price_non_member?.[0] ?? '',
    /négatif/,
  )
  assert.match(
    errorsOf(createFicheSchema, { ...valid, price_non_member: 10.5 }).price_non_member?.[0] ?? '',
    /entier/,
  )
  // Les mêmes limites valent en PATCH.
  assert.match(
    errorsOf(patchFicheSchema, { title: 'ab' }).title?.[0] ?? '',
    /au moins 3 caractères/,
  )
  assert.match(
    errorsOf(patchFicheSchema, { campaign: 'x'.repeat(51) }).campaign?.[0] ?? '',
    /50 caractères/,
  )
})

test('brouillon sans fichier accepté ; publication sans fichier refusée (POST et PATCH)', () => {
  const draft = createFicheSchema.safeParse({ ...valid, files: undefined, status: 'draft' })
  assert.ok(draft.success)
  assert.deepEqual(draft.success && draft.data.files, [])
  assert.deepEqual(
    errorsOf(createFicheSchema, { ...valid, files: [], status: 'published' }).files,
    [PUBLISH_NEEDS_FILE],
  )
  // Statut absent = publié par défaut : sans fichier, refusé aussi.
  assert.deepEqual(errorsOf(createFicheSchema, { ...valid, files: [] }).files, [PUBLISH_NEEDS_FILE])
  assert.deepEqual(errorsOf(patchFicheSchema, { status: 'published', files: [] }).files, [
    PUBLISH_NEEDS_FILE,
  ])
  assert.ok(patchFicheSchema.safeParse({ status: 'draft', files: [] }).success)
})

test('PATCH accepte files et confirm_free (zod ne les retire plus)', () => {
  const r = patchFicheSchema.safeParse({ files: [file], confirm_free: true, price_non_member: 0 })
  assert.ok(r.success)
  assert.deepEqual(r.success && r.data.files?.[0]?.url, file.url)
  assert.equal(r.success && r.data.confirm_free, true)
})

test('culture : comparaison sans accent ni casse, enregistrée sous le nom du référentiel', async () => {
  assert.equal(normalizeCulture('  MAÏS '), 'mais')
  assert.equal(matchCulture('Maïs', ['Mais', 'Manioc']), 'Mais')
  assert.equal(matchCulture('manioc', ['Mais', 'Manioc']), 'Manioc')
  assert.equal(matchCulture('Sorgho', ['Mais', 'Manioc']), null)

  const reader = (names: string[] | null) => ({
    from: () => ({
      select: async () =>
        names
          ? { data: names.map((name) => ({ name })), error: null }
          : { data: null, error: { message: 'down' } },
    }),
  })
  assert.deepEqual(await resolveCulture(reader(['Mais']), 'Maïs'), {
    ok: true,
    name: 'Mais',
    checked: true,
  })
  const unknown = await resolveCulture(reader(['Mais']), 'Sorgho')
  assert.equal(unknown.ok, false)
  // Référentiel illisible : la saisie est gardée (pas de blocage sur panne).
  assert.deepEqual(await resolveCulture(reader(null), 'Sorgho'), {
    ok: true,
    name: 'Sorgho',
    checked: false,
  })
})
