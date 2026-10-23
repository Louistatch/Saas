import fs from 'node:fs'
import path from 'node:path'
import { type Page, type Route, expect, test } from '@playwright/test'

// Marché de proximité et travail agricole, contre le mock Supabase et un `next start` sur
// 127.0.0.1:3000 (même montage que les consoles PAYG). Les règles (qui répond, qui retient, quand
// les numéros s'échangent) sont prouvées sur les vraies fonctions SQL par
// tests/market-work-sql.test.mjs ; ici on vérifie les écrans et les appels qu'ils font.

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '11111111-1111-4111-8111-111111111111'
/** Les annonces du mock Supabase (e2e/fixtures/mock-supabase.mjs). */
const SOJA = '00000000-0000-4000-8000-00000000a001'
const MINE = '00000000-0000-4000-8000-00000000a003'
const tok = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: 4102444800 })}.c2ln`
const session = {
  access_token: tok,
  refresh_token: 'r0',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: UID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'admin@test.local',
    app_metadata: { role: 'super_admin' },
    user_metadata: {},
  },
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

const shot = async (page: Page, name: string, project: string) => {
  const dir = path.join('test-results', 'market-work')
  fs.mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: path.join(dir, `${project}-${name}.png`), fullPage: true })
}

const person = (name: string, kind: string, extra = {}) => ({
  name,
  kind,
  skills: [],
  note: null,
  reviews: 0,
  place: null,
  ...extra,
})

const announcement = (id: string, type: string, title: string, extra = {}) => ({
  id,
  type,
  title,
  status: 'active',
  open: true,
  created_at: '2026-10-20T08:00:00Z',
  expires_at: null,
  culture: null,
  quantity_kg: null,
  price_per_kg_fcfa: null,
  wage_per_day_fcfa: null,
  positions: null,
  starts_on: null,
  work_days: null,
  has_contact: true,
  place: 'Kpalimé, Kloto',
  ...extra,
})

/**
 * Les fonctions market_* jouées dans le navigateur : un petit état, assez pour suivre une
 * réponse de bout en bout (envoyée → retenue → numéro), une invitation, et le compteur.
 */
function stubMarket(page: Page) {
  const calls: { fn: string; args: Record<string, unknown> }[] = []
  const state = {
    amaStatus: 'envoyee' as string,
    sent: [] as Record<string, unknown>[],
    invited: false,
  }
  const activity = () => ({
    announcements: [
      {
        ...announcement(MINE, 'autre', 'Annonce 3'),
        hired: state.amaStatus === 'retenue' ? 1 : 0,
        responses: [
          {
            id: 'r-ama',
            status: state.amaStatus,
            origin: 'reponse',
            message: 'Je viens samedi avec mon tricycle.',
            quantity_kg: 500,
            created_at: '2026-10-22T08:00:00Z',
            decided_at: null,
            unseen: true,
            person: person('Ama K.', 'acheteur', { place: 'Kpalimé' }),
            phone: state.amaStatus === 'retenue' ? '+22890112233' : null,
          },
        ],
      },
      {
        ...announcement('j9', 'job', 'Récolte du maïs, 2 ha', {
          wage_per_day_fcfa: 2500,
          positions: 2,
          starts_on: '2026-11-03',
          work_days: 2,
        }),
        hired: 0,
        responses: state.invited
          ? [
              {
                id: 'r-komla',
                status: 'invitee',
                origin: 'invitation',
                message: null,
                quantity_kg: null,
                created_at: '2026-10-23T08:00:00Z',
                decided_at: null,
                unseen: false,
                person: person('Komla A.', 'ouvrier', { skills: ['récolte'] }),
                phone: null,
              },
            ]
          : [],
      },
    ],
    sent: state.sent,
    unread: state.amaStatus === 'envoyee' ? 1 : 0,
  })

  return page
    .route('**/rest/v1/rpc/market_*', async (route) => {
      const fn = new URL(route.request().url()).pathname.split('/').pop() ?? ''
      const args = (route.request().postDataJSON() ?? {}) as Record<string, unknown>
      calls.push({ fn, args })
      if (fn === 'market_activity') return json(route, activity())
      if (fn === 'market_unread') return json(route, activity().unread)
      if (fn === 'market_seen') return json(route, activity().unread)
      if (fn === 'market_respond') {
        const sent = {
          id: 'r-me',
          status: 'envoyee',
          origin: 'reponse',
          message: args.p_message,
          quantity_kg: args.p_quantity_kg,
          created_at: new Date().toISOString(),
          decided_at: null,
          unseen: false,
          announcement: announcement(
            String(args.p_announcement),
            'prevente',
            'Soja de Kpalimé, 800 kg',
          ),
          author: person('Abalo K.', 'membre'),
          phone: null,
        }
        state.sent.push(sent)
        return json(route, sent)
      }
      if (fn === 'market_decide') {
        state.amaStatus = args.p_accept ? 'retenue' : 'declinee'
        return json(route, activity().announcements[0].responses[0])
      }
      if (fn === 'market_workers') {
        return json(route, [
          {
            ref: 'w-komla',
            name: 'Komla A.',
            skills: ['désherbage', 'labour', 'récolte'],
            note: 4.5,
            reviews: 12,
            cantons: ['Kpalimé'],
            proximity: 0,
          },
          {
            ref: 'w-essi',
            name: 'Essi K.',
            skills: ['récolte'],
            note: null,
            reviews: 0,
            cantons: ['Lama-Kara'],
            proximity: 3,
          },
        ])
      }
      if (fn === 'market_invite') {
        state.invited = true
        return json(route, activity().announcements[1].responses[0])
      }
      return json(route, { message: `inattendu : ${fn}` }, 400)
    })
    .then(() => calls)
}

test.describe('visiteur sans compte', () => {
  test('accueil, travail et marché : les offres se lisent, le numéro se demande', async ({
    page,
  }, info) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))

    await page.goto('/')
    const band = page.getByRole('region', { name: /Vendre, acheter, embaucher, travailler/ })
    await expect(band).toBeVisible()
    for (const name of [
      'Vendre ma récolte',
      'Acheter près de chez moi',
      'Trouver des ouvriers',
      'Trouver du travail',
    ])
      await expect(band.getByRole('link', { name: new RegExp(name) })).toBeVisible()
    await shot(page, 'accueil', info.project.name)

    // La liste ne transporte jamais de numéro.
    const listed = page.waitForResponse((r) => r.url().includes('/api/market/announcements?'))
    await band.getByRole('link', { name: /Trouver du travail/ }).click()
    await expect(page).toHaveURL(/\/travail/)
    const body = await (await listed).text()
    expect(body).not.toMatch(/90 11 22 33|\+228/)
    await expect(
      page.getByRole('heading', { level: 1, name: 'Travail agricole à la journée au Togo' }),
    ).toBeVisible()

    const job = page.getByRole('article').filter({ hasText: 'Annonce 2' })
    await expect(job).toContainText('2 500')
    await expect(job).toContainText('FCFA / jour')
    await expect(job).toContainText('3 ouvriers recherchés')
    await expect(job).toContainText('5 000 FCFA au total chacun')
    await expect(job).toContainText('2 jours')
    await expect(page.getByRole('article').filter({ hasText: 'Soja de Kpalimé' })).toHaveCount(0)
    await shot(page, 'travail-offres', info.project.name)

    await job.getByRole('button', { name: 'Afficher le numéro' }).click()
    await expect(job.getByRole('link', { name: /\+228 90 11 22 33/ })).toHaveAttribute(
      'href',
      'tel:+22890112233',
    )
    await expect(job.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
      'href',
      /wa\.me\/22890112233/,
    )

    // Répondre demande un compte ; les ouvriers ne se montrent qu'aux comptes connectés.
    await job.getByRole('button', { name: 'Je suis disponible' }).click()
    await expect(page.getByRole('dialog')).toContainText('Connectez-vous pour répondre')
    await page.keyboard.press('Escape')
    await page.getByRole('tab', { name: 'Ouvriers disponibles' }).click()
    await expect(page.getByText('Connectez-vous pour voir les ouvriers')).toBeVisible()
    await expect(page).toHaveURL(/vue=ouvriers/)

    await page.goto('/marche')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Marché agricole de proximité au Togo' }),
    ).toBeVisible()
    const soja = page.getByRole('article').filter({ hasText: 'Soja de Kpalimé' })
    await expect(soja).toContainText('450')
    await expect(soja).toContainText('FCFA / kg')
    await expect(soja).toContainText(/800\skg · 8\ssacs/)
    await page.getByRole('button', { name: 'Récoltes', exact: true }).click()
    await expect(page).toHaveURL(/type=prevente/)
    await expect(page.getByRole('article')).toHaveCount(1)
    await shot(page, 'marche', info.project.name)

    // Publier sans compte : on explique, on n'envoie pas vers un écran qui refuserait.
    await page.goto('/marche/publier?type=job')
    await expect(page.getByText('Un compte gratuit pour publier')).toBeVisible()

    expect(errors).toEqual([])
  })
})

test.describe('compte connecté', () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      {
        name: 'sb-127-auth-token',
        value: `base64-${b64(session)}`,
        domain: '127.0.0.1',
        path: '/',
      },
    ])
  })

  test('répondre, retenir, inviter, publier une offre de travail', async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    const calls = await stubMarket(page)

    // Répondre à une récolte : 10 sacs = 1 000 kg, et le numéro de rappel.
    await page.goto('/marche')
    const soja = page.getByRole('article').filter({ hasText: 'Soja de Kpalimé' })
    await soja.getByRole('button', { name: 'Je suis intéressé' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Votre message (facultatif)').fill('Je passe samedi.')
    await dialog.getByLabel('Quantité voulue').fill('10')
    await dialog.getByLabel('Numéro pour vous rappeler').fill('90 11 22 33')
    await dialog.getByRole('button', { name: 'Envoyer ma réponse' }).click()
    await expect(dialog).toContainText('Réponse envoyée')
    const respond = calls.find((c) => c.fn === 'market_respond')
    expect(respond?.args).toEqual({
      p_announcement: SOJA,
      p_message: 'Je passe samedi.',
      p_quantity_kg: 1000,
      p_phone: '90 11 22 33',
    })
    await dialog.getByRole('button', { name: 'Fermer' }).click()
    await expect(soja).toContainText('Réponse envoyée : en attente de l’auteur')
    // Sa propre annonce : pas de bouton de réponse.
    await expect(page.getByRole('article').filter({ hasText: 'Annonce 3' })).toContainText(
      'Votre annonce · voir les réponses',
    )

    // Mon suivi : la réponse d'Ama, sans numéro tant qu'elle n'est pas retenue.
    await page.goto('/marche/suivi')
    await expect(page.getByRole('heading', { level: 1, name: 'Mon suivi' })).toBeVisible()
    const mine = page.getByRole('article').filter({ hasText: 'Annonce 3' })
    await expect(mine).toContainText('Ama K.')
    await expect(mine).toContainText('500 kg')
    await expect(mine).not.toContainText('+228')
    await shot(page, 'suivi-avant', info.project.name)
    await mine.getByRole('button', { name: 'Retenir' }).click()
    await expect(mine.getByRole('link', { name: /\+228 90 11 22 33/ })).toHaveAttribute(
      'href',
      'tel:+22890112233',
    )
    await expect(mine).toContainText('Retenu')
    expect(calls.some((c) => c.fn === 'market_seen')).toBe(true)
    await expect(page.getByRole('article').filter({ hasText: 'Soja de Kpalimé' })).toContainText(
      'En attente',
    )
    await shot(page, 'suivi-retenu', info.project.name)

    // Ouvriers disponibles : le plus proche d'abord, invitation sur une offre ouverte.
    await page.goto('/travail?vue=ouvriers')
    const komla = page.getByRole('article').filter({ hasText: 'Komla A.' })
    await expect(komla).toContainText('désherbage')
    await expect(komla).toContainText('Kpalimé')
    await expect(page.getByRole('article').first()).toContainText('Komla A.')
    await shot(page, 'travail-ouvriers', info.project.name)
    await komla.getByRole('button', { name: 'Inviter sur mon offre' }).click()
    const invite = page.getByRole('dialog')
    await expect(invite).toContainText('Récolte du maïs, 2 ha')
    await invite.getByRole('button', { name: 'Envoyer l’invitation' }).click()
    await expect(invite).toContainText('Invitation envoyée')
    expect(calls.find((c) => c.fn === 'market_invite')?.args).toMatchObject({
      p_announcement: 'j9',
      p_worker: 'w-komla',
    })
    await page.keyboard.press('Escape')

    // Publier une offre de travail : le salaire par jour est exigé, la paie se calcule.
    await page.goto('/marche/publier?type=job')
    await expect(page.getByRole('radio', { name: /Je cherche des ouvriers/ })).toBeChecked()
    await page.getByLabel('Le travail à faire').fill('Désherbage du maïs')
    await page.getByRole('button', { name: 'Publier l’offre de travail' }).click()
    await expect(page.getByText('Indiquez le salaire par jour, en FCFA.')).toBeVisible()
    await page.getByLabel('Salaire par jour (FCFA)').fill('2500')
    await page.getByRole('button', { name: 'Un ouvrier de plus' }).click()
    await page.getByLabel('Nombre de jours').fill('2')
    await expect(page.getByText(/Paie prévue : 10\s000 FCFA/)).toBeVisible()
    await shot(page, 'publier-travail', info.project.name)
    const posted = page.waitForRequest(
      (r) => r.url().endsWith('/api/market/announcements') && r.method() === 'POST',
    )
    await page.getByRole('button', { name: 'Publier l’offre de travail' }).click()
    expect((await posted).postDataJSON()).toMatchObject({
      type: 'job',
      title: 'Désherbage du maïs',
      wage_per_day_fcfa: 2500,
      positions: 2,
      work_days: 2,
    })
    await expect(page.getByText('Votre offre de travail est en ligne')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Inviter des ouvriers disponibles' })).toBeVisible()

    expect(errors).toEqual([])
  })
})
