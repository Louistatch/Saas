import { devices } from '@playwright/test'
import { arriveAsVisitor, expect, test } from './lome-test'

/**
 * A newcomer arrives as a visitor, step by step (as in Lagos Life, the Togolese way): name and a
 * unique username checked live, look, two traits, the birth lottery, the first home; then the
 * game opens with that family's money minus the agency month, the traits and the home kept.
 */
test('a visitor arrives step by step, with a username, and starts the life they chose', async ({
  browser,
}, testInfo) => {
  test.setTimeout(150_000)
  // Signed out (no game account): a fresh phone or computer.
  const device = /mobile/.test(testInfo.project.name)
    ? { ...devices['Pixel 7'], viewport: { width: 412, height: 915 } }
    : { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }
  const context = await browser.newContext({ ...device, baseURL: 'http://127.0.0.1:3000' })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })

  // A name the team keeps, and one too short, are refused before anything is created.
  await page.getByRole('button', { name: 'Jouer en visiteur' }).click()
  await page.getByLabel('Nom d’utilisateur').fill('admin')
  await expect(page.getByTestId('arrival')).toContainText('réservé à l’équipe')
  await page.getByLabel('Nom d’utilisateur').fill('ko')
  await expect(page.getByTestId('arrival')).toContainText('Au moins 3 caractères.')
  await expect(page.getByRole('button', { name: 'Continuer' })).toBeDisabled()
  // Under 18: HarooLife is closed, even with a free name and the box ticked.
  await page.getByLabel('Ton nom').fill('Petit Kodjo')
  await page.getByLabel('Nom d’utilisateur').fill(`kid_${Date.now().toString(36).slice(-6)}`)
  await expect(page.getByTestId('arrival')).toContainText('est libre.')
  const year = new Date().getFullYear() - 12
  await page.getByLabel('Jour').selectOption('1')
  await page.getByLabel('Mois').selectOption('1')
  await page.getByLabel('Année').selectOption(String(year))
  await page.getByRole('checkbox', { name: /18 ans ou plus/ }).check()
  await expect(page.getByTestId('arrival')).toContainText('réservé aux personnes de 18 ans et plus')
  await expect(page.getByRole('button', { name: 'Continuer' })).toBeDisabled()
  // The terms and the privacy policy open in their own tab.
  await expect(page.getByRole('link', { name: 'Conditions d’utilisation' })).toHaveAttribute(
    'href',
    '/legal/conditions',
  )
  await page.screenshot({
    path: testInfo.outputPath(`arrival-0-mineur-${testInfo.project.name}.png`),
  })
  await page.getByRole('button', { name: 'Revenir à l’accueil' }).click()

  const shot = (step: string) =>
    page.screenshot({ path: testInfo.outputPath(`arrival-${step}-${testInfo.project.name}.png`) })
  const { origin, start, username } = await arriveAsVisitor(page, shot)
  expect(origin).toMatch(/^[a-z-]+$/)
  expect(Number.isFinite(start)).toBe(true)

  // In the game: the family's money minus the agency month, the traits, the chosen home.
  await expect(page.locator('canvas:visible').first()).toBeVisible({ timeout: 30000 })
  const save = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem('haroolife.lome-city.v1') ?? 'null'))
  await expect.poll(async () => (await save())?.origin).toBe(origin)
  const s = await save()
  expect(s.life.traits).toEqual(['gourmand', 'bavard'])
  expect(s.life.wallet).toBe(start)
  expect(s.housing.quartier).toMatch(/^(adidogome|be|tokoin|agoe)$/)
  // The username is the visitor's name in the game (the relay reads it at connection).
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as unknown as { __LOME_REALTIME?: { me: string | null } }).__LOME_REALTIME?.me,
        ),
      { timeout: 30000 },
    )
    .toBe(username)
  await page.screenshot({ path: testInfo.outputPath(`arrival-6-jeu-${testInfo.project.name}.png`) })
  expect(errors).toEqual([])
  await context.close()
})
