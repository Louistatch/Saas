import { test, expect } from '@playwright/test'
import { LoginPage } from '../pages/login.page'
import { ACCOUNTS, ROUTES } from '../helpers/constants'

test.describe('Scenario 2: Authentication Flows', () => {
  test('super_admin login redirects to /admin', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.login(ACCOUNTS.superAdmin.email, ACCOUNTS.superAdmin.password)
    await loginPage.expectRedirectTo('/admin')
  })

  test('cooperative_admin login redirects to /dashboard', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.login(ACCOUNTS.coopAdmin.email, ACCOUNTS.coopAdmin.password)
    await loginPage.expectRedirectTo('/dashboard')
  })

  test('member login redirects to /dashboard', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.login(ACCOUNTS.member.email, ACCOUNTS.member.password)
    await loginPage.expectRedirectTo('/dashboard')
  })

  test('invalid credentials show error message', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.login('invalid@example.com', 'WrongPassword123!')

    await loginPage.expectError()
    // Should still be on login page
    await expect(page).toHaveURL(/\/auth\/login/)
  })

  test('empty form submission shows validation errors', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()

    // Submit empty form
    await loginPage.submitButton.click()

    // Should show field-level validation errors
    await expect(page.locator('.text-destructive')).toBeVisible()
  })

  test('logout clears session and redirects to login', async ({ browser }) => {
    // Create a fresh context with coop admin auth
    const context = await browser.newContext({
      storageState: `e2e/.auth/coop-admin.json`,
    })
    const page = await context.newPage()

    // Navigate to signout
    await page.goto(ROUTES.signout)

    // Should eventually redirect to login or home
    await page.waitForURL(/\/(auth\/login|$)/, { timeout: 15_000 })

    // Verify session is cleared by trying to access dashboard
    await page.goto(ROUTES.dashboard)
    // Should be redirected to login
    await expect(page).toHaveURL(/\/auth\/login/)

    await context.close()
  })

  test('unauthenticated access to /dashboard redirects to login', async ({ browser }) => {
    // Fresh context with no auth
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto(ROUTES.dashboard)
    await page.waitForURL(/\/auth\/login/, { timeout: 15_000 })
    await expect(page).toHaveURL(/\/auth\/login/)

    await context.close()
  })

  test('unauthenticated access to /admin redirects to login', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto(ROUTES.admin)
    await page.waitForURL(/\/auth\/login/, { timeout: 15_000 })
    await expect(page).toHaveURL(/\/auth\/login/)

    await context.close()
  })

  test('cooperative_admin cannot access /admin routes', async ({ browser }) => {
    const context = await browser.newContext({
      storageState: 'e2e/.auth/coop-admin.json',
    })
    const page = await context.newPage()

    await page.goto(ROUTES.admin)

    // Should be redirected away from admin or see access denied
    await page.waitForTimeout(3000)
    const url = page.url()
    const isBlocked = !url.includes('/admin') || 
      await page.getByText(/accès refusé|non autorisé|unauthorized/i).isVisible().catch(() => false)

    expect(isBlocked, 'cooperative_admin should not access /admin').toBeTruthy()

    await context.close()
  })
})
