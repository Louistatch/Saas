import { test as base } from '@playwright/test'

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
    async ({ page }, use) => {
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
