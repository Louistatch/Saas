import type { Page } from '@playwright/test'
import { expect, test } from './lome-test'

const id = '00000000-0000-4000-8000-000000000001'
const uuid = '00000000-0000-4000-8000-000000000002'
const catalogue = ['faitiere', 'operator', 'platform'].map((owner_kind, i) => ({
  id: i === 0 ? id : uuid,
  title: `Compte maïs ${owner_kind}`,
  culture: 'mais',
  owner_kind,
  owner_name: ['FENOMAT', 'Opérateur local', 'FaîtièreHub'][i],
  version_id: uuid,
  price: 1500,
}))
async function mockCatalogue(page: Page) {
  await page.route('**/api/ce-it/catalogue**', (r) =>
    r.fulfill({ json: { items: catalogue, payment_available: false } }),
  )
}
test('public catalogue offers only filters and acquisition; card/PIN is restricted to faitiere products', async ({
  page,
}, info) => {
  await mockCatalogue(page)
  await page.goto('/ce-it')
  await expect(page.getByRole('heading', { name: 'Préparer sa campagne agricole' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Vérifier ma carte et mon PIN' })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Achat payant bientôt disponible' })).toHaveCount(3)
  await expect(page.getByRole('form', { name: 'Nouvelle version CE IT' })).toHaveCount(0)
  await expect(
    page.getByText('Une carte agricole ne donne pas de gratuité sur cet ensemble.'),
  ).toHaveCount(2)
  await page.getByLabel('Culture', { exact: true }).fill('mais')
  await page.getByRole('combobox', { name: 'Propriétaire', exact: true }).selectOption('faitiere')
  const filtered = page.waitForRequest(
    (r) =>
      r.url().includes('/api/ce-it/catalogue?') &&
      r.url().includes('owner=faitiere') &&
      r.url().includes('culture=mais'),
  )
  await page.getByRole('button', { name: 'Filtrer', exact: true }).click()
  await filtered
  await page.screenshot({ path: info.outputPath('catalogue.png'), fullPage: true })
})
test('PIN rejection grants nothing; valid access offers both files and a mission requiring consent', async ({
  page,
}) => {
  await mockCatalogue(page)
  let proposed = false
  await page.route('**/api/ce-it/access', async (r) => {
    const body = r.request().postDataJSON()
    if (body.action === 'card')
      return r.fulfill(
        body.pin === '654321'
          ? {
              json: {
                grant_id: id,
                token: 'a'.repeat(64),
                candidates: [{ agronome_id: uuid, name: 'Afi K.', location_rank: 0 }],
              },
            }
          : { status: 403, json: { error: 'Carte ou PIN non reconnu' } },
      )
    if (body.action === 'download')
      return r.fulfill({
        json: {
          files: [
            { kind: 'ce', url: 'https://files.example.test/ce.pdf' },
            { kind: 'it', url: 'https://files.example.test/it.pdf' },
          ],
        },
      })
    if (body.action === 'propose') {
      expect(body.acknowledged).toBe(true)
      expect(body.scope.length).toBeGreaterThanOrEqual(20)
      proposed = true
      return r.fulfill({ json: { mission_id: uuid, status: 'proposed' } })
    }
    return r.fulfill({ status: 400, json: { error: 'Action inconnue' } })
  })
  await page.goto('/ce-it')
  await page.getByRole('button', { name: 'Vérifier ma carte et mon PIN' }).click()
  await page.getByLabel('Numéro de carte').fill('COO-12345')
  await page.getByLabel('PIN secret').fill('111111')
  await page.getByRole('button', { name: 'Vérifier et obtenir les documents' }).click()
  await expect(page.getByText('Carte ou PIN non reconnu', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Télécharger le compte d’exploitation' }),
  ).toHaveCount(0)
  await page.getByLabel('PIN secret').fill('654321')
  await page.getByRole('button', { name: 'Vérifier et obtenir les documents' }).click()
  await expect(
    page.getByRole('link', { name: 'Télécharger le compte d’exploitation' }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Télécharger l’itinéraire technique' })).toBeVisible()
  await page
    .getByLabel('Besoin et périmètre')
    .fill('Évaluer la fertilité pour une parcelle de maïs et convenir des modalités.')
  await page.getByRole('checkbox', { name: /Je comprends que 1 500 FCFA/ }).check()
  await page.getByRole('button', { name: 'Proposer la mission' }).click()
  await expect.poll(() => proposed).toBe(true)
  await expect(page.getByText(/Son acceptation reste nécessaire/)).toBeVisible()
})
test('studio creates private CE/IT from structured fields; review and publication remain distinct actions', async ({
  page,
}, info) => {
  let created = false
  let uploaded = false
  let stage = 'draft'
  let payload: unknown
  await page.route('**/api/ce-it/studio', async (r) => {
    if (r.request().method() === 'POST') {
      const c = r.request().postDataJSON()
      if (c.action === 'create') {
        expect(c.data.owner_kind).toBe('platform')
        expect(c.data.price).toBeUndefined()
        created = true
        return r.fulfill({ json: { ok: true, result: id } })
      }
      if (c.action === 'transition') {
        stage = { submit: 'submitted', approve: 'approved', publish: 'published' }[
          c.data.action as 'submit' | 'approve' | 'publish'
        ]
        return r.fulfill({ json: { ok: true } })
      }
    }
    return r.fulfill({
      json: {
        admin: true,
        workspace: {
          owners: [{ kind: 'platform', id: null, name: 'FaîtièreHub' }],
          experts: [],
          reviewer: true,
          agronome: false,
        },
        missions: [],
        products: created
          ? [
              {
                id,
                title: 'Compte maïs validé',
                culture: 'mais',
                owner_kind: 'platform',
                ceit_versions: uploaded
                  ? [{ id: uuid, number: 1, state: stage, payload, ceit_reviews: [] }]
                  : [],
              },
            ]
          : [],
      },
    })
  })
  await page.route('**/api/ce-it/versions', async (r) => {
    const multipart = r.request().postDataBuffer()?.toString() ?? ''
    const data = multipart.match(/name="data"\r\n\r\n([\s\S]*?)\r\n--/)
    expect(data).toBeTruthy()
    payload = JSON.parse(data?.[1] ?? '{}')
    expect((payload as { areaHa: number }).areaHa).toBe(1)
    uploaded = true
    return r.fulfill({ json: { version_id: uuid, state: 'draft' } })
  })
  await page.goto('/ce-it/studio')
  const create = page.getByRole('form', { name: 'Créer un ensemble CE IT' })
  await create.getByLabel('Titre', { exact: true }).fill('Compte maïs validé')
  await create.getByLabel('Culture (identifiant)').fill('mais')
  await create.getByLabel('Compétences requises (séparées par virgules)').fill('fertilisation')
  await create.getByRole('button', { name: 'Créer le dossier' }).click()
  const form = page.getByRole('form', { name: 'Nouvelle version CE IT' })
  await form
    .getByLabel('Contexte agronomique et limites')
    .fill('Contexte de test uniquement, à valider avant tout conseil agronomique.')
  await form.getByLabel('Rendement (t/ha)').fill('3')
  await form.getByLabel('Prix de vente (FCFA/kg)').fill('200')
  await form.getByLabel('Pertes (%)').fill('10')
  await form.getByLabel('Charge 1', { exact: true }).fill('Semences')
  await form.getByLabel('Quantité', { exact: true }).fill('20')
  await form.getByLabel('Prix unitaire (FCFA)').fill('1000')
  await form.getByLabel('Opération 1').fill('Semis')
  await form.getByLabel('Début (jour)').fill('0')
  await form.getByLabel('Fin (jour)').fill('2')
  await form
    .getByLabel('Instructions', { exact: true })
    .fill('Vérifier les recommandations locales avant le semis et documenter les conditions.')
  await form
    .getByLabel('Précautions', { exact: true })
    .fill('Adapter au contexte agronomique validé.')
  await form.getByLabel('Source 1', { exact: true }).fill('Référence de test')
  await form.getByLabel('Adresse HTTPS').fill('https://example.org/reference')
  await form.getByLabel('Date de vérification').fill('2026-10-21')
  await form
    .getByLabel('Référence précise et justification des droits')
    .fill('Données de test technique, non destinées à la production.')
  await form.getByRole('button', { name: 'Enregistrer une version privée' }).click()
  await expect(page.getByText('Version 1 · Brouillon')).toBeVisible()
  await page.getByRole('button', { name: 'Soumettre à la revue' }).click()
  await page
    .getByLabel('Avis scientifique indépendant')
    .fill('Références et données vérifiées indépendamment pour ce test technique.')
  await page.getByRole('combobox', { name: 'Décision', exact: true }).selectOption('approve')
  await page.getByRole('button', { name: 'Enregistrer la revue' }).click()
  await expect(page.getByText('Version 1 · Approuvé · à publier')).toBeVisible()
  await page.getByRole('button', { name: 'Publier cette version approuvée' }).click()
  await expect(page.getByText('Version 1 · Publié')).toBeVisible()
  await page.screenshot({ path: info.outputPath('studio.png'), fullPage: true })
})
