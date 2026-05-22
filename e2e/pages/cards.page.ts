import { type Page, type Locator, expect } from '@playwright/test'
import { ROUTES } from '../helpers/constants'

export class CardsPage {
  readonly page: Page
  readonly generateButton: Locator
  readonly bulkGenerateButton: Locator
  readonly downloadAllButton: Locator
  readonly searchInput: Locator
  readonly cardsTable: Locator
  readonly cardRows: Locator
  readonly generateDialog: Locator
  readonly bulkDialog: Locator
  readonly memberSelect: Locator
  readonly confirmGenerateButton: Locator

  constructor(page: Page) {
    this.page = page
    this.generateButton = page.getByRole('button', { name: /Générer une carte|Générer la première carte/i })
    this.bulkGenerateButton = page.getByRole('button', { name: /Génération en masse/i })
    this.downloadAllButton = page.getByRole('button', { name: /Tout télécharger/i })
    this.searchInput = page.getByLabel('Rechercher des cartes')
    this.cardsTable = page.locator('table')
    this.cardRows = page.locator('table tbody tr')
    this.generateDialog = page.locator('[role="dialog"]')
    this.bulkDialog = page.locator('[role="dialog"]')
    this.memberSelect = page.locator('[role="dialog"] select').first()
    this.confirmGenerateButton = page.locator('[role="dialog"]').getByRole('button', { name: /Générer/i })
  }

  async goto() {
    await this.page.goto(ROUTES.dashboardCards)
    await this.page.waitForLoadState('networkidle')
  }

  async expectLoaded() {
    await expect(this.page.getByText('Cartes membres')).toBeVisible()
  }

  async generateCard(memberName?: string) {
    await this.generateButton.click()
    await expect(this.generateDialog).toBeVisible()

    // Select a member from the dropdown
    if (memberName) {
      const options = await this.memberSelect.locator('option').allTextContents()
      const matchingOption = options.find(o => o.includes(memberName))
      if (matchingOption) {
        await this.memberSelect.selectOption({ label: matchingOption })
      }
    } else {
      // Select first available member
      const options = await this.memberSelect.locator('option').allTextContents()
      const validOption = options.find(o => o !== '— Choisir —' && o !== '')
      if (validOption) {
        await this.memberSelect.selectOption({ label: validOption })
      }
    }

    await this.confirmGenerateButton.click()
    await expect(this.generateDialog).not.toBeVisible({ timeout: 15_000 })
  }

  async downloadCard(cardNumber: string) {
    const row = this.page.locator('tr', { hasText: cardNumber })
    const downloadButton = row.getByLabel(/Download/i)
    
    // Listen for download event
    const downloadPromise = this.page.waitForEvent('download', { timeout: 15_000 })
    await downloadButton.click()
    return downloadPromise
  }

  async revokeCard(cardNumber: string) {
    const row = this.page.locator('tr', { hasText: cardNumber })
    await row.getByLabel(/Revoke/i).click()

    // Confirm revocation
    const confirmButton = this.page.getByRole('button', { name: 'Révoquer' })
    await confirmButton.click()
  }

  async openBulkGeneration() {
    await this.bulkGenerateButton.click()
    await expect(this.bulkDialog).toBeVisible()
  }

  async selectMembersForBulk(count: number) {
    const checkboxes = this.bulkDialog.locator('[role="checkbox"], input[type="checkbox"]')
    const available = await checkboxes.count()
    const toSelect = Math.min(count, available)

    for (let i = 0; i < toSelect; i++) {
      await checkboxes.nth(i).click()
    }
  }

  async confirmBulkGeneration() {
    const bulkConfirm = this.bulkDialog.getByRole('button', { name: /Générer/i })
    await bulkConfirm.click()
    await expect(this.bulkDialog).not.toBeVisible({ timeout: 30_000 })
  }

  async getCardNumbers(): Promise<string[]> {
    const cells = this.page.locator('table tbody tr td:nth-child(2)')
    return cells.allTextContents()
  }

  async getCardCount(): Promise<number> {
    return this.cardRows.count()
  }

  async expectCardVisible(cardNumber: string) {
    await expect(this.page.locator('tr', { hasText: cardNumber })).toBeVisible()
  }

  async expectCardStatus(cardNumber: string, status: string | RegExp) {
    const row = this.page.locator('tr', { hasText: cardNumber })
    if (typeof status === 'string') {
      await expect(row).toContainText(status)
    } else {
      await expect(row).toContainText(status)
    }
  }

  async getQrPayloadForCard(cardNumber: string): Promise<string> {
    // The QR payload is the verification URL
    return `/verify/${encodeURIComponent(cardNumber)}`
  }
}
