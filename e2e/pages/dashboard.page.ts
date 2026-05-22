import { type Page, type Locator, expect } from '@playwright/test'
import { ROUTES } from '../helpers/constants'

export class DashboardPage {
  readonly page: Page
  readonly heading: Locator
  readonly sidebar: Locator
  readonly membersLink: Locator
  readonly cardsLink: Locator
  readonly marketplaceLink: Locator

  constructor(page: Page) {
    this.page = page
    this.heading = page.locator('h1, h2').first()
    this.sidebar = page.locator('nav, aside').first()
    this.membersLink = page.getByRole('link', { name: /Membres/i })
    this.cardsLink = page.getByRole('link', { name: /Cartes/i })
    this.marketplaceLink = page.getByRole('link', { name: /Marketplace|Comptes/i })
  }

  async goto() {
    await this.page.goto(ROUTES.dashboard)
  }

  async expectLoaded() {
    await this.page.waitForURL(`**${ROUTES.dashboard}**`)
    await expect(this.page).not.toHaveURL(/\/auth\/login/)
  }

  async navigateToMembers() {
    await this.membersLink.click()
    await this.page.waitForURL(`**${ROUTES.dashboardMembers}**`)
  }

  async navigateToCards() {
    await this.cardsLink.click()
    await this.page.waitForURL(`**${ROUTES.dashboardCards}**`)
  }

  async navigateToMarketplace() {
    await this.marketplaceLink.click()
    await this.page.waitForURL(`**${ROUTES.dashboardMarketplace}**`)
  }
}
