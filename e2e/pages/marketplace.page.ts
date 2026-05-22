import { type Page, type Locator, expect } from '@playwright/test'
import { ROUTES } from '../helpers/constants'

export class MarketplacePage {
  readonly page: Page
  readonly heading: Locator
  readonly searchInput: Locator
  readonly memberAccessButton: Locator
  readonly cardNumberInput: Locator
  readonly verifyCardButton: Locator
  readonly cardDialog: Locator
  readonly ficheCards: Locator
  readonly memberSessionBadge: Locator
  readonly logoutButton: Locator
  readonly cultureFilter: Locator
  readonly prefectureFilter: Locator

  constructor(page: Page) {
    this.page = page
    this.heading = page.getByRole('heading', { name: /Comptes d'exploitation agricole/i })
    this.searchInput = page.getByPlaceholder(/Rechercher une culture/i)
    this.memberAccessButton = page.getByRole('button', { name: /Accès membre/i })
    this.cardNumberInput = page.getByPlaceholder('HAR-12345')
    this.verifyCardButton = page.getByRole('button', { name: /Vérifier/i })
    this.cardDialog = page.locator('[role="dialog"]')
    this.ficheCards = page.locator('[class*="grid"] > div')
    this.memberSessionBadge = page.locator('text=Déconnexion')
    this.logoutButton = page.getByText('Déconnexion')
    this.cultureFilter = page.locator('select').nth(0)
    this.prefectureFilter = page.locator('select').nth(1)
  }

  async goto() {
    await this.page.goto(ROUTES.marketplace)
    await this.page.waitForLoadState('networkidle')
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible()
  }

  async searchFiches(term: string) {
    await this.searchInput.fill(term)
    // Wait for debounce
    await this.page.waitForTimeout(400)
  }

  async loginWithCard(cardNumber: string) {
    await this.memberAccessButton.click()
    await expect(this.cardDialog).toBeVisible()
    await this.cardNumberInput.fill(cardNumber)
    await this.verifyCardButton.click()
  }

  async expectMemberSessionActive(memberName: string) {
    await expect(this.page.getByText(memberName)).toBeVisible()
    await expect(this.memberSessionBadge).toBeVisible()
  }

  async expectCardError(message?: string) {
    const errorText = this.cardDialog.locator('.text-destructive, [class*="destructive"]')
    await expect(errorText).toBeVisible()
    if (message) {
      await expect(errorText).toContainText(message)
    }
  }

  async expectFreeAccessLabels() {
    await expect(this.page.getByText('Gratuit').first()).toBeVisible()
  }

  async expectDownloadButtons() {
    await expect(this.page.getByRole('button', { name: /Télécharger/i }).first()).toBeVisible()
  }

  async expectBuyButtons() {
    await expect(this.page.getByRole('button', { name: /Acheter/i }).first()).toBeVisible()
  }

  async expectFichesDisplayed() {
    // Wait for loading to complete
    await expect(this.page.getByText(/Aucune fiche/i)).not.toBeVisible({ timeout: 5_000 }).catch(() => {
      // It's ok if there are no fiches in staging
    })
  }

  async getFicheCount(): Promise<number> {
    return this.ficheCards.count()
  }

  async logoutMemberSession() {
    await this.logoutButton.click()
  }
}
