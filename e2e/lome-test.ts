import { test as base } from '@playwright/test'
import { gameAccount } from './fixtures/game-account'

/**
 * Shared Playwright `test` for the Lomé suite. With PW_CPU_THROTTLE=<n> every page runs
 * with Chromium's CPU throttling (n× slower), which reproduces the GitHub runner locally:
 * the suite must stay green there without any timeout being raised.
 */
export const test = base.extend<{
  cpuThrottle: void
  returningPlayer: void
}>({
  // Every scenario plays as someone who already chose a look: the new-game appearance sheet
  // (opened on a device with no choice yet) is covered by lome-avatar.spec.ts, which clears it.
  returningPlayer: [
    async ({ page, context }, use) => {
      await gameAccount(context)
      await page.addInitScript(() => {
        try {
          localStorage.setItem('haroolife.avatar.chosen', '1')
        } catch {
          /* blocked storage */
        }
      })
      await use()
    },
    { auto: true },
  ],
  cpuThrottle: [
    async ({ page }, use) => {
      const rate = Number(process.env.PW_CPU_THROTTLE ?? 0)
      if (rate > 1) {
        const cdp = await page.context().newCDPSession(page)
        await cdp.send('Emulation.setCPUThrottlingRate', { rate })
      }
      await use()
    },
    { auto: true },
  ],
})
export { expect } from '@playwright/test'

/**
 * Opens the list of places and towns (sheet « Explorer … »). Since V3 the « Carte » tab first
 * shows the aerial map view; its « Lieux et villes » button opens the list. Inside a building
 * the tab opens the list directly. Does nothing when the list is already open.
 */
export async function openPlaces(page: import('@playwright/test').Page) {
  const sheet = page.getByRole('dialog', { name: /^Explorer/ })
  if (await sheet.isVisible().catch(() => false)) return
  const list = page.getByRole('button', { name: 'Lieux et villes' })
  if (!(await list.isVisible().catch(() => false))) {
    await page
      .getByRole('navigation', { name: 'Navigation du jeu' })
      .getByRole('button', { name: 'Carte' })
      .click()
    if (await sheet.isVisible().catch(() => false)) return
  }
  await list.click()
  await sheet.waitFor()
}

/**
 * « Jouer en visiteur » through the arrival steps: name and a username (new for each run: the
 * local visitor is one account, and changing its name frees the old one), look, two traits, the
 * birth lottery and the first home, then « Emménager ». Returns what the steps showed.
 */
export async function arriveAsVisitor(
  page: import('@playwright/test').Page,
  shots?: (step: string) => Promise<unknown>,
) {
  const { expect } = await import('@playwright/test')
  const username = `yao_${Date.now().toString(36).slice(-6)}`
  await page.getByRole('button', { name: 'Jouer en visiteur' }).click()
  const arrival = page.getByTestId('arrival')
  await expect(arrival).toBeVisible()
  await page.getByLabel('Ton nom').fill('Yao Test')
  await page.getByLabel('Nom d’utilisateur').fill(username)
  await expect(arrival).toContainText(`@${username} est libre.`)
  await shots?.('1-toi')
  const go = page.getByRole('button', { name: /^(Continuer|Choisir où habiter|Emménager)$/ })
  await go.click()
  await expect(arrival).toHaveAttribute('data-step', '1')
  await shots?.('2-apparence')
  await go.click()
  await expect(page.getByRole('button', { name: 'Choisis encore 2' })).toBeDisabled()
  await page.getByRole('button', { name: /Gourmand·e/ }).click()
  await page.getByRole('button', { name: /Grand·e bavard·e/ }).click()
  await shots?.('3-personnalite')
  await go.click()
  const lottery = page.getByTestId('birth-lottery')
  await expect(lottery).toHaveAttribute('data-origin', /.+/)
  const origin = (await lottery.getAttribute('data-origin')) ?? ''
  await shots?.('4-loterie')
  await page.getByRole('button', { name: 'Choisir où habiter' }).click()
  const chosen = page.locator('[aria-pressed="true"]').filter({ hasText: 'Tu démarres avec' })
  await expect(chosen).toHaveCount(1)
  const start = Number(
    ((await chosen.textContent()) ?? '')
      .match(/Tu démarres avec ([\d\s\u202f\u00a0]+) FCFA/)?.[1]
      ?.replace(/\D/g, ''),
  )
  await shots?.('5-logement')
  await page.getByRole('button', { name: 'Emménager' }).click()
  return { origin, start, username }
}
