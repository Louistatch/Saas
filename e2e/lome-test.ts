import { test as base } from '@playwright/test'

/**
 * Shared Playwright `test` for the Lomé suite. With PW_CPU_THROTTLE=<n> every page runs
 * with Chromium's CPU throttling (n× slower), which reproduces the GitHub runner locally:
 * the suite must stay green there without any timeout being raised.
 */
export const test = base.extend<{ cpuThrottle: void }>({
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
