import { type Page, type Locator, expect } from '@playwright/test'
import { ROUTES } from '../helpers/constants'

export class LoginPage {
  readonly page: Page
  readonly emailInput: Locator
  readonly passwordInput: Locator
  readonly submitButton: Locator
  readonly errorAlert: Locator
  readonly showPasswordButton: Locator

  constructor(page: Page) {
    this.page = page
    this.emailInput = page.getByLabel('Adresse email')
    this.passwordInput = page.getByLabel('Mot de passe')
    this.submitButton = page.getByRole('button', { name: 'Se connecter' })
    this.errorAlert = page.locator('[role="alert"]')
    this.showPasswordButton = page.getByLabel(/Afficher le mot de passe|Masquer le mot de passe/)
  }

  async goto() {
    await this.page.goto(ROUTES.login)
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email)
    await this.passwordInput.fill(password)
    await this.submitButton.click()
  }

  async expectFormVisible() {
    await expect(this.emailInput).toBeVisible()
    await expect(this.passwordInput).toBeVisible()
    await expect(this.submitButton).toBeVisible()
  }

  async expectError(message?: string) {
    await expect(this.errorAlert).toBeVisible()
    if (message) {
      await expect(this.errorAlert).toContainText(message)
    }
  }

  async expectNoError() {
    await expect(this.errorAlert).not.toBeVisible()
  }

  async expectRedirectTo(path: string) {
    await this.page.waitForURL(`**${path}**`, { timeout: 30_000 })
    expect(this.page.url()).toContain(path)
  }
}
