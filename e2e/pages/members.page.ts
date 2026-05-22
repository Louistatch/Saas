import { type Page, type Locator, expect } from '@playwright/test'
import { ROUTES } from '../helpers/constants'

export class MembersPage {
  readonly page: Page
  readonly addButton: Locator
  readonly searchInput: Locator
  readonly membersTable: Locator
  readonly memberRows: Locator
  readonly dialog: Locator
  readonly firstNameInput: Locator
  readonly lastNameInput: Locator
  readonly emailInput: Locator
  readonly phoneInput: Locator
  readonly saveButton: Locator
  readonly cancelButton: Locator

  constructor(page: Page) {
    this.page = page
    this.addButton = page.getByRole('button', { name: /Ajouter un membre|Ajouter le premier membre/i })
    this.searchInput = page.getByLabel('Rechercher des membres')
    this.membersTable = page.locator('table')
    this.memberRows = page.locator('table tbody tr')
    this.dialog = page.locator('[role="dialog"]')
    this.firstNameInput = page.getByPlaceholder('Jean')
    this.lastNameInput = page.getByPlaceholder('Dupont')
    this.emailInput = page.getByPlaceholder('jean@example.com')
    this.phoneInput = page.getByPlaceholder('+228 90 12 34 56')
    this.saveButton = page.getByRole('button', { name: /Ajouter le membre|Enregistrer/i })
    this.cancelButton = page.getByRole('button', { name: 'Annuler' })
  }

  async goto() {
    await this.page.goto(ROUTES.dashboardMembers)
    await this.page.waitForLoadState('networkidle')
  }

  async expectLoaded() {
    await expect(this.page.getByText('Membres')).toBeVisible()
  }

  async addMember(data: { firstName: string; lastName: string; email?: string; phone?: string }) {
    await this.addButton.click()
    await expect(this.dialog).toBeVisible()

    await this.firstNameInput.fill(data.firstName)
    await this.lastNameInput.fill(data.lastName)
    if (data.email) await this.emailInput.fill(data.email)
    if (data.phone) await this.phoneInput.fill(data.phone)

    await this.saveButton.click()
    await expect(this.dialog).not.toBeVisible({ timeout: 10_000 })
  }

  async editMember(currentName: string, newData: { firstName?: string; lastName?: string }) {
    const row = this.page.locator('tr', { hasText: currentName })
    await row.getByLabel(/Modifier/i).click()
    await expect(this.dialog).toBeVisible()

    if (newData.firstName) {
      await this.firstNameInput.clear()
      await this.firstNameInput.fill(newData.firstName)
    }
    if (newData.lastName) {
      await this.lastNameInput.clear()
      await this.lastNameInput.fill(newData.lastName)
    }

    await this.saveButton.click()
    await expect(this.dialog).not.toBeVisible({ timeout: 10_000 })
  }

  async deleteMember(name: string) {
    const row = this.page.locator('tr', { hasText: name })
    await row.getByLabel(/Delete/i).click()

    // Confirm deletion dialog
    const confirmButton = this.page.getByRole('button', { name: 'Supprimer' })
    await confirmButton.click()
  }

  async searchMembers(term: string) {
    await this.searchInput.fill(term)
    // Wait for debounce
    await this.page.waitForTimeout(300)
  }

  async getMemberNames(): Promise<string[]> {
    const cells = this.page.locator('table tbody tr td:first-child')
    return cells.allTextContents()
  }

  async getMemberCount(): Promise<number> {
    const rows = await this.memberRows.count()
    return rows
  }

  async expectMemberVisible(name: string) {
    await expect(this.page.locator('tr', { hasText: name })).toBeVisible()
  }

  async expectMemberNotVisible(name: string) {
    await expect(this.page.locator('tr', { hasText: name })).not.toBeVisible()
  }

  async expectEmptyState() {
    await expect(this.page.getByText(/Aucun membre/i)).toBeVisible()
  }

  async openLocationPicker() {
    // The LocationPicker is inside the add/edit dialog
    // It has cascading selects for region, prefecture, canton, village
    return {
      regionSelect: this.dialog.locator('select').nth(0),
      prefectureSelect: this.dialog.locator('select').nth(1),
      cantonSelect: this.dialog.locator('select').nth(2),
      villageSelect: this.dialog.locator('select').nth(3),
    }
  }
}
