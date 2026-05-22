import { type Page, type Locator, expect } from '@playwright/test'
import { ROUTES } from '../helpers/constants'

export class VerifyPage {
  readonly page: Page
  readonly loadingSpinner: Locator
  readonly loadingText: Locator
  readonly statusBadge: Locator
  readonly memberName: Locator
  readonly cardNumber: Locator
  readonly errorMessage: Locator
  readonly cooperativeName: Locator
  readonly localityInfo: Locator
  readonly phoneInfo: Locator
  readonly cotisationsSection: Locator
  readonly validitySection: Locator

  constructor(page: Page) {
    this.page = page
    this.loadingSpinner = page.locator('.animate-spin')
    this.loadingText = page.getByText('Vérification en cours...')
    this.statusBadge = page.locator('[class*="rounded-full"][class*="font-semibold"]')
    this.memberName = page.locator('h2')
    this.cardNumber = page.locator('.font-mono')
    this.errorMessage = page.getByText(/Carte non trouvée|n'existe pas/)
    this.cooperativeName = page.getByText(/Coopérative/i).locator('..')
    this.localityInfo = page.locator('text=Localité').locator('..')
    this.phoneInfo = page.locator('text=Téléphone').locator('..')
    this.cotisationsSection = page.getByText('Cotisations').locator('..')
    this.validitySection = page.getByText(/Valide jusqu/i).locator('..')
  }

  async goto(cardNumber: string) {
    await this.page.goto(ROUTES.verify(cardNumber))
  }

  async expectLoading() {
    await expect(this.loadingSpinner).toBeVisible()
    await expect(this.loadingText).toBeVisible()
  }

  async waitForResult() {
    await expect(this.loadingSpinner).not.toBeVisible({ timeout: 15_000 })
  }

  async expectValid() {
    await this.waitForResult()
    await expect(this.page.getByText('MEMBRE VÉRIFIÉ')).toBeVisible()
  }

  async expectInvalid() {
    await this.waitForResult()
    await expect(this.page.getByText('CARTE INVALIDE')).toBeVisible()
  }

  async expectExpired() {
    await this.waitForResult()
    await expect(this.page.getByText('CARTE EXPIRÉE')).toBeVisible()
  }

  async expectMemberName(name: string) {
    await expect(this.memberName).toContainText(name)
  }

  async expectCardNumber(number: string) {
    await expect(this.page.getByText(number)).toBeVisible()
  }

  async expectErrorMessage(message: string) {
    await expect(this.page.getByText(message)).toBeVisible()
  }

  async expectCooperativeDisplayed() {
    const coopSection = this.page.locator('text=Coopérative').locator('..')
    await expect(coopSection).toBeVisible()
  }

  async expectLocalityDisplayed() {
    const localitySection = this.page.locator('text=Localité').locator('..')
    await expect(localitySection).toBeVisible()
  }

  async expectPhoneDisplayed() {
    const phoneSection = this.page.locator('text=Téléphone').locator('..')
    await expect(phoneSection).toBeVisible()
  }

  async expectCotisationsDisplayed() {
    await expect(this.cotisationsSection).toBeVisible()
  }

  async expectNoHorizontalScroll() {
    const bodyWidth = await this.page.evaluate(() => document.body.scrollWidth)
    const viewportWidth = await this.page.evaluate(() => window.innerWidth)
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1) // +1 for rounding
  }

  async expectFaîtiereHubBranding() {
    await expect(this.page.getByText('FaîtiereHub')).toBeVisible()
  }
}
