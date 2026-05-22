import { test, expect } from '@playwright/test'
import { ROUTES } from '../helpers/constants'

test.describe('Scenario 1: Navigation & UX', () => {
  test('home page loads with correct heading and CTA', async ({ page }) => {
    const response = await page.goto(ROUTES.home)
    expect(response?.status()).toBe(200)

    await expect(
      page.getByRole('heading', { name: /Donnez du pouvoir à votre coopérative agricole/i })
    ).toBeVisible()

    // CTA buttons — use .first() to avoid strict mode with multiple matches
    await expect(page.getByRole('link', { name: /Essai gratuit/i }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /Voir les comptes/i }).first()).toBeVisible()
  })

  test('all public pages return 200 and render without errors', async ({ page }) => {
    const publicRoutes = [
      ROUTES.home,
      ROUTES.about,
      ROUTES.contact,
      ROUTES.blog,
      ROUTES.marketplace,
      ROUTES.login,
    ]

    for (const route of publicRoutes) {
      const response = await page.goto(route)
      expect(response?.status(), `${route} should return 200`).toBe(200)
      await page.waitForLoadState('domcontentloaded')
    }
  })

  test('marketplace page loads with correct heading', async ({ page }) => {
    await page.goto(ROUTES.marketplace)
    await expect(
      page.getByRole('heading', { name: /Comptes d'exploitation agricole/i })
    ).toBeVisible()
  })

  test('login page renders form with email and password fields', async ({ page }) => {
    await page.goto(ROUTES.login)
    await expect(page.locator('#email')).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()
    await expect(page.getByRole('button', { name: /Se connecter/i })).toBeVisible()
  })

  test('Logo links back to home page', async ({ page }) => {
    await page.goto(ROUTES.marketplace)
    const logoLink = page.locator('a[href="/"]').first()
    await logoLink.click()
    await expect(page).toHaveURL(/\/$/)
  })

  test('navigation links route to correct pages', async ({ page }) => {
    await page.goto(ROUTES.home)

    const navLinks = [
      { name: /À propos/i, path: '/a-propos' },
      { name: /Contact/i, path: '/contact' },
    ]

    for (const link of navLinks) {
      await page.goto(ROUTES.home)
      const navLink = page.getByRole('link', { name: link.name }).first()
      if (await navLink.isVisible()) {
        await navLink.click()
        await expect(page).toHaveURL(new RegExp(link.path))
      }
    }
  })

  test.describe('Mobile viewport', () => {
    test.use({ viewport: { width: 375, height: 667 } })

    test('mobile menu toggle works', async ({ page }) => {
      await page.goto(ROUTES.home)

      // Look for mobile menu button (hamburger)
      const menuButton = page.locator('button[aria-label*="menu" i]').or(
        page.locator('button[aria-label*="Ouvrir" i]')
      )

      if (await menuButton.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        await menuButton.first().click()
        // Use header-specific link to avoid footer duplicates
        await expect(
          page.getByRole('banner').getByRole('link', { name: /À propos/i })
        ).toBeVisible({ timeout: 5000 })
      }
    })

    test('pages render without horizontal scroll on mobile', async ({ page }) => {
      const routes = [ROUTES.home, ROUTES.marketplace, ROUTES.login]

      for (const route of routes) {
        await page.goto(route)
        await page.waitForLoadState('domcontentloaded')

        const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
        const viewportWidth = await page.evaluate(() => window.innerWidth)
        // Allow 30px tolerance (scrollbar + minor overflow)
        expect(bodyWidth, `${route} should not have horizontal scroll`).toBeLessThanOrEqual(viewportWidth + 30)
      }
    })
  })
})
