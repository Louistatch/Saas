import { type Page, expect, test } from '@playwright/test'

/**
 * HarooLife from a member card (/verify/[card_number] → tile « HarooLife »). The holder who types
 * the PIN given with the card enters the game as a visitor under their own name: the arrival opens
 * by itself with the first name and a username already filled in. Without the PIN, the game opens
 * as for anyone, without the holder's name.
 *
 * Signed out (plain @playwright/test, not the game account of lome-test.ts). The PIN check itself
 * and the identity route are covered with the real card session in tests/haroolife-card-entry.test.ts;
 * here the PIN answer is simulated, the screens and the game entry are real.
 */
const CARD = 'FH-1001'

async function openHarooLifeTile(page: Page, shot?: (name: string) => Promise<unknown>) {
  await page.goto(`/verify/${CARD}`, { waitUntil: 'domcontentloaded' })
  const tile = page.getByRole('button', { name: 'HarooLife', exact: true })
  await tile.scrollIntoViewIfNeeded()
  await shot?.('0-tuile')
  await tile.click()
  await expect(page.getByTestId('haroolife-card')).toBeVisible()
}

test('the holder types the card PIN and enters HarooLife under their name', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  // The card session the PIN opens (an HttpOnly cookie in production), simulated.
  let pinAccepted = false
  await page.route('**/api/auth/card/pin', (route) =>
    route.fulfill({ json: { ok: true, expires_at: new Date(Date.now() + 8 * 3600e3) } }),
  )
  await page.route(`**/api/verify/${CARD}/private-access`, async (route) => {
    if (pinAccepted) await route.fulfill({ json: { allowed: true, via: 'card' } })
    else await route.fulfill({ status: 401, json: { error: 'Connectez-vous' } })
  })
  await page.route(`**/api/verify/${CARD}/haroolife`, (route) =>
    pinAccepted
      ? route.fulfill({ json: { first_name: 'Kodjo', village: 'Agou' } })
      : route.fulfill({ status: 401, json: { error: 'Connectez-vous' } }),
  )
  const shot = (name: string) =>
    page.screenshot({
      path: testInfo.outputPath(`card-${name}-${testInfo.project.name}.png`),
      animations: 'disabled',
    })

  await openHarooLifeTile(page, shot)
  const view = page.getByTestId('haroolife-card')
  await expect(view).toContainText('Pour jouer sous ton nom, entre le PIN remis avec ta carte.')
  await expect(page.getByRole('link', { name: 'Jouer en visiteur, sans mon nom' })).toHaveAttribute(
    'href',
    '/haroolife',
  )
  await shot('1-pin')

  pinAccepted = true
  await page.getByLabel('PIN de la carte').fill('123456')
  const play = page.getByRole('link', { name: 'Jouer sous mon nom' })
  await expect(play).toHaveAttribute('href', `/haroolife?carte=${CARD}`)
  await expect(view).toContainText('Kodjo')
  await shot('2-jouer')

  await play.click()
  // Straight to the arrival, the name and a username to start from already there.
  const arrival = page.getByTestId('arrival')
  await expect(arrival).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('arrival-card')).toContainText('Carte vérifiée par ton PIN')
  await expect(page.getByTestId('arrival-card')).toContainText('Agou')
  await expect(page.getByLabel('Ton nom')).toHaveValue('Kodjo')
  await expect(page.getByLabel('Nom d’utilisateur')).toHaveValue('kodjo_agou')
  await shot('3-arrivee')
  expect(errors).toEqual([])
})

test('without the PIN the game opens for a plain visitor, without the holder’s name', async ({
  page,
}) => {
  // The real identity route: no card session here, so it refuses (401).
  const identity = page.waitForResponse((r) => r.url().includes(`/api/verify/${CARD}/haroolife`))
  await page.goto(`/haroolife?carte=${CARD}`, { waitUntil: 'domcontentloaded' })
  expect((await identity).status()).toBe(401)
  await expect(page.getByRole('button', { name: 'Jouer en visiteur' })).toBeVisible()
  await expect(page.getByTestId('arrival')).toHaveCount(0)
  await page.getByRole('button', { name: 'Jouer en visiteur' }).click()
  await expect(page.getByLabel('Ton nom')).toHaveValue('')
  await expect(page.getByTestId('arrival-card')).toHaveCount(0)
})
