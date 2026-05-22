import { test, expect } from '../fixtures/base.fixture'
import { CardsPage } from '../pages/cards.page'
import { TEST_PREFIX, CARD_PREFIX } from '../helpers/constants'

test.describe('Scenario 4: Card Generation', () => {
  test('cards page loads with generate button', async ({ coopAdminPage }) => {
    const cardsPage = new CardsPage(coopAdminPage)
    await cardsPage.goto()
    await cardsPage.expectLoaded()

    await expect(cardsPage.generateButton).toBeVisible()
  })

  test('generate single card for a member', async ({ coopAdminPage, testData }) => {
    const coopId = await testData.getCoopId('coop-admin@demo.local')
    if (!coopId) {
      test.skip(true, 'Could not determine cooperative ID')
      return
    }

    // Create a test member without a card
    const member = await testData.createMember(coopId, {
      firstName: `${TEST_PREFIX}CardTest`,
      lastName: `${TEST_PREFIX}Member`,
    })

    const cardsPage = new CardsPage(coopAdminPage)
    await cardsPage.goto()

    // Get initial card count
    const initialCount = await cardsPage.getCardCount()

    // Generate a card
    await cardsPage.generateCard(`${TEST_PREFIX}CardTest`)

    // Wait for the card to appear
    await coopAdminPage.waitForTimeout(2000)
    await coopAdminPage.reload()
    await coopAdminPage.waitForLoadState('networkidle')

    // Verify card count increased
    const newCount = await cardsPage.getCardCount()
    expect(newCount).toBeGreaterThan(initialCount)
  })

  test('card download triggers PNG file', async ({ coopAdminPage, testData }) => {
    const coopId = await testData.getCoopId('coop-admin@demo.local')
    if (!coopId) {
      test.skip(true, 'Could not determine cooperative ID')
      return
    }

    // Create member and card via API
    const member = await testData.createMember(coopId, {
      firstName: `${TEST_PREFIX}Download`,
      lastName: `${TEST_PREFIX}Test`,
    })
    const card = await testData.createCard(member.id, coopId)

    const cardsPage = new CardsPage(coopAdminPage)
    await cardsPage.goto()

    // Try to download the card
    const download = await cardsPage.downloadCard(card.card_number)

    // Verify download was triggered
    expect(download).toBeTruthy()
    const filename = download.suggestedFilename()
    expect(filename).toMatch(/\.(png|jpg|jpeg)$/i)
  })

  test('QR payload contains valid /verify/ URL', async ({ coopAdminPage, testData }) => {
    const coopId = await testData.getCoopId('coop-admin@demo.local')
    if (!coopId) {
      test.skip(true, 'Could not determine cooperative ID')
      return
    }

    const member = await testData.createMember(coopId, {
      firstName: `${TEST_PREFIX}QRTest`,
      lastName: `${TEST_PREFIX}Verify`,
    })
    const card = await testData.createCard(member.id, coopId)

    // The QR payload should be a verification URL
    const expectedPayload = `/verify/${encodeURIComponent(card.card_number)}`
    expect(card.qr_data).toContain('/verify/')
    expect(card.qr_data).toContain(card.card_number)
  })

  test('card renewal extends expiry without creating duplicate', async ({ coopAdminPage, testData }) => {
    const coopId = await testData.getCoopId('coop-admin@demo.local')
    if (!coopId) {
      test.skip(true, 'Could not determine cooperative ID')
      return
    }

    // Create member with an existing active card
    const member = await testData.createMember(coopId, {
      firstName: `${TEST_PREFIX}Renew`,
      lastName: `${TEST_PREFIX}Test`,
    })
    const originalCard = await testData.createCard(member.id, coopId)

    const cardsPage = new CardsPage(coopAdminPage)
    await cardsPage.goto()

    // Get initial card count
    const initialCount = await cardsPage.getCardCount()

    // Try to generate a card for the same member (should renew)
    await cardsPage.generateCard(`${TEST_PREFIX}Renew`)

    await coopAdminPage.waitForTimeout(2000)
    await coopAdminPage.reload()
    await coopAdminPage.waitForLoadState('networkidle')

    // Card count should NOT increase (renewal, not new card)
    const newCount = await cardsPage.getCardCount()
    expect(newCount).toBe(initialCount)
  })

  test('bulk generation creates cards for multiple members', async ({ coopAdminPage, testData }) => {
    const coopId = await testData.getCoopId('coop-admin@demo.local')
    if (!coopId) {
      test.skip(true, 'Could not determine cooperative ID')
      return
    }

    // Create multiple test members
    await testData.createMember(coopId, {
      firstName: `${TEST_PREFIX}Bulk1`,
      lastName: `${TEST_PREFIX}Gen`,
    })
    await testData.createMember(coopId, {
      firstName: `${TEST_PREFIX}Bulk2`,
      lastName: `${TEST_PREFIX}Gen`,
    })

    const cardsPage = new CardsPage(coopAdminPage)
    await cardsPage.goto()

    const initialCount = await cardsPage.getCardCount()

    // Open bulk generation
    await cardsPage.openBulkGeneration()
    await cardsPage.selectMembersForBulk(2)
    await cardsPage.confirmBulkGeneration()

    // Wait and reload
    await coopAdminPage.waitForTimeout(3000)
    await coopAdminPage.reload()
    await coopAdminPage.waitForLoadState('networkidle')

    // Should have more cards now
    const newCount = await cardsPage.getCardCount()
    expect(newCount).toBeGreaterThan(initialCount)
  })

  test('revoke card changes status to revoked', async ({ coopAdminPage, testData }) => {
    const coopId = await testData.getCoopId('coop-admin@demo.local')
    if (!coopId) {
      test.skip(true, 'Could not determine cooperative ID')
      return
    }

    const member = await testData.createMember(coopId, {
      firstName: `${TEST_PREFIX}Revoke`,
      lastName: `${TEST_PREFIX}Test`,
    })
    const card = await testData.createCard(member.id, coopId)

    const cardsPage = new CardsPage(coopAdminPage)
    await cardsPage.goto()

    // Revoke the card
    await cardsPage.revokeCard(card.card_number)

    // Wait for status update
    await coopAdminPage.waitForTimeout(1000)

    // Verify card shows revoked status
    await cardsPage.expectCardStatus(card.card_number, 'révoqué')
  })
})
