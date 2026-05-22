import { test as base, type Page, type BrowserContext } from '@playwright/test'
import path from 'path'
import { ACCOUNTS } from '../helpers/constants'

/**
 * Auth fixtures provide pre-authenticated pages for each role.
 * Uses stored session state from global-setup.
 */

export type AuthFixtures = {
  adminPage: Page
  coopAdminPage: Page
  fenomatPage: Page
  memberPage: Page
  adminContext: BrowserContext
  coopAdminContext: BrowserContext
  fenomatContext: BrowserContext
  memberContext: BrowserContext
}

export const authTest = base.extend<AuthFixtures>({
  adminContext: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: path.resolve(__dirname, '..', ACCOUNTS.superAdmin.storageState),
    })
    await use(context)
    await context.close()
  },

  adminPage: async ({ adminContext }, use) => {
    const page = await adminContext.newPage()
    await use(page)
  },

  coopAdminContext: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: path.resolve(__dirname, '..', ACCOUNTS.coopAdmin.storageState),
    })
    await use(context)
    await context.close()
  },

  coopAdminPage: async ({ coopAdminContext }, use) => {
    const page = await coopAdminContext.newPage()
    await use(page)
  },

  fenomatContext: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: path.resolve(__dirname, '..', ACCOUNTS.fenomatAdmin.storageState),
    })
    await use(context)
    await context.close()
  },

  fenomatPage: async ({ fenomatContext }, use) => {
    const page = await fenomatContext.newPage()
    await use(page)
  },

  memberContext: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: path.resolve(__dirname, '..', ACCOUNTS.member.storageState),
    })
    await use(context)
    await context.close()
  },

  memberPage: async ({ memberContext }, use) => {
    const page = await memberContext.newPage()
    await use(page)
  },
})
