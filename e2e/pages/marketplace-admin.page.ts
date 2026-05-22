import { type Page, type Locator, expect } from '@playwright/test'
import { ROUTES } from '../helpers/constants'

export class MarketplaceAdminPage {
  readonly page: Page
  readonly newFicheButton: Locator
  readonly fichesList: Locator
  readonly searchInput: Locator
  readonly dialog: Locator

  constructor(page: Page) {
    this.page = page
    this.newFicheButton = page.getByRole('button', { name: /Nouvelle fiche/i })
    this.fichesList = page.locator('[class*="space-y"] > div')
    this.searchInput = page.getByPlaceholder(/Rechercher par titre/i)
    this.dialog = page.locator('[role="dialog"]')
  }

  async goto() {
    await this.page.goto(ROUTES.dashboardMarketplace)
    await this.page.waitForLoadState('networkidle')
  }

  async expectLoaded() {
    await expect(this.page.getByText("Comptes d'exploitation")).toBeVisible()
  }

  async expectNewFicheButtonVisible() {
    await expect(this.newFicheButton).toBeVisible()
  }

  async expectNewFicheButtonNotVisible() {
    await expect(this.newFicheButton).not.toBeVisible()
  }

  async openNewFicheDialog() {
    await this.newFicheButton.click()
    await expect(this.dialog).toBeVisible()
  }
}
